import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { abi as NusaNFTAbi } from '../abi/NusaNFT.json';
import { MerkleTree } from 'merkletreejs';
import { PrismaService } from '../prisma/prisma.service';
import keccak256 from 'keccak256';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { ClaimDTO, CreateDTO, RegisterDTO } from './voucher.dto';
import * as AsyncLock from "async-lock";

@Injectable()
@Processor('blockchain-tx')
export class VoucherService {
  private merkleTrees = {};
  private provider: ethers.providers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private nusaNFT = null;
  private walletLock: AsyncLock;
  private nonce: number;
  private logger = new Logger(VoucherService.name);
  constructor(
    private prisma: PrismaService,
    @InjectQueue('blockchain-tx') private blockchainTxQueue: Queue
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
  }

  async queueRegisterVoucher(param: RegisterDTO) {
    // hash is leaves =)
    const { tokenId, expired, hash } = param;
    const tree = await this.getMerkleTree(hash);
    const rootHash = tree.getHexRoot();

    const payload: BlockchainTxPayload = {
      method: 'registerVoucher',
      args: [tokenId, rootHash],
      extraData: { leaves: hash, exp: expired }
    }

    const job = await this.blockchainTxQueue.add('register-voucher', payload);
    return job;
  }

  async queueCreateNft(param: CreateDTO) {
    const { toAddress, tokenURI } = param;
    const payload: BlockchainTxPayload = {
      method: 'create',
      args: [toAddress, tokenURI]
    }

    const job = await this.blockchainTxQueue.add('create-nft', payload);
    return job;
  }

  async queueClaimNft(param: ClaimDTO) {
    const { signature, toAddress, tokenId, voucher } = param;
    const dbVoucher = await this.prisma.voucher.findFirst({
      where: { id: tokenId },
    });
    if (!dbVoucher) {
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          error: 'Token not have voucher',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    const leaves = dbVoucher.hash.split(',').map((s) => s.trim());
    const tree = await this.getMerkleTree(leaves);
    const hash = ethers.utils.solidityKeccak256(
      ['string', 'uint256', 'uint'],
      [voucher, tokenId, dbVoucher.expTime],
    );
    const proof = tree.getHexProof(hash);
    const payload: BlockchainTxPayload = {
      method: 'claimVoucher',
      args: [
        voucher,
        tokenId,
        dbVoucher.expTime,
        toAddress,
        signature,
        proof
      ]
    }

    const job = await this.blockchainTxQueue.add('claim-nft', payload);
    return job;
  }

  @Process('create-nft')
  async processCreateNft(job: Job<BlockchainTxPayload>) {
    await this.processJobWithWallet('create-nft', job);
  }

  @Process('register-voucher')
  async processRegisterVoucher(job: Job<BlockchainTxPayload>) {
    await this.processJobWithWallet('register-voucher', job, async () => {
      const tokenId = job.data.args[0];
      const leaves = job.data.extraData.leaves;
      const exp = job.data.extraData.exp;
      await this.registerVoucherToDB(tokenId, exp, leaves);
    });
  }

  processJobWithWallet(jobName: string, job: Job<BlockchainTxPayload>, callback?: Function) {
    return new Promise((resolve) => {
      this.walletLock.acquire('wallet-lock', async () => {
        let nonce = await this.provider.getTransactionCount(this.wallet.address);
        this.nonce = this.nonce > nonce ? this.nonce : nonce;
        nonce = this.nonce;
        this.logger.log(`Sending TX Nonce:${nonce}`);
        this.nusaNFT[job.data.method](...job.data.args, { nonce })
          .then(async (tx: ethers.providers.TransactionResponse) => {
            try {
              this.logger.log(`processing ${jobName}`, { tx });
              const minedTx: ethers.providers.TransactionReceipt =
                await this.provider.waitForTransaction(tx.hash)
              this.logger.log('transaction processed', job, minedTx)
              if (callback) {
                callback();
              }
            } catch (err) {
              this.logger.error(err)
            }
          })
          .catch(async (error: any) => {
            this.logger.error(error, 'Requeuing')
            this.blockchainTxQueue.add(jobName, job.data);
          })
        this.nonce++;
      })
      .then(() => {
        // Lock Released
        resolve(true);
      })
      .catch(err => {
        this.logger.error(err, 'Requeuing')
        this.blockchainTxQueue.add(jobName, job.data);
        resolve(true);
      })
    })
  }

  async registerVoucherToDB(
    tokenId: number,
    exp: number,
    leaves: string[],
  ): Promise<any> {
    const tree = await this.getMerkleTree(leaves);
    const rootHash = tree.getHexRoot();
    let strHash = '';
    for (const leave of leaves) strHash += ',' + leave;
    if (strHash != '') strHash = strHash.substring(1);
    this.merkleTrees[tokenId] = {
      tokenId,
      exp,
      leaves,
      rootHash,
    };
    const voucher = await this.prisma.voucher.findFirst({
      where: { id: tokenId },
    });
    const data = {
      hash: strHash,
      expTime: exp,
    };
    if (voucher)
      await this.prisma.voucher.update({
        where: {
          id: tokenId,
        },
        data,
      });
    else
      await this.prisma.voucher
        .create({
          data: { id: tokenId, ...data },
        })
        .then((res) => {
          console.log(res);
        });
    this.logger.log('info', `create voucher for token id : ${tokenId}`);
  }

  async claim(
    voucher: string,
    tokenId: number,
    toAddress: string,
    signature: string,
  ): Promise<any> {
    const dbVoucher = await this.prisma.voucher.findFirst({
      where: { id: tokenId },
    });
    if (!dbVoucher) {
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          error: 'Token not have voucher',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    const leaves = dbVoucher.hash.split(',').map((s) => s.trim());
    const tree = await this.getMerkleTree(leaves);
    const hash = ethers.utils.solidityKeccak256(
      ['string', 'uint256', 'uint'],
      [voucher, tokenId, dbVoucher.expTime],
    );
    const proof = tree.getHexProof(hash);
    try {
      const receipt = await this.nusaNFT.claimVoucher(
        voucher,
        tokenId,
        dbVoucher.expTime,
        toAddress,
        signature,
        proof,
        {
          // gasPrice: ethers.utils.parseUnits('5', 'gwei'),
        },
      );
      this.logger.log('info', `register voucher for token id : ${tokenId}`);
      return { receipt };
    } catch (error) {
      this.logger.log('error', `error claim voucher for token id: ${tokenId}`);
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          error: 'Token not have voucher',
        },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async ownerContract(): Promise<string> {
    return this.nusaNFT.owner();
  }

  async getCreator(tokenId: string): Promise<string> {
    return this.nusaNFT.creator(tokenId);
  }

  async create(toAddress: string, tokenURI: string): Promise<any> {
    return this.nusaNFT.create(toAddress, tokenURI);
  }

  async getMerkleTree(leaves: string[]): Promise<any> {
    return new MerkleTree(leaves, keccak256, { sortPairs: true });
  }

  async createVoucher(
    tokenId: number,
    voucher: string[],
    expTime: number,
  ): Promise<any> {
    const leaves = voucher.map((v) => {
      return ethers.utils.solidityKeccak256(
        ['string', 'uint256', 'uint'],
        [v, tokenId, expTime],
      );
    });
    const tree = await this.getMerkleTree(leaves);
    const rootHash = `${tree.getHexRoot()}`;
    return {
      voucher,
      expTime,
      leaves,
      rootHash,
    };
  }

  async check(tokenId: number, voucher: string): Promise<any> {
    // console.log(this.merkleTrees[tokenId]);
    const merkleTree = await this.getMerkleTree(
      this.merkleTrees[tokenId].leaves,
    );
    const hash = ethers.utils.solidityKeccak256(
      ['string', 'uint256', 'uint'],
      [voucher, tokenId, this.merkleTrees[tokenId].exp],
    );
    const proof = merkleTree.getHexProof(hash);
    // return this.merkleTrees[tokenId];
    return this.nusaNFT.isValidVoucher(
      voucher,
      tokenId,
      this.merkleTrees[tokenId].exp,
      proof,
    );
  }
}
