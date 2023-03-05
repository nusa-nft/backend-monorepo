import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, OnQueueFailed, OnQueueResumed, OnQueueStalled, OnQueueWaiting, Process, Processor } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { ethers } from 'ethers';
import { AttributeType, Collection, Prisma, TokenType, User } from '@nusa-nft/database';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../lib/slugify';
import axios from 'axios';
import { base64 } from 'ethers/lib/utils';
import { normalizeIpfsUri, nusaIpfsGateway } from '../lib/ipfs-uri';
import * as _ from 'lodash';

interface ImportCollectionJob {
  contractAddress: string;
  categoryId: number;
}

@Injectable()
@Processor('import-collection')
export class ImportCollectionService implements OnModuleInit {
  private provider: ethers.providers.JsonRpcProvider;
  private abi: string[];
  private ERC721_INTERFACE_ID = '0x80ac58cd';
  private ERC1155_INTERFACE_ID = '0xd9b67a26';

  constructor(
    private prisma: PrismaService,
    @InjectQueue('import-collection') private importCollectionQueue: Queue,
  ) {
    this.provider = new ethers.providers.WebSocketProvider(
      process.env.WSS_RPC_URL,
    );

    this.abi = [
      'function supportsInterface(bytes4 interfaceID) external view returns (bool)',
      'function name() public view returns (string memory)',
      'function owner() public view returns (address)',
      // ERC721
      'function tokenURI(uint256 tokenId) public view returns (string memory)',
      'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
      // ERC1155
      'function uri(uint256 _id) external view returns (string memory)',
      'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
      'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
    ];
  }

  async onModuleInit() {
    console.log('OnModuleInit');
  }

  @OnQueueStalled({ name: 'import-collection' })
  onImportCollectionStalled(job: Job<ImportCollectionJob>) {
    Logger.log('Job stalled, requeuing', JSON.stringify(job));
    // this.importCollectionQueue.add('import-collection', job.data);
    job.retry();
  }

  @OnQueueFailed({ name: 'import-collection' })
  onImportCollectionFailed(job: Job<ImportCollectionJob>) {
    Logger.log('Job failed, requeuing', JSON.stringify(job.failedReason));
    if (job.attemptsMade < 3) {
      job.retry();
    }
  }

  @OnQueueResumed({ name: 'import-collection' })
  onImportCollectionResumed(job: Job<ImportCollectionJob>) {
    Logger.log('resuming job', JSON.stringify(job));
  }

  @OnQueueWaiting({ name: 'import-collection' })
  onImportCollectionWaiting(job: Job<ImportCollectionJob>) {
    Logger.log('waiting job', JSON.stringify(job));
  }

  /**
   * Process import collection:
   * Contract addresses for testing (mumbai network. chain id 80001)
   * - 0xa7e13482f81478846eb6ca479aa8ff2b0d3bb753 // ERC1155 TransferBatch Event
   * - 0x803A7333cf67C626adBb5Bc7f38BCeB818E51054 // ERC721 Transfer Event
   * - 0xa7be5ecc24a2e2d3251f3c6c81078514b533a28b // ERC721 Transfer Event item with attributes
   * @param job
   */
  @Process('import-collection')
  async processImportCollection(job: Job<ImportCollectionJob>) {
    Logger.log('processing job', JSON.stringify(job));
    let { contractAddress, categoryId } = job.data;
    contractAddress = contractAddress.toLowerCase();
    const chainId = Number(process.env.CHAIN_ID);

    const iface = new ethers.utils.Interface(this.abi);

    const contract = new ethers.Contract(contractAddress, this.abi, this.provider);
    const isErc721 = await contract.supportsInterface(this.ERC721_INTERFACE_ID);
    const isErc1155 = await contract.supportsInterface(this.ERC1155_INTERFACE_ID);
    let startBlock = Number(process.env.WORKER_IMPORT_COLLECTION_START_BLOCK);
    let latestBlock = await this.provider.getBlockNumber();

    let creationBlock;
    let tokenType;
    let collection: Collection;
    let user: User;
    let contractCreator = '';

    const imported = await this.prisma.importedContracts.findFirst({
      where: { contractAddress, chainId },
    });

    if (!isErc721 && !isErc1155) {
      throw new HttpException(
        'Contract is neither ERC721 or ERC1155',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (isErc721) tokenType = TokenType.ERC721;
    if (isErc1155) tokenType = TokenType.ERC1155;

    if (!imported) {
      creationBlock = await this.getContractCreationBlock(
        contractAddress,
        startBlock,
        latestBlock,
      );
      await this.prisma.importedContracts.create({
        data: {
          contractAddress,
          chainId,
          tokenType,
          createdAt: new Date(),
          deployedAtBlock: creationBlock,
          lastIndexedBlock: creationBlock
        },
      });
    } else {
      creationBlock = imported.deployedAtBlock;
    }

    contractCreator = await this.getContractCreator(
      contract,
      contractAddress,
      creationBlock
    )

    if (!contractCreator) {
      contractCreator = ethers.constants.AddressZero;
    }

    // Check if user exists, if not create
    user = await this.prisma.user.findFirst({
      where: {
        wallet_address: {
          contains: contractCreator,
          mode: 'insensitive'
        },
      }
    });
    if (!user) {
      user = await this.prisma.user.create({
        data: { wallet_address: contractCreator },
      });
    }

    let name = '';
    let slug = '';
    // Get Contract name from on chain
    // Or create if it does not exist on chain
    try {
      name = await contract.name();
      const res = await this.getSlug(name);
      slug = res.slug;
    } catch (err) {
      name = `${contractAddress}-${chainId}`;
      slug = name;
    }

    collection = await this.createOrUpdateCollection({
      contractAddress,
      chainId,
      name,
      slug,
      user,
      categoryId
    })

    job.returnvalue = {
      collection
    }
    job.progress({ pct: 10, collection });

    let topics = [];
    if (isErc721) {
      topics = [[contract.filters.Transfer().topics[0]]];
    }
    if (isErc1155) {
      topics = [
        [
          contract.filters.TransferSingle().topics[0],
          contract.filters.TransferBatch().topics[0],
        ],
      ];
    }
    console.log({ isErc1155, isErc721 });

    let queryStartBlock = imported.lastIndexedBlock > creationBlock
      ? imported.lastIndexedBlock
      : creationBlock;

    let latestBlockIndexed = false;

    while (!latestBlockIndexed) {
      let blockRangeChunks = this.getBlockRangeChunks({
        startBlock: queryStartBlock,
        endBlock: latestBlock,
        chunkSize: 3000
      });

      for (let { fromBlock, toBlock } of blockRangeChunks) {
        Logger.log(`Processing logs for blocks ${fromBlock} to ${toBlock}`);
        const logs = await contract.queryFilter(
          { topics },
          fromBlock,
          toBlock,
        );

        for (const log of logs) {
          let event: ethers.utils.LogDescription;
          try {
            event = iface.parseLog(log);
          } catch (err) {
            Logger.warn(err, log);
            continue;
          }
          const { logIndex } = log;
          Logger.log('processing event', JSON.stringify(event));
          if (event.name == 'Transfer') {
            await this.handleERC721Transfer({
              event,
              contractAddress,
              log,
              contract,
              collection,
              user,
              tokenType,
              chainId,
              logIndex,
            });
          }
          if (event.name == 'TransferSingle') {
            await this.handleERC1155TransferSingle({
              event,
              contractAddress,
              log,
              contract,
              collection,
              user,
              tokenType,
              chainId,
              logIndex,
            });
          }
          if (event.name == 'TransferBatch') {
            await this.handleERC1155TransferBatch({
              event,
              contractAddress,
              log,
              contract,
              collection,
              user,
              tokenType,
              chainId,
              logIndex,
            });
          }
        }
      }

      await this.prisma.importedContracts.update({
        where: {
          contractAddress_chainId: {
            contractAddress, chainId
          }
        },
        data: {
          lastIndexedBlock: latestBlock,
        }
      })

      const currentBlock = await this.provider.getBlockNumber();
      if (latestBlock != currentBlock) {
        queryStartBlock = latestBlock + 1;
        latestBlock = currentBlock;
      } else {
        latestBlockIndexed = true;

        await this.prisma.importedContracts.update({
          where: {
            contractAddress_chainId: {
              contractAddress, chainId
            }
          },
          data: {
            isImportFinish: true,
          }
        })
      }
    }


    return { collection }
  }

  async getContractCreationBlock(
    contractAddress: string,
    startBlock: number,
    endBlock: number,
  ) {
    Logger.log('Getting contract creation block');
    if (startBlock == endBlock) {
      return startBlock;
    }
    const midBlock = Math.floor((startBlock + endBlock) / 2);
    const code = await this.provider.getCode(contractAddress, midBlock);
    if (code.length > 2) {
      return await this.getContractCreationBlock(
        contractAddress,
        startBlock,
        midBlock,
      );
    } else {
      return await this.getContractCreationBlock(
        contractAddress,
        midBlock + 1,
        endBlock,
      );
    }
  }

  // Get contract owner
  // If not, get the deployer
  async getContractCreator(contract: ethers.Contract, contractAddress: string, creationBlock: number) {
    let contractCreator;
    try {
      console.log('getting contract.owner()');
      contractCreator = await contract.owner();
      console.log({ contractCreator })
    } catch (err) {
      console.log({ err })
      const block = await this.provider.getBlockWithTransactions(creationBlock);
      const tx = block.transactions.filter(
        (x: any) =>
          !!x.creates &&
          x.creates.toLowerCase() == contractAddress.toLowerCase(),
      );
      if (tx.length > 0) {
        contractCreator = tx[0].from;
      }
    }
    return contractCreator
  }

  async createOrUpdateCollection({
    contractAddress,
    chainId,
    name,
    slug,
    user,
    categoryId
  }: {
    contractAddress: string;
    chainId: number;
    name: string;
    slug: string;
    user: User;
    categoryId: number;
  }) {
    let collection = await this.prisma.collection.findFirst({
      where: {
        contract_address: {
          contains: contractAddress,
          mode: 'insensitive',
        },
        chainId,
      },
    });
    collection = await this.prisma.collection.upsert({
      where: {
        id: collection ? collection.id : 0,
      },
      create: {
        name,
        slug,
        logo_image: '',
        chainId,
        isImported: true,
        payment_token: ethers.constants.AddressZero,
        contract_address: contractAddress,
        Creator: {
          connect: {
            id_wallet_address: {
              id: user.id,
              wallet_address: user.wallet_address,
            },
          },
        },
        Category: {
          connect: {
            id: +categoryId,
          },
        },
        royalty: {
          createMany: {
            data: [],
          },
        },
      },
      update: {
        name,
        logo_image: '',
        chainId,
        isImported: true,
        payment_token: ethers.constants.AddressZero,
        contract_address: contractAddress,
        Creator: {
          connect: {
            id_wallet_address: {
              id: user.id,
              wallet_address: user.wallet_address,
            },
          },
        },
        Category: {
          connect: {
            id: +categoryId,
          },
        },
        royalty: {
          createMany: {
            data: [],
          },
        },
      }
    });
    return collection;
  }

  async getMetadata(uri: string, timeout: number = 10000) {
    Logger.log('fetching metadata', uri);
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (uri.startsWith('ipfs://')) {
      const res = await axios.get(
        `${process.env.IPFS_GATEWAY}/${uri.replace('ipfs://', '')}`,
        {
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'identity',
          },
          timeout
        },
      );
      return this.parseJson(res.data);
    }
    const res = await axios.get(uri, {
      headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' },
      timeout,
    });
    return this.parseJson(res.data);
  }

  parseJson(maybeJson: any) {
    if (Buffer.isBuffer(maybeJson)) {
      try {
        const decoded = JSON.parse(maybeJson.toString());
        return decoded;
      } catch (err) {
        Logger.error(`Failed parseJson`, err);
        return {};
      }
    }
    return maybeJson;
  }

  async handleERC721Transfer({
    event,
    contractAddress,
    log,
    contract,
    collection,
    user,
    tokenType,
    chainId,
    logIndex,
  }: {
    contractAddress: string;
    event: ethers.utils.LogDescription;
    log: ethers.Event;
    contract: ethers.Contract;
    collection: Collection;
    tokenType: TokenType;
    chainId: number;
    user: User;
    logIndex: number;
  }) {
    const from = event.args[0];
    const to = event.args[1];
    const tokenId = event.args[2].toString();
    const { blockNumber, transactionHash } = log;
    console.log({ blockNumber });
    const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
    await this.createUpdateTokenOwnership({
      contractAddress,
      from,
      to,
      tokenId,
      quantity: 1,
      timestamp,
      chainId,
      transactionHash,
      blockNumber,
      txIndex: 0,
      logIndex,
    });
    if (from == ethers.constants.AddressZero) {
      await this.createItemIfNotExists({
        contract,
        collection,
        tokenId,
        chainId,
        tokenType,
        contractAddress,
        user,
      });
    }
  }

  async handleERC1155TransferSingle({
    event,
    contractAddress,
    log,
    contract,
    collection,
    user,
    tokenType,
    chainId,
    logIndex,
  }: {
    contractAddress: string;
    event: ethers.utils.LogDescription;
    log: ethers.Event;
    contract: ethers.Contract;
    collection: Collection;
    tokenType: TokenType;
    chainId: number;
    user: User;
    logIndex: number;
  }) {
    const operator = event.args[0];
    const from = event.args[1];
    const to = event.args[2];
    const id = event.args[3].toString();
    const value = event.args[4].toNumber();
    const { blockNumber, transactionHash } = log;
    const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
    const tokenOwnershipWrite = await this.createUpdateTokenOwnership({
      contractAddress,
      from,
      to,
      tokenId: id,
      quantity: value,
      timestamp: timestamp,
      chainId,
      transactionHash,
      blockNumber,
      txIndex: 0,
      logIndex,
    });
    // If tokenOwnerships has not changed && transfer is not mint return
    if (from == ethers.constants.AddressZero) {
      await this.createItemIfNotExists({
        contract,
        collection,
        tokenId: id,
        chainId,
        tokenType,
        contractAddress,
        user,
        amount: value,
      });
    }
  }

  async handleERC1155TransferBatch({
    event,
    contractAddress,
    log,
    contract,
    collection,
    user,
    tokenType,
    chainId,
    logIndex,
  }: {
    contractAddress: string;
    event: ethers.utils.LogDescription;
    log: ethers.Event;
    contract: ethers.Contract;
    collection: Collection;
    tokenType: TokenType;
    chainId: number;
    user: User;
    logIndex: number;
  }) {
    // const { operator, from, to, ids, values } = event.args;
    const operator = event.args[0];
    const from = event.args[1];
    const to = event.args[2];
    const ids = event.args[3];
    const values = event.args[4];
    const { blockNumber, transactionHash } = log;
    const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
    for (let i = 0; i < ids.length; i++) {
      // console.log({ tokenId: ids[i].toString() });
      // console.log({ quantity: values[i].toString() });
      const tokenOwnershipWrite = await this.createUpdateTokenOwnership({
        contractAddress,
        from,
        to,
        tokenId: ids[i].toString(),
        quantity: values[i].toNumber(),
        timestamp: timestamp,
        chainId,
        transactionHash,
        blockNumber,
        txIndex: i,
        logIndex,
        isBatch: true,
      });
      // If tokenOwnerships has not changed && transfer is not mint return
      if (from == ethers.constants.AddressZero) {
        await this.createItemIfNotExists({
          contract,
          collection,
          tokenId: ids[i].toString(),
          chainId,
          tokenType,
          contractAddress,
          user,
          amount: values[i].toNumber(),
        });
      }
    }
  }

  async createUpdateTokenOwnership({
    contractAddress,
    from,
    to,
    tokenId,
    quantity,
    timestamp,
    chainId,
    transactionHash,
    blockNumber,
    txIndex = 0,
    logIndex,
    isBatch = false,
  }: {
    contractAddress: string;
    from: string;
    to: string;
    tokenId: Prisma.Decimal;
    quantity: number;
    timestamp: number;
    chainId: number;
    transactionHash: string;
    blockNumber: number;
    txIndex: number;
    logIndex: number;
    isBatch?: boolean;
  }) {
    // console.log({
    //   contractAddress,
    //   from,
    //   to,
    //   tokenId,
    //   quantity,
    //   timestamp,
    //   chainId,
    //   transactionHash,
    //   blockNumber,
    //   txIndex
    // })
    const tokenTransferHistory =
      await this.prisma.tokenTransferHistory.findFirst({
        where: {
          transactionHash,
          txIndex,
          chainId,
          logIndex
        },
      });
    if (tokenTransferHistory) return [];

    const transactions = [];
    transactions.push(
      this.prisma.tokenTransferHistory.upsert({
        where: {
          transactionHash_chainId_txIndex_logIndex: {
            transactionHash,
            txIndex,
            chainId,
            logIndex
          },
        },
        create: {
          contractAddress,
          from,
          to,
          tokenId,
          transactionHash,
          block: blockNumber,
          createdAt: timestamp,
          value: quantity,
          chainId,
          txIndex,
          logIndex,
          isBatch
        },
        update: {},
      }),
    );

    const _from = await this.prisma.tokenOwnerships.findFirst({
      where: {
        contractAddress: {
          contains: contractAddress,
          mode: 'insensitive'
        },
        tokenId,
        ownerAddress: from,
        chainId,
      },
    });
    const _to = await this.prisma.tokenOwnerships.findFirst({
      where: {
        contractAddress: {
          contains: contractAddress,
          mode: 'insensitive'
        },
        tokenId,
        ownerAddress: to,
        chainId,
      },
    });
    // Upsert From
    if (_from && _from.ownerAddress != ethers.constants.AddressZero) {
      transactions.push(
        this.prisma.tokenOwnerships.upsert({
          where: {
            contractAddress_chainId_tokenId_ownerAddress: {
              contractAddress,
              tokenId,
              ownerAddress: from,
              chainId,
            },
          },
          create: {
            contractAddress,
            tokenId,
            ownerAddress: from,
            quantity: _from ? _from.quantity - quantity : 0,
            timestamp,
            chainId,
            transactionHash,
          },
          update: {
            quantity: _from ? _from?.quantity - quantity : 0,
            transactionHash,
          },
        }),
      );
    }
    // Upsert To
    transactions.push(
      this.prisma.tokenOwnerships.upsert({
        where: {
          contractAddress_chainId_tokenId_ownerAddress: {
            contractAddress,
            tokenId,
            ownerAddress: to,
            chainId,
          },
        },
        create: {
          contractAddress,
          tokenId,
          ownerAddress: to,
          quantity: _to ? _to.quantity + quantity : quantity,
          timestamp,
          chainId,
          transactionHash,
        },
        update: {
          quantity: _to ? _to?.quantity + quantity : quantity,
          transactionHash,
        },
      }),
    );

    try {
      const result = await this.prisma.$transaction(transactions, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      return result;
    } catch (err) {
      Logger.warn('createUpdateImportedContractTokenOwnership transaction failed');
      Logger.warn(err);
    }
    return [];
  }

  async createItemIfNotExists({
    contract,
    collection,
    tokenId,
    chainId,
    tokenType,
    contractAddress,
    user,
    amount = 1,
  }: {
    contract: ethers.Contract;
    collection: Collection;
    tokenId: Prisma.Decimal;
    chainId: number;
    tokenType: TokenType;
    contractAddress: string;
    user: User;
    amount?: number;
  }) {
    const item = await this.prisma.item.findFirst({
      where: {
        tokenId: tokenId,
        contract_address: {
          contains: contractAddress,
          mode: 'insensitive'
        },
        chainId,
      },
      include: {
        attributes: true
      }
    })
    let name;
    let metadataUri;
    let attributes;
    let description;
    let image;
    if (!item || !item.image || !item.name) {
      const metadata = await this.extractMetadata(contract, collection, tokenId, tokenType);
      // console.log({ metadata })
      name = metadata.name;
      metadataUri = metadata.metadataUri;
      attributes = metadata.attributes;
      description = metadata.description;
      image = metadata.image;
    } else {
      name = item.name;
      metadataUri = item.metadata;
      description = item.description;
      attributes = item.attributes.map(x => ({
        trait_type: x.trait_type,
        opensea_display_type: x.opensea_display_type,
        value: x.value
      }));
    }
    let itemData: Prisma.ItemCreateInput = {
      chainId,
      supply: amount,
      quantity_minted: amount,
      token_standard: tokenType,
      metadata: metadataUri,
      tokenId: tokenId,
      contract_address: contractAddress,
      is_metadata_freeze: true,
      name,
      image,
      description,
      Collection: {
        connect: {
          id: collection.id,
        },
      },
      Creator: {
        connect: {
          id_wallet_address: {
            id: user.id,
            wallet_address: user.wallet_address,
          },
        },
      },
    };
    let itemUpdateData: Prisma.ItemUpdateInput = {
      ...itemData,
    };
    if (tokenType == TokenType.ERC1155) {
      itemUpdateData = {
        ...itemUpdateData,
        supply: { increment: amount },
        quantity_minted: { increment: amount },
      };
    }
    if (this.validateMetadataAttributes(attributes)) {
      const parsedAttributes = this.parseAttributes(attributes);
      itemData = {
        ...itemData,
        attributes: {
          createMany: {
            data: parsedAttributes,
          },
        },
      };
    }
    await this.prisma.item.upsert({
      where: {
        tokenId_contract_address_chainId: {
          tokenId: tokenId,
          contract_address: contractAddress,
          chainId,
        },
      },
      create: itemData,
      update: itemUpdateData,
    });
  }

  validateMetadataAttributes(attributes: object[]) {
    let isValid = false;
    if (!attributes) return isValid;
    attributes.forEach((x: object) => {
      if (
        !Object.prototype.hasOwnProperty.call(x, 'trait_type') &&
        !Object.prototype.hasOwnProperty.call(x, 'value')
      ) {
        isValid = false;
        return;
      }
      isValid = true;
    });
    return isValid;
  }

  parseAttributes(attributes: any[]) {
    return attributes.map((x) => {
      let nusa_attribute_type: AttributeType = AttributeType.PROPERTIES;
      if (x.display_type && (x.display_type as string).includes('number')) {
        nusa_attribute_type = AttributeType.STATS;
      }
      return {
        ...x,
        value: String(x.value),
        opensea_display_type: x.display_type || null,
        nusa_attribute_type
      };
    })
  }

  async extractMetadata(
    contract: ethers.Contract,
    collection: Collection,
    tokenId: Prisma.Decimal,
    tokenType: TokenType
  ) {
    let name = '';
    let description = '';
    let image = '';
    let metadataUri = '';
    let attributes = [];
    try {
      if (tokenType == TokenType.ERC721) {
        metadataUri = await contract.tokenURI(tokenId);
        metadataUri = normalizeIpfsUri(metadataUri);
      }
      if (tokenType == TokenType.ERC1155) {
        metadataUri = await contract.uri(tokenId);
        metadataUri = normalizeIpfsUri(metadataUri);
      }
      const metadata = await this.getMetadata(metadataUri);
      name = metadata.name;
      image = metadata.image;
      if (image.includes('ipfs')) {
        image = normalizeIpfsUri(image);
      }
      if (!name) throw new Error();
      attributes = metadata.attributes;
      description = metadata.description;
    } catch (err) {
      Logger.error(`error fetching metadata`, err);
      name = `${collection.name}-${tokenId}`;
    }
    return { name, description, image, metadataUri, attributes };
  }

  async getSlug(name: string) {
    let slug = slugify(name);

    const lastInserts = await this.prisma.collection.findMany({
      take: 2,
      where: {
        slug: { startsWith: slug },
        deleted: false,
      },
      orderBy: { id: 'desc' },
    });

    if (lastInserts.length == 1) {
      slug = `${slug}-${1}`;
    }

    if (lastInserts.length > 1) {
      const split = lastInserts[0].slug.split('-');
      const index = Number(split[split.length - 1]);
      const nextIndex = index + 1;
      slug = `${slug}-${nextIndex}`;
    }

    return {
      status: HttpStatus.OK,
      message: 'success',
      slug,
    };
  }

  getBlockRangeChunks({
    startBlock,
    endBlock,
    chunkSize
  }: {
    startBlock: number,
    endBlock: number,
    chunkSize: number
  }) {
    const blockArray = [];
    for (let i = startBlock; i <= endBlock; i++) {
      blockArray.push(i);
    }
    const blockChunks = _.chunk(blockArray, chunkSize);
    // make array of object fromBlock and toBlock value
    const blockRanges = blockChunks.map((arr) => {
      const toBlock = arr.slice(-1)[0];
      const fromBlock = arr.slice(0, 1)[0];
      return { fromBlock, toBlock };
    });

    return blockRanges;
  }
}
