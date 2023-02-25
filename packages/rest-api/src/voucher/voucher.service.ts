import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { abi as NusaNFTAbi } from '../abi/NusaNFT.json';
import { MerkleTree } from 'merkletreejs';
import { PrismaService } from '../prisma/prisma.service';
import keccak256 from 'keccak256';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { ClaimDTO, CreateNftDTO, RegisterDTO } from './voucher.dto';
import AsyncLock from 'async-lock';
import { BlockchainTxPayload } from '../interfaces';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
@Processor('blockchain-tx')
export class VoucherService {
  private merkleTrees = {};
  private provider: ethers.providers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private nusaNFT = null;
  private nusaNFTInterface: ethers.utils.Interface;
  private walletLock: AsyncLock;
  private nonce: number;
  private logger = new Logger(VoucherService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('blockchain-tx') private blockchainTxQueue: Queue,
  ) {
    this.provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);

    this.wallet = new ethers.Wallet(
      process.env.NFT_CONTRACT_OWNER_PRIVATE_KEY,
      this.provider,
    );

    this.nusaNFT = new ethers.Contract(
      process.env.NFT_CONTRACT_ADDRESS,
      NusaNFTAbi,
      this.wallet,
    );

    this.walletLock = new AsyncLock();

    this.nusaNFTInterface = new ethers.utils.Interface([
      'event TokenCreated(uint256 indexed tokenId)',
      'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
    ]);
  }

  async queueCreateNft(param: CreateNftDTO) {
    const { toAddress, tokenURI, voucherRootHash, voucherHashes, itemUuid } = param;
    const payload: BlockchainTxPayload = {
      method: 'create',
      args: [toAddress, tokenURI],
      extraData: {
        voucherHashes,
        voucherRootHash,
        itemUuid
      },
    };

    const job = await this.blockchainTxQueue.add('create-nft', payload, { attempts: 3 });
    return job;
  }

  async queueClaimNft(param: ClaimDTO) {
    const { toAddress, voucher } = param;
    const hash = ethers.utils.solidityKeccak256(['string'], [voucher]);
    const voucherLeaf = await this.prisma.voucherLeaf.findFirst({
      where: { hash },
    });
    if (!voucherLeaf)
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          error: 'voucher not found',
        },
        HttpStatus.NOT_FOUND,
      );
    const voucherLeafs = await this.prisma.voucherLeaf.findMany({
      where: { tokenId: voucherLeaf.tokenId },
      orderBy: { num: 'asc' },
    });
    const leaves = voucherLeafs.map((o) => o.hash);
    const tree = this.getMerkleTree(leaves);
    const rootHash = tree.getHexRoot();
    const proof = tree.getHexProof(hash);
    const payload: BlockchainTxPayload = {
      method: 'claimVoucher',
      args: [voucher, voucherLeaf.tokenId, toAddress, proof],
    };
    const rootHashVoucherRegistered = await this.nusaNFT._rootHashVoucher(voucherLeaf.tokenId);
    console.log({
      voucher,
      hash,
      rootHash,
      rootHashVoucherRegistered
    });
    const isValid = await this.nusaNFT.isValidVoucher(
      voucher,
      voucherLeaf.tokenId,
      proof,
    );
    if (!isValid) {
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          error: 'voucher not valid',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    const job = await this.blockchainTxQueue.add('claim-nft', payload);
    return job;
  }

  /**
   * On success, this function adds a register-voucher job to the queue
   * 
   * @param job create NFT Job Payload
   */
  @Process('create-nft')
  async processCreateNft(job: Job<BlockchainTxPayload>) {
    await this.processJobWithWallet('create-nft', job, async (txReceipt) => {
      const { logs } = txReceipt;
      if (logs.length == 0) throw new Error('create-nft job failed. no logs');

      const event = this.nusaNFTInterface.parseLog(logs[0]);
      if (event.name == 'TokenCreated') {
        const tokenId = event.args[0].toNumber();
        const {
          voucherRootHash,
          voucherHashes,
          itemUuid
        } = job.data.extraData;

        await this.updateItemTokenId(itemUuid, tokenId);
        const payload: BlockchainTxPayload = {
          method: 'registerVoucher',
          args: [tokenId, voucherRootHash],
          extraData: {
            leaves: voucherHashes,
            itemUuid: itemUuid,
          }
        }
        await this.blockchainTxQueue.add('register-voucher', payload, { attempts: 3 });
      }
    });
  }

  @Process('register-voucher')
  async processRegisterVoucher(job: Job<BlockchainTxPayload>) {
    const tokenId = job.data.args[0];
    const leaves = job.data.extraData.leaves;
    const itemUuid = job.data.extraData.itemUuid;
    const creator = await this.nusaNFT.creator(tokenId);
    if (creator != '0x0000000000000000000000000000000000000000')
      this.registerVoucherToDB(tokenId, leaves, itemUuid)
        .then((res) => {
          console.log('register-voucher');
          console.log({ 'job.data.method': job.data.method, 'job.data.args': job.data.args });
          this.processJobWithWallet('register-voucher', job);
        })
        .catch((e) => {
          console.log(e);
        });
  }

  @Process('claim-nft')
  async processClaimVoucher(job: Job<BlockchainTxPayload>) {
    this.processJobWithWallet('claim-nft', job, async (txReceipt) => {
      const { logs } = txReceipt;
      if (logs.length == 0) throw new Error('claim-nft job failed. no logs');
      const event = this.nusaNFTInterface.parseLog(logs[0]);
      if (event.name == 'TransferSingle') {
        // const operator = event.args[0];
        // const from = event.args[1];
        // const to = event.args[2];
        const tokenId = event.args[3].toString();
        const value = event.args[4].toNumber();
        await this.prisma.item.updateMany({
          where: {
            contract_address: process.env.NFT_CONTRACT_ADDRESS,
            chainId: Number(process.env.CHAIN_ID),
            tokenId
          },
          data: {
            quantity_minted: { increment: value }
          }
        })
        await job.progress(200);
      }
    });
  }

  processJobWithWallet(
    jobName: string,
    job: Job<BlockchainTxPayload>,
    callback?: (txReceipt: ethers.providers.TransactionReceipt) => any,
  ) {
    return new Promise((resolve) => {
      this.walletLock
        .acquire('wallet-lock', async () => {
          let nonce = await this.provider.getTransactionCount(
            this.wallet.address,
          );
          this.nonce = this.nonce > nonce ? this.nonce : nonce;
          nonce = this.nonce;
          this.logger.log(`Sending TX Nonce:${nonce}`);
          this.nusaNFT[job.data.method](...job.data.args, { nonce })
            .then(async (tx: ethers.providers.TransactionResponse) => {
              try {
                this.logger.log(`processing ${jobName}`, { tx });
                const minedTx: ethers.providers.TransactionReceipt =
                  await this.provider.waitForTransaction(tx.hash);
                this.logger.log('transaction processed', job, minedTx);
                await job.progress(100);
                if (callback) {
                  callback(minedTx);
                }
              } catch (error) {
                this.logger.error(error);
                throw new Error(error);
              }
            })
            .catch(async (error: any) => {
              this.logger.error(error, 'Requeuing');
              // this.blockchainTxQueue.add(jobName, job.data);
              throw new Error(error);
            });
          this.nonce++;
        })
        .then(() => {
          // Lock Released
          resolve(true);
        })
        .catch((err) => {
          this.logger.error(err);
          // this.logger.error(err, 'Requeuing');
          // this.blockchainTxQueue.add(jobName, job.data);
          resolve(true);
          throw new Error(err);
        });
    });
  }

  async registerVoucherToDB(tokenId: number, leafs: string[], itemUuid: string): Promise<any> {
    await this.prisma.voucher.deleteMany({ where: { tokenId } });
    await this.prisma.voucherLeaf.deleteMany({ where: { tokenId } });
    const tree = this.getMerkleTree(leafs);
    const rootHash = `${tree.getHexRoot()}`;

    let isValid = true;
    for (let i = 0; i < leafs.length; i++) {
      const dbLeafs = await this.prisma.voucherLeaf.findMany({
        where: { hash: leafs[i] },
      });
      if (dbLeafs.length > 0) isValid = false;
    }

    if (!isValid) {
      throw new HttpException('duplicate voucher', HttpStatus.CONFLICT);
    }

    await this.prisma.voucher.create({
      data: {
        tokenId,
        rootHash,
        itemUuid
      },
    });

    for (let i = 0; i < leafs.length; i++) {
      await this.prisma.voucherLeaf.create({
        data: {
          hash: leafs[i],
          num: i,
          tokenId: tokenId,
          itemUuid
        },
      });
    }
    const voucher = await this.prisma.voucher.findFirst({
      where: {
        id: tokenId,
      },
    });
    return {
      voucher,
      leafs: await this.prisma.voucherLeaf.findMany({
        where: { tokenId },
        orderBy: { num: 'asc' },
      }),
    };
  }

  async updateItemTokenId(itemUuid: string, tokenId: number) {
    await this.prisma.item.updateMany({
      where: { uuid: itemUuid },
      data: {
        tokenId: tokenId.toString(),
      }
    })
  }

  async ownerContract(): Promise<string> {
    return this.nusaNFT.owner();
  }

  async getCreator(tokenId: string): Promise<string> {
    return this.nusaNFT.creator(tokenId);
  }

  getMerkleTree(leaves: string[]): MerkleTree {
    return new MerkleTree(leaves, ethers.utils.keccak256, { sortPairs: true });
  }

  async createVoucher(vouchers: string[]): Promise<any> {
    const leaves = vouchers.map((v) => {
      return ethers.utils.solidityKeccak256(['string'], [v]);
    });
    const tree = this.getMerkleTree(leaves);
    const rootHash = tree.getHexRoot();
    return {
      vouchers,
      leaves,
      rootHash,
    };
  }

  async check(tokenId: number, voucher: string): Promise<any> {
    const hash = ethers.utils.solidityKeccak256(['string'], [voucher]);
    const voucherLeaf = await this.prisma.voucherLeaf.findFirst({
      where: { hash },
    });
    const voucherLeafs = await this.prisma.voucherLeaf.findMany({
      where: { tokenId: voucherLeaf.tokenId },
      orderBy: { num: 'asc' },
    });
    // console.log(this.merkleTrees[tokenId]);
    const merkleTree = this.getMerkleTree(voucherLeafs.map(o => o.hash));
    const proof = merkleTree.getHexProof(hash);
    // return this.merkleTrees[tokenId];
    return this.nusaNFT.isValidVoucher(
      voucher,
      tokenId,
      proof,
    );
  }

  async testGenerateUuid(quantity: number) {
    const uuids = [];
    for (let i = 0; i < quantity; i++) {
      uuids.push(uuidv4());
    }
    return uuids;
  }

  async getItemByVoucher(voucher: string) {
    const leaf = ethers.utils.solidityKeccak256(['string'], [voucher]);
    const voucherLeaf = await this.prisma.voucherLeaf.findFirstOrThrow({ where: { hash: leaf }});
    Logger.log(voucherLeaf);
    const item = await this.prisma.item.findFirstOrThrow({
      where: {
        uuid: voucherLeaf.itemUuid,
        chainId: Number(process.env.CHAIN_ID),
        contract_address: process.env.NFT_CONTRACT_ADDRESS,
      },
      include: {
        Creator: true,
        attributes: true,
        Collection: {
          include: {
            royalty: true
          }
        }
      }
    })

    return {
      ...item,
      creatorEarnings: item.Collection.royalty.reduce(
        (accum, val) => accum + val.percentage,
        0,
      ),
    };
  }

  async getJobStatus(jobId: number) {
    const job = await this.blockchainTxQueue.getJob(jobId);
    return job;
  }
}
