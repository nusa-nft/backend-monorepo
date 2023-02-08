import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { ethers } from 'ethers';
import { Collection, Prisma, TokenType, User } from '@nusa-nft/database';
import { PrismaService } from 'src/prisma/prisma.service';
import { slugify } from '../lib/slugify';
import axios from 'axios';

@Injectable()
@Processor('import-collection')
export class ImportCollectionService {
  private provider: ethers.providers.JsonRpcProvider;
  constructor(
    private prisma: PrismaService,
  ) {
    this.provider = new ethers.providers.WebSocketProvider(
      process.env.WSS_RPC_URL,
    );
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
  async processImportCollection(job: Job<{ contractAddress: string, categoryId: number }>) {
    const { contractAddress, categoryId } = job.data;
    const chainId = Number(process.env.CHAIN_ID);

    const ERC721_INTERFACE_ID = '0x80ac58cd';
    const ERC1155_INTERFACE_ID = '0xd9b67a26';

    const abi = [
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
    const iface = new ethers.utils.Interface(abi);

    const contract = new ethers.Contract(contractAddress, abi, this.provider);
    const isErc721 = await contract.supportsInterface(ERC721_INTERFACE_ID);
    const isErc1155 = await contract.supportsInterface(ERC1155_INTERFACE_ID);
    const startBlock = 10000000;
    const latestBlock = await this.provider.getBlockNumber();

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
        },
      });
    } else {
      creationBlock = imported.deployedAtBlock;
    }
    // Get contract owner
    // If not, get the deployer
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

    if (!contractCreator) {
      contractCreator = ethers.constants.AddressZero;
    }

    // Check if user exists, if not create
    user = await this.prisma.user.findFirst({
      where: { wallet_address: contractCreator },
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

    collection = await this.prisma.collection.findFirst({
      where: {
        contract_address: contractAddress,
        chainId,
      },
    });
    collection = await this.prisma.collection.upsert({
      where: {
        id: collection.id,
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
      }
    });

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
    const logs = await contract.queryFilter(
      { topics },
      creationBlock,
      latestBlock,
    );
    console.log({ isErc1155, isErc721 });

    for (const log of logs) {
      const event = iface.parseLog(log);
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
        });
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

  async getMetadata(uri: string) {
    if (uri.startsWith('ipfs://')) {
      const res = await axios.get(
        `${process.env.IPFS_GATEWAY}/${uri.replace('ipfs://', '')}`,
        {
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'identity',
          },
        },
      );
      return res.data;
    }
    const res = await axios.get(uri, {
      headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' },
    });
    return res.data;
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
  }: {
    contractAddress: string;
    event: ethers.utils.LogDescription;
    log: ethers.Event;
    contract: ethers.Contract;
    collection: Collection;
    tokenType: TokenType;
    chainId: number;
    user: User;
  }) {
    const from = event.args[0];
    const to = event.args[1];
    const tokenId = event.args[2].toNumber();
    const { blockNumber, transactionHash } = log;
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
  }: {
    contractAddress: string;
    event: ethers.utils.LogDescription;
    log: ethers.Event;
    contract: ethers.Contract;
    collection: Collection;
    tokenType: TokenType;
    chainId: number;
    user: User;
  }) {
    const operator = event.args[0];
    const from = event.args[1];
    const to = event.args[2];
    const id = event.args[3].toNumber();
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
    });
    // If tokenOwnerships has not changed && transfer is not mint return
    if (tokenOwnershipWrite.length == 0 && from != ethers.constants.AddressZero)
      return;
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

  async handleERC1155TransferBatch({
    event,
    contractAddress,
    log,
    contract,
    collection,
    user,
    tokenType,
    chainId,
  }: {
    contractAddress: string;
    event: ethers.utils.LogDescription;
    log: ethers.Event;
    contract: ethers.Contract;
    collection: Collection;
    tokenType: TokenType;
    chainId: number;
    user: User;
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
      const tokenOwnershipWrite = await this.createUpdateTokenOwnership({
        contractAddress,
        from,
        to,
        tokenId: ids[i].toNumber(),
        quantity: values[i].toNumber(),
        timestamp: timestamp,
        chainId,
        transactionHash,
        blockNumber,
        txIndex: i,
      });
      // If tokenOwnerships has not changed && transfer is not mint return
      if (
        tokenOwnershipWrite.length == 0 &&
        from != ethers.constants.AddressZero
      )
        return;
      await this.createItemIfNotExists({
        contract,
        collection,
        tokenId: ids[i].toNumber(),
        chainId,
        tokenType,
        contractAddress,
        user,
        amount: values[i].toNumber(),
      });
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
  }: {
    contractAddress: string;
    from: string;
    to: string;
    tokenId: number;
    quantity: number;
    timestamp: number;
    chainId: number;
    transactionHash: string;
    blockNumber: number;
    txIndex: number;
  }) {
    const tokenTransferHistory =
      await this.prisma.tokenTransferHistory.findFirst({
        where: {
          transactionHash,
          txIndex,
          chainId,
        },
      });
    if (tokenTransferHistory) return [];

    const transactions = [];
    transactions.push(
      this.prisma.tokenTransferHistory.upsert({
        where: {
          transactionHash_chainId_txIndex: {
            transactionHash,
            txIndex,
            chainId,
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
        },
        update: {},
      }),
    );

    const _from = await this.prisma.tokenOwnerships.findFirst({
      where: {
        contractAddress,
        tokenId,
        ownerAddress: from,
        chainId,
      },
    });
    const _to = await this.prisma.tokenOwnerships.findFirst({
      where: {
        contractAddress,
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

    const result = await this.prisma.$transaction(transactions, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    return result;
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
    tokenId: number;
    chainId: number;
    tokenType: TokenType;
    contractAddress: string;
    user: User;
    amount?: number;
  }) {
    const { name, metadataUri, attributes, description, image } =
      await this.extractMetadata(contract, collection, tokenId);
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
      itemData = {
        ...itemData,
        attributes: {
          createMany: {
            data: attributes.map((x) => ({ ...x, value: String(x.value) })),
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

  async extractMetadata(
    contract: ethers.Contract,
    collection: Collection,
    tokenId: number,
  ) {
    let name = '';
    let description = '';
    let image = '';
    let metadataUri = '';
    let attributes = [];
    try {
      metadataUri = await contract.tokenURI(tokenId);
      const metadata = await this.getMetadata(metadataUri);
      name = metadata.name;
      image = metadata.image;
      if (!name) throw new Error();
      attributes = metadata.attributes;
      description = metadata.description;
    } catch (err) {
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
}
