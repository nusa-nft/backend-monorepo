import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BigNumber, ethers, logger } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
// import MarketplaceAbi from '../contract/Marketplace.json';
import * as NusaRoyaltyDistributor from '../contract/NusaRoyaltyDistributor.json';
import { ConfigService } from '@nestjs/config';
import _ from 'lodash';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ListingType, TokenType } from '@prisma/client';
import { MarketplaceListing, MarketplaceNewOffer } from './interfaces';
import { WsProvider } from './ws-provider';
import { Collection, IndexerStatus, ListingStatus, MarketplaceOffer, OfferStatus, Prisma, User } from '@nusa-nft/database';
import { normalizeIpfsUri, nusaIpfsGateway } from '../lib/ipfs-uri';
import axios from 'axios';
import retry from 'async-retry';
import { NusaNFT, MarketplaceFacet, OffersFacet, LibRoyalty, ERC721, ERC1155 } from '@nusa-nft/smart-contract/typechain-types/index';
import { ListingAddedEvent, ListingStructOutput, NewBidEvent, NewBidEventObject } from '@nusa-nft/smart-contract/typechain-types/contracts/facets/MarketplaceFacet';
import { abi as NusaNftAbi } from '@nusa-nft/smart-contract/artifacts/contracts/NusaNFT.sol/NusaNFT.json';
import { abi as MarketplaceAbi } from '@nusa-nft/smart-contract/artifacts/contracts/facets/MarketplaceFacet.sol/MarketplaceFacet.json';
import { abi as OffersAbi } from '@nusa-nft/smart-contract/artifacts/contracts/facets/OffersFacet.sol/OffersFacet.json';
import { abi as LibRoyaltyAbi } from  '@nusa-nft/smart-contract/artifacts/contracts/libraries/LibRoyalty.sol/LibRoyalty.json';
import { AcceptedOfferEvent, AcceptedOfferEventObject, OfferStruct, OfferStructOutput } from '@nusa-nft/smart-contract/typechain-types/contracts/facets/OffersFacet';
import { ISignatureMintERC1155, TokensMintedWithSignatureEvent, TokensMintedWithSignatureEventObject } from '@nusa-nft/smart-contract/typechain-types/contracts/NusaNFT';
import { LogDescription } from 'ethers/lib/utils';
import { TypedEvent } from '@nusa-nft/smart-contract/typechain-types/common';
import { MarketplaceListing as DbMarketplaceListing } from '@nusa-nft/database';
import { RoyaltyPaidEvent, RoyaltyPaidEventObject } from '@nusa-nft/smart-contract/typechain-types/contracts/libraries/LibRoyalty';

const parseListingType = (listingTypeNumber: number) => {
  if (listingTypeNumber == 0) {
    return ListingType.Direct;
  }
  if (listingTypeNumber == 1) {
    return ListingType.Auction;
  }
};

const parseListingStatus = (listingStatusNumber: number) => {
  if (listingStatusNumber == 0) {
    return ListingStatus.UNSET;
  }
  if (listingStatusNumber == 1) {
    return ListingStatus.CREATED;
  }
  if (listingStatusNumber == 2) {
    return ListingStatus.COMPLETED;
  }
  if (listingStatusNumber == 3) {
    return ListingStatus.CANCELLED;
  }
}

const parseOfferStatus = (offerStatus: number) => {
  if (offerStatus == 0) {
    return OfferStatus.UNSET;
  }
  if (offerStatus == 1) {
    return OfferStatus.CREATED;
  }
  if (offerStatus == 2) {
    return OfferStatus.COMPLETED;
  }
  if (offerStatus == 3) {
    return OfferStatus.CANCELLED;
  }
}

interface Attribute {
  trait_type: string;
  value: string;
}

interface Metadata {
  uri: string;
  name: string;
  image: string;
  description: string;
  attributes: Array<Attribute>;
  nusa_collection?: {
    name: string,
    slug: string,
  };
  nusa_item_id?: string;
}

@Injectable()
export class IndexerService implements OnModuleInit {
  provider;

  // Contracts
  erc1155: NusaNFT;
  marketplace: MarketplaceFacet;
  offers: OffersFacet;
  royalty: LibRoyalty;

  chainId = +this.configService.get<number>('CHAIN_ID');

  MAX_INTEGER = 2147483647;

  NFT_TOPICS = [];
  NFT_ABI = [
    'function supportsInterface(bytes4 interfaceID) external view returns (bool)',
    'function name() public view returns (string memory)',
    'function owner() public view returns (address)',
    // ERC721
    'function tokenURI(uint256 tokenId) public view returns (string memory)',
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
    'function balanceOf(address) public view returns (uint256)',
    // ERC1155
    'function uri(uint256 _id) external view returns (string memory)',
    'function totalSupply(uint256 id) public view returns(uint256)',
    'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
    'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
    'function balanceOf(address account, uint256 id) public view returns (uint256)'
  ];

  MARKETPLACE_TOPICS = [];
  MARKETPLACE_ABI = [
    'event ListingAdded(uint256 indexed listingId, address indexed assetContract, address indexed lister, tuple(uint256 listingId, address tokenOwner, address assetContract, uint256 tokenId, uint256 startTime, uint256 endTime, uint256 quantity, address currency, uint256 reservePricePerToken, uint256 buyoutPricePerToken, uint8 tokenType, uint8 listingType, uint8 status, uint256 royaltyInfoId) listing)',
    'event ListingRemoved(uint256 indexed listingId, address indexed listingCreator)',
    'event ListingUpdated(uint256 indexed listingId, address indexed listingCreator)',
    'event NewSale(uint256 indexed listingId, address indexed assetContract, address indexed lister, address buyer, uint256 quantityBought, uint256 totalPricePaid)',
    'event NewBid(uint256 indexed listingId, address bidder, uint256 quantityWanted, address currency, uint256 pricePerToken, uint256 totalPrice)',
    'event AuctionClosed(uint256 indexed listingId, address indexed closer, bool indexed cancelled, address auctionCreator, address winningBidder)',
    'event NewOffer(address indexed offeror, uint256 indexed offerId, address indexed assetContract, tuple(uint256 offerId, address offeror, address assetContract, uint256 tokenId, uint256 quantity, address currency, uint256 totalPrice, uint256 expirationTimestamp, uint8 tokenType, uint8 status, uint256 royaltyInfoId) offer)',
    'event AcceptedOffer(address indexed offeror, uint256 indexed offerId, address indexed assetContract, uint256 tokenId, address seller, uint256 quantityBought, uint256 totalPricePaid)',
    'event CancelledOffer(address indexed offeror, uint256 indexed offerId)',
    'event RoyaltyPaid(uint256 indexed id, address[] recipients, uint64[] bpsPerRecipients, uint256 totalPayout, address currency)'
  ];

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    const wsProvider = new WsProvider(
      {
        KEEP_ALIVE_CHECK_INTERVAL: 10000,
        RPC_URL: this.configService.get<string>('WSS_RPC_URL'),
      },
      this.eventEmitter,
    );

    this.provider = wsProvider.provider;

    this.erc1155 = new ethers.Contract(
      this.configService.get<string>('NFT_CONTRACT_ADDRESS'),
      NusaNftAbi as any,
      this.provider,
    ) as NusaNFT;

    this.marketplace = new ethers.Contract(
      this.configService.get<string>('MARKETPLACE_CONTRACT_ADDRESS'),
      MarketplaceAbi as any,
      this.provider,
    ) as MarketplaceFacet;

    this.offers = new ethers.Contract(
      this.configService.get<string>('MARKETPLACE_CONTRACT_ADDRESS'),
      OffersAbi as any,
      this.provider,
    ) as OffersFacet;

    this.royalty = new ethers.Contract(
      this.configService.get<string>('MARKETPLACE_CONTRACT_ADDRESS'),
      LibRoyaltyAbi as any,
      this.provider,
    ) as LibRoyalty;

    this.NFT_TOPICS = [
      // ERC1155
      'TransferSingle(address,address,address,uint256,uint256)',
      'TransferBatch(address,address,address,uint256[],uint256[])',
      // ERC721
      'Transfer(address,address,uint256)',
    ].map((topic) => ethers.utils.id(topic));

    this.MARKETPLACE_TOPICS = [
      this.marketplace.filters.ListingAdded().topics[0],
      this.marketplace.filters.ListingRemoved().topics[0],
      this.marketplace.filters.ListingUpdated().topics[0],
      this.marketplace.filters.NewSale().topics[0],
      this.marketplace.filters.NewBid().topics[0],
      this.marketplace.filters.AuctionClosed().topics[0],
      this.offers.filters.NewOffer().topics[0],
      this.offers.filters.AcceptedOffer().topics[0],
      this.offers.filters.CancelledOffer().topics[0],
      this.royalty.filters.RoyaltyPaid().topics[0]
    ]
  }

  async getStartBlock() {
    const indexerState = await this.prisma.indexerState.findFirst({
      orderBy: {
        lastBlockProcessed: 'desc',
      },
    });

    // deletes multiple lastBlockProcessed because of race condition
    if (indexerState) {
      await this.prisma.indexerState.deleteMany({
        where: {
          NOT: {
            lastBlockProcessed: indexerState.lastBlockProcessed,
          },
        },
      });
    }

    let startBlock: number
    if (indexerState) {
      startBlock = indexerState.lastBlockProcessed;
      await this.prisma.indexerState.update({
        where: { lastBlockProcessed: indexerState.lastBlockProcessed },
        data: { status: IndexerStatus.SYNCING }
      })
    } else {
      startBlock = Number(this.configService.get<string>('INDEXER_FROM_BLOCK'));
      await this.prisma.indexerState.create({
        data: {
          lastBlockProcessed: startBlock,
          status: IndexerStatus.SYNCING
        }
      })
    }

    return startBlock;
  }

  async indexOldBlocks() {
    let startBlock = await this.getStartBlock();
    let latestBlock = await this.provider.getBlockNumber();
    if (startBlock <= latestBlock) {
      await this.updateLatestBlock(startBlock, IndexerStatus.SYNCING);
    }
    await retry(async () => {
      const blocks = [];
      for (let i = startBlock; i <= latestBlock; i++) {
        blocks.push(i);
      }
      // make chunk of per 3500 block range from previously determined block
      const chunk = _.chunk(blocks, 3000);
      // make array of object fromBlock and toBlock value
      const blockRange = chunk.map((arr) => {
        const toBlock = arr.slice(-1)[0];
        const fromBlock = arr.slice(0, 1)[0];
        return { fromBlock, toBlock };
      });

      for (const range of blockRange) {
        const { fromBlock, toBlock } = range;
        try {
          await this.queryFilter(fromBlock, toBlock);
        } catch (err) {
          Logger.error(err);
        }
        await this.updateLatestBlock(toBlock, IndexerStatus.SYNCING);
      }

      const _latestBlock = await this.provider.getBlockNumber();
      if (latestBlock !== _latestBlock) {
        startBlock = latestBlock + 1;
        latestBlock = _latestBlock;
        throw new Error('latest block number changed');
      }
    }, { forever: true, maxTimeout: 1000, minTimeout: 1000 })

    await this.updateLatestBlock(latestBlock, IndexerStatus.SYNCED);
  }

  async indexNewBlocks() {
    this.provider.on('block', async (block: number) => {
      Logger.log(`New block: ${block}`);
      await this.queryFilter(block, block);
      await this.updateLatestBlock(block, IndexerStatus.SYNCED);
    })
  }

  async onModuleInit() {
    await this.indexOldBlocks();
    this.indexNewBlocks();
  }

  @OnEvent('ws.closed')
  handleWsClosed() {
    // Restart should be handled by PM2
    process.exit(1);
  }

  async queryFilter(fromBlock: number, toBlock: number) {
    Logger.log(`queryFilter(${fromBlock}, ${toBlock})`);

    const nftContractAdresses = await this.getNFTContractAddresses();
    const marketplaceContractAddress = this.configService.get<string>(
      'MARKETPLACE_CONTRACT_ADDRESS'
    );

    const logs = await this.provider.send('eth_getLogs', [
      {
        address: [...nftContractAdresses, marketplaceContractAddress],
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
        topics: [[...this.NFT_TOPICS, ...this.MARKETPLACE_TOPICS]],
      },
    ]);

    const iface = new ethers.utils.Interface([...this.NFT_ABI, ...this.MARKETPLACE_ABI]);
    for (const log of logs) {
      let event: ethers.utils.LogDescription;
      try {
        event = iface.parseLog(log);
      } catch (err) {
        Logger.warn(err, log);
        continue;
      }
      Logger.log(event.name);

      if ([
        'Transfer',
        'TransferSingle',
        'TransferBatch'
      ].includes(event.name)) {
        await this.handleNFTEvent(event, log);
        continue;
      }

      if ([
        'ListingAdded',
        'ListingRemoved',
        'ListingUpdated',
        'NewSale',
        'NewOffer',
        'AuctionClosed',
        'RoyaltyPaid',
        'NewBid',
        'AcceptedOffer'
      ].includes(event.name)) {
        await this.handleMarketplaceEvent(event, log);
        continue;
      }
    }
  }

  async handleNFTEvent(event: ethers.utils.LogDescription, log: any) {
    const { blockNumber, logIndex } = log;
    const logIndexParsed = parseInt(logIndex.toString());
    const blockNumberParsed = parseInt(blockNumber.toString());
    const contractAddress: string = log.address;
    const contract = new ethers.Contract(contractAddress, this.NFT_ABI, this.provider);
    const nusaContractAddress = this.configService.get<string>(
      'NFT_CONTRACT_ADDRESS',
    );

    let tokenId;
    let collection;
    let metadataUri;
    let metadata;

    if (event.name == 'Transfer') {
      tokenId = event.args[2].toString();
      metadataUri = await (contract as ERC721).tokenURI(tokenId);
    }
    if (event.name == 'TransferBatch') {
      const ids = event.args[3];
      tokenId = ids[0].toString();
      metadataUri = await (contract as ERC1155).uri(tokenId);
    }
    if (event.name == 'TransferSingle') {
      tokenId = event.args[3].toString();
      metadataUri = await (contract as ERC1155).uri(tokenId);
    }
    try {
      metadata = await this.getMetadata(metadataUri);
    } catch (err) {
      Logger.warn(err);
      metadata = {
        uri: metadataUri,
        name: '',
        image: '',
        description: '',
        attributes: []
      }
    }
    metadata = this.cleanMetadata({ uri: metadataUri, metadata, fallbackName: `${contractAddress}-${tokenId}` });

    if (contractAddress.toLowerCase() != nusaContractAddress.toLowerCase()) {
      // Get Collection from imported contract address
      Logger.log('Handling item from imported contract')
      await retry(
        async () => {
          collection = await this.prisma.collection.findFirstOrThrow({
            where: {
              contract_address: {
                contains: contractAddress,
                mode: 'insensitive',
              },
            },
          })
        }, { retries: 5 }
      );
    } else {
      // Create nusa-collection (if not exists) for items that do not have a collection
      Logger.log('Handling Item from NusaNFT contract');
      if (!metadata.nusa_collection) {
        collection = await this.getNusaDefaultCollection(); // A collection for items that have no collection in metadata
      } else {
        // Find item's collection from metadata info 
        const slug = metadata.nusa_collection.slug;
        await retry(
          async () => {
            collection = await this.prisma.collection.findFirstOrThrow({
              where: {
                slug,
              },
            });
            return collection;
          },
          {
            forever: true,
          },
        );
      }
    }

    const collectionId = +collection.id;

    const user = await this.prisma.user.findFirst({
      where: {
        collections: {
          some: {
            id: collectionId,
          },
        },
      },
    });

    if (event.name == 'Transfer') {
      await this.handleERC721Transfer({
        event,
        contractAddress,
        log,
        contract,
        collection,
        metadata,
        user,
        tokenType: TokenType.ERC721,
        chainId: this.chainId,
        logIndex: logIndexParsed,
      });
    }

    if (event.name == 'TransferSingle') {
      await this.handleERC1155TransferSingle({
        event,
        contractAddress,
        log,
        contract,
        collection,
        metadata,
        user,
        tokenType: TokenType.ERC1155,
        chainId: this.chainId,
        logIndex: logIndexParsed,
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
        tokenType: TokenType.ERC1155,
        chainId: this.chainId,
        logIndex: logIndexParsed,
      });
    }

    if (contractAddress.toLowerCase() != nusaContractAddress.toLowerCase()) {
      await this.prisma.importedContracts.updateMany({
        where: {
          contractAddress: {
            mode: 'insensitive',
            equals: contractAddress,
          },
          chainId: +this.chainId,
        },
        data: {
          lastIndexedBlock: blockNumberParsed,
        },
      });
    }
  }

  async handleMarketplaceEvent(event: ethers.utils.LogDescription, log: any) {
    const timestamp = (await this.provider.getBlock(log.blockNumber))
      .timestamp;
    const transactionHash = log.transactionHash;

    if (event.name == 'ListingAdded') {
      Logger.log('ListingAdded');

      await this.indexMarketplaceCreateListingHistory({
        listingId: event.args.listingId,
        lister: event.args.lister,
        tokenOwner: event.args.listing.tokenOwner,
        assetContract: event.args.listing.assetContract,
        tokenId: event.args.listing.tokenId,
        startTime: event.args.listing.startTime,
        endTime: event.args.listing.endTime,
        quantity: event.args.listing.quantity,
        currency: event.args.listing.currency,
        reservePricePerToken: event.args.listing.reservePricePerToken,
        buyoutPricePerToken: event.args.listing.buyoutPricePerToken,
        tokenType: event.args.listing.tokenType,
        listingType: event.args.listing.listingType,
        status: event.args.listing.status,
        royaltyInfoId: event.args.listing.royaltyInfoId,
        createdAt: timestamp,
      });
    }

    if (event.name == 'ListingRemoved') {
      Logger.log('ListingRemoved');
      const timestamp = (await this.provider.getBlock(log.blockNumber))
        .timestamp;
      this.indexMarketplaceRemoveListing({
        listingId: event.args.listingId,
        updatedAt: timestamp,
      });
    }

    if (event.name == 'ListingUpdated') {
      Logger.log('ListingUpdated');
      const timestamp = (await this.provider.getBlock(log.blockNumber))
        .timestamp;
      const listing = await this.marketplace.getListing(event.args.listingId);
      const {
        listingId,
        tokenOwner,
        assetContract,
        tokenId,
        startTime,
        endTime,
        quantity,
        currency,
        reservePricePerToken,
        buyoutPricePerToken,
        status,
      } = listing;
      await this.indexMarketplaceUpdateListing({
        listingId,
        assetContract,
        tokenOwner,
        tokenId,
        startTime,
        endTime,
        quantity,
        currency,
        reservePricePerToken,
        buyoutPricePerToken,
        updatedAt: timestamp,
        status
      });
    }

    if (event.name == 'NewSale') {
      Logger.log('NewSale');
      const timestamp = (await this.provider.getBlock(log.blockNumber))
        .timestamp;
      const listing = await this.marketplace.getListing(event.args.listingId);
      const {
        listingId,
        tokenOwner,
        assetContract,
        tokenId,
        startTime,
        endTime,
        quantity,
        currency,
        reservePricePerToken,
        buyoutPricePerToken,
        status
      } = listing;
      await this.indexMarketplaceNewSale({
        listingId,
        assetContract,
        lister: event.args.lister,
        buyer: event.args.buyer,
        quantityBought: event.args.quantityBought,
        totalPricePaid: event.args.totalPricePaid,
        createdAt: timestamp,
        transactionHash: log.transactionHash,
      });
      await this.indexMarketplaceUpdateListing({
        listingId,
        assetContract,
        tokenOwner,
        tokenId,
        startTime,
        endTime,
        quantity,
        currency,
        reservePricePerToken,
        buyoutPricePerToken,
        updatedAt: timestamp,
        status
      });
    }

    if (event.name == 'NewOffer') {
      Logger.log('NewOffer');
      const timestamp = (await this.provider.getBlock(log.blockNumber))
        .timestamp;
      const offeror: ethers.BigNumberish = event.args[0];
      const offerId: ethers.BigNumberish = event.args[1];
      const assetContract: string = event.args[2];
      const offer: OfferStructOutput = event.args[3];
      await this.indexMarketplaceNewOffer(offer, transactionHash, timestamp);
    }
    
    if (event.name == 'NewBid') {
      Logger.log('NewBid');
      await this.indexNewBid((event as unknown as NewBidEvent).args, log);
    }

    if (event.name == 'AuctionClosed') {
      Logger.log('AuctionClosed');
      await this.handleAuctionClosed(event.args, log);
    }

    if (event.name == 'RoyaltyPaid') {
      Logger.log('RoyaltyPaid');
      await this.indexRoyaltyPaid((event as unknown as RoyaltyPaidEvent).args, log);
    }

    if (event.name == 'AcceptedOffer') {
      Logger.log('AcceptedOffer');
      await this.indexAcceptedOffer((event as unknown as AcceptedOfferEvent).args, log);
    }
  }

  async indexAcceptedOffer(eventArgs: AcceptedOfferEventObject, log: TypedEvent<any, any>) {
    const { blockNumber, transactionHash } = log;
    const { offerId } = eventArgs;
    const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
    const offer = await this.offers.getOffer(offerId);
    await this.prisma.marketplaceOffer.update({
      where: { id: Number(offerId) },
      data: {
        status: parseOfferStatus(offer.status),
        transactionHash,
      }
    });
  }

  async updateLatestBlock(blockNumber: number, status: IndexerStatus) {
    console.log("Updating latest block")
    const indexerState = await this.prisma.indexerState.findFirst();
    if (!indexerState) {
      await this.prisma.indexerState.create({
        data: {
          lastBlockProcessed: blockNumber,
          status,
        },
      });
      return;
    }
    if (blockNumber <= indexerState.lastBlockProcessed) {
      return;
    }
    if (blockNumber > indexerState.lastBlockProcessed) {
      await this.prisma.indexerState
        .upsert({
          where: { lastBlockProcessed: indexerState.lastBlockProcessed },
          create: {
            lastBlockProcessed: blockNumber,
            status
          },
          update: {
            lastBlockProcessed: blockNumber,
            status
          },
        })
        .catch(async () => {
          await this.prisma.indexerState.deleteMany();
          await this.prisma.indexerState.create({
            data: {
              lastBlockProcessed: blockNumber,
              status
            },
          });
        });
      Logger.log('indexerState.lastBlockProcessed updated');
      return;
    }
  }

  async indexNewBid(eventArgs: NewBidEventObject, log: TypedEvent<any, any>) {
    const { blockNumber, transactionHash } = log;
    const { listingId, bidder, quantityWanted, currency, pricePerToken, totalPrice } = eventArgs;
    
    const existingBid = await this.prisma.bid.findFirst({
      where: { transactionHash }
    })
    if (existingBid) return;
    await this.prisma.bid.create({
      data: {
        listing: {
          connect: {
            id: listingId.toString(),
          }
        },
        Bidder: {
          connectOrCreate: {
            create: {
              wallet_address: bidder,
            },
            where: {
              wallet_address: bidder,
            },
          },
        },
        quantityWanted: quantityWanted.toString(),
        currency: currency.toString(),
        pricePerToken: pricePerToken.toString(),
        totalPrice: totalPrice.toString(),
        transactionHash,
      }
    });
  }

  async indexRoyaltyPaid(eventArgs: RoyaltyPaidEventObject, log: TypedEvent<any, any>) {
    const { id, recipients, bpsPerRecipients, currency, totalPayout } = eventArgs;
    // const royaltyInfo = await this.marketplace.getRoyaltyInfo(id);
    let offer = await this.prisma.marketplaceOffer.findFirst({
      where: { royaltyInfoId: id.toNumber() }
    })
    let listing = await this.prisma.marketplaceListing.findFirst({
      where: { royaltyInfoId: id.toNumber() }
    });

    if (!offer && !listing) return;

    const { blockNumber, transactionHash } = log;
    const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
    for (const [i, rec] of (recipients as Array<string>).entries()) {
      const royaltyPaid = await this.prisma.royaltyPaid.findFirst({
        where: { transactionHash, recipient: rec },
      });
      if (royaltyPaid) continue;

      const bps: ethers.BigNumber = bpsPerRecipients[i];
      const amount: ethers.BigNumber = (totalPayout as ethers.BigNumber)
        .mul(bps)
        .div(10000);

      let royaltyPaidData: Prisma.RoyaltyPaidCreateInput = {
        // listingId: listingId.toNumber(),
        recipient: rec,
        bps: bps.toNumber(),
        amount: amount.toString(),
        createdAt: timestamp,
        transactionHash,
        currency
      }
      if (offer) {
        royaltyPaidData = {
          ...royaltyPaidData,
          offer: { connect: { id: offer.id } }
        }
      }
      if (listing) {
        royaltyPaidData = {
          ...royaltyPaidData,
          listing: { connect: { id: listing.id } }
        }
      }

      await this.prisma.royaltyPaid.create({
        data: royaltyPaidData,
      });
    }
  }

  async handleAuctionClosed(args, log) {
    const { closer, cancelled, auctionCreator, winningBidder } = args;
    const timestamp = (await this.provider.getBlock(log.blockNumber)).timestamp;
    // There are 3 conditions
    // Auction Cancelled / Auction Closed by creator / Auction Closed by bidder

    // If Auction Cancelled
    if (cancelled) {
      await this.indexMarketplaceRemoveListing({
        listingId: args.listingId,
        updatedAt: timestamp,
      });
      return;
    }

    const listing = await this.marketplace.getListing(args.listingId);
    const {
      listingId,
      tokenOwner,
      assetContract,
      tokenId,
      startTime,
      endTime,
      quantity,
      currency,
      reservePricePerToken,
      buyoutPricePerToken,
      status
    } = listing;

    // If Auction Closed by creator
    if (closer == auctionCreator) {
      await this.indexMarketplaceUpdateListing({
        listingId,
        tokenOwner,
        assetContract,
        tokenId,
        startTime,
        endTime,
        quantity,
        currency,
        reservePricePerToken,
        buyoutPricePerToken,
        status,
        updatedAt: timestamp,
        isClosedByLister: true,
      });
      return;
    }

    // If Auction Closed by bidder
    const winningBid = await this.marketplace.getWinningBid(listingId);
    await this.indexMarketplaceNewSale({
      listingId,
      assetContract,
      lister: auctionCreator,
      buyer: winningBidder,
      quantityBought: quantity,
      totalPricePaid: winningBid._bidAmount.mul(quantity),
      createdAt: timestamp,
      transactionHash: log.transactionHash,
    });
    await this.indexMarketplaceUpdateListing({
      listingId,
      assetContract,
      tokenOwner,
      tokenId,
      startTime,
      endTime,
      quantity,
      currency,
      reservePricePerToken,
      buyoutPricePerToken,
      updatedAt: timestamp,
      isClosedByBidder: true,
      status,
    });
  }

  async indexMarketplaceCreateListingHistory({
    listingId,
    lister,
    tokenOwner,
    assetContract,
    tokenId,
    startTime,
    endTime,
    quantity,
    currency,
    reservePricePerToken,
    buyoutPricePerToken,
    tokenType,
    listingType,
    status,
    createdAt,
    royaltyInfoId
  }) {
    let tokenTypeEnum;
    let listingTypeEnum;

    if (tokenType == 0) {
      tokenTypeEnum = TokenType.ERC1155;
    }

    if (tokenType == 1) {
      tokenTypeEnum = TokenType.ERC721;
    }

    if (listingType == 0) {
      listingTypeEnum = ListingType.Direct;
    }

    if (listingType == 1) {
      listingTypeEnum = ListingType.Auction;
    }

    const _endTime =
      endTime.toNumber() > this.MAX_INTEGER
        ? this.MAX_INTEGER
        : endTime.toNumber();
    const checkListingId = await this.prisma.marketplaceListing.findUnique({
      where: {
        id: parseInt(listingId._hex),
      },
    });
    const item = await this.prisma.item.findFirst({
      where: {
        tokenId: tokenId.toString(),
        chainId: Number(process.env.CHAIN_ID),
        contract_address: {
          equals: assetContract,
          mode: 'insensitive'
        },
      },
    });

    if (checkListingId || !item) return;
    else {
      const listingHistory = await this.prisma.marketplaceListing.create({
        data: {
          id: parseInt(listingId._hex),
          lister,
          tokenOwner,
          assetContract: assetContract.toLowerCase(),
          chainId: Number(process.env.CHAIN_ID),
          tokenId: tokenId.toString(),
          startTime: parseInt(startTime._hex),
          endTime: _endTime,
          quantity: parseInt(quantity._hex),
          currency,
          reservePricePerToken: reservePricePerToken.toString(),
          buyoutPricePerToken: buyoutPricePerToken.toString(),
          tokenType: tokenTypeEnum,
          listingType: listingTypeEnum,
          status: parseListingStatus(status),
          createdAt,
          royaltyInfoId: royaltyInfoId.toNumber(),
        },
      });
      return listingHistory;
    }
  }

  async indexMarketplaceRemoveListing({ listingId, updatedAt }) {
    const listing = await this.prisma.marketplaceListing.findFirst({
      where: { id: parseInt(listingId) },
    });
    if (!listing) return;
    const deleteListing = await this.prisma.marketplaceListing.update({
      where: {
        id: parseInt(listingId),
      },
      data: {
        isCancelled: true,
        updatedAt,
      },
    });
    return deleteListing;
  }

  async indexMarketplaceUpdateListing({
    listingId,
    tokenOwner,
    assetContract,
    tokenId,
    startTime,
    endTime,
    quantity,
    currency,
    reservePricePerToken,
    buyoutPricePerToken,
    updatedAt,
    isClosedByLister,
    isClosedByBidder,
    status
  }: MarketplaceListing) {
    const _endTime =
      endTime.toNumber() > this.MAX_INTEGER
        ? this.MAX_INTEGER
        : endTime.toNumber();
    const listing = await this.prisma.marketplaceListing.findFirst({
      where: {
        id: listingId.toNumber(),
      },
    });
    if (!listing) return;
    const updateListing = await this.prisma.marketplaceListing.update({
      where: {
        id: listingId.toNumber(),
      },
      data: {
        isCancelled: false,
        updatedAt,
        tokenOwner,
        assetContract: assetContract.toLowerCase(),
        tokenId: parseInt(tokenId._hex),
        startTime: parseInt(startTime._hex),
        endTime: _endTime,
        quantity: parseInt(quantity._hex),
        currency,
        reservePricePerToken: reservePricePerToken.toString(),
        buyoutPricePerToken: buyoutPricePerToken.toString(),
        isClosedByLister,
        isClosedByBidder,
        status: parseListingStatus(status)
      },
    });
    return updateListing;
  }

  async indexMarketplaceNewSale({
    listingId,
    assetContract,
    lister,
    buyer,
    quantityBought,
    totalPricePaid,
    createdAt,
    transactionHash,
  }) {
    const sale = await this.prisma.marketplaceSale.findFirst({
      where: { transactionHash },
    });
    const listing = await this.prisma.marketplaceListing.findFirst({
      where: { id: parseInt(listingId) },
    });
    if (sale || !listing) return;

    const newSale = await this.prisma.marketplaceSale.create({
      data: {
        listingId: parseInt(listingId),
        assetContract: assetContract.toLowerCase(),
        lister: lister,
        buyer,
        quantityBought: parseInt(quantityBought),
        totalPricePaid: totalPricePaid.toString(),
        createdAt,
        transactionHash,
      },
    });
    return newSale;
  }

  async indexMarketplaceNewOffer(offer: OfferStructOutput, transactionHash: string, timestamp: number) {
    const _offer = await this.prisma.marketplaceOffer.findFirst({
      where: { transactionHash },
    });
    if (_offer) return;

    await this.prisma.marketplaceOffer.create({
      data: {
        id: offer.offerId.toNumber(),
        offeror: offer.offeror,
        assetContract: offer.assetContract,
        tokenId: offer.tokenId.toString(),
        quantity: offer.quantity.toNumber(),
        currency: offer.currency,
        totalPrice: offer.totalPrice.toString(),
        expirationTimestamp: offer.expirationTimestamp.toString(),
        transactionHash,
        status: parseOfferStatus(offer.status),
        royaltyInfoId: offer.royaltyInfoId.toNumber(),
        createdAt: timestamp,
      },
    });
  }

  async getNFTContractAddresses() {
    const importedContracts = await this.prisma.importedContracts.findMany({
      select: {
        contractAddress: true,
      },
      where: {
        isImportFinish: true,
      },
    });
    // to get array of contracts
    const contractAdresses = importedContracts.map(
      (contract) => contract.contractAddress,
    );
    // get nusaConctract and push to contract array
    const nusaContractAddress = this.configService.get<string>(
      'NFT_CONTRACT_ADDRESS',
    );
    contractAdresses.push(nusaContractAddress);

    return contractAdresses;
  }

  async getNusaDefaultCollection() {
    const privateKey = process.env.NFT_CONTRACT_OWNER_PRIVATE_KEY;
    const nusaWallet = new ethers.Wallet(
      privateKey,
      this.provider,
    );

    // let findNusaCollection: Collection;
    // await retry(async () => {
    let findNusaCollection = await this.prisma.collection.findFirst({
        where: {
          slug: {
            contains: 'nusa-collection',
          },
        },
      });

    if (!findNusaCollection) {
      findNusaCollection = await this.prisma.collection.create({
        data: {
          name: 'nusa collection',
          slug: 'nusa-collection',
          Category: {
            connect: {
              id: 1,
            },
          },
          contract_address: process.env.NFT_CONTRACT_ADDRESS.toLowerCase(),
          Creator: {
            connectOrCreate: {
              create: {
                username: 'nusa-nft',
                wallet_address: nusaWallet.address,
              },
              where: {
                wallet_address: nusaWallet.address,
              },
            },
          },
        },
      });
    }
    // }, { retries: 10 });

    return findNusaCollection;
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
    metadata
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
    metadata: Metadata;
  }) {
    const from = event.args[0];
    const to = event.args[1];
    const tokenId = event.args[2].toString();
    const { blockNumber, transactionHash } = log;
    const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;

    await this.createUpdateTokenOwnership({
      contractAddress,
      from,
      to,
      tokenId,
      quantity: 1,
      balanceFrom: 0,
      balanceTo: 1,
      timestamp,
      chainId,
      transactionHash,
      blockNumber: parseInt(blockNumber.toString()),
      txIndex: 0,
      logIndex,
    });
    if (from == ethers.constants.AddressZero) {
      await this.createOrMintItem({
        contract,
        collection,
        metadata,
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
    metadata
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
    metadata: Metadata
  }) {
    const operator = event.args[0];
    const from = event.args[1];
    const to = event.args[2];
    const tokenId = event.args[3].toString();
    const value = event.args[4].toNumber();
    const { blockNumber, transactionHash } = log;
    const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
    const blockNumberInt = parseInt(blockNumber.toString());
    Logger.log('handleERC1155TransferSingle');

    const balanceFrom = from != ethers.constants.AddressZero
      ? await contract['balanceOf(address,uint256)'](from, tokenId, { blockTag: blockNumber })
      : ethers.BigNumber.from(0);
    const balanceTo = to != ethers.constants.AddressZero
      ? await contract['balanceOf(address,uint256)'](to, tokenId, { blockTag: blockNumber })
      : ethers.BigNumber.from(0);

    const tokenOwnershipWrite =
      await this.createUpdateTokenOwnership({
        contractAddress,
        from,
        to,
        tokenId,
        quantity: value,
        balanceFrom: balanceFrom.toNumber(),
        balanceTo: balanceTo.toNumber(),
        timestamp: timestamp,
        chainId,
        transactionHash,
        blockNumber: blockNumberInt,
        txIndex: 0,
        logIndex,
      });
    // If tokenOwnerships has not changed && transfer is not mint return
    if (from == ethers.constants.AddressZero) {
      await this.createOrMintItem({
        contract,
        collection,
        metadata,
        tokenId,
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
    const blockNumberInt = parseInt(blockNumber.toString());

    const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
    for (let i = 0; i < ids.length; i++) {
      const tokenId = ids[i].toString();
      const quantity = values[i].toNumber();
      const metadataUri = await contract.uri(tokenId);
      let metadata;
      try {
        metadata = await this.getMetadata(metadataUri);
      } catch (err) {
        Logger.warn(err);
        metadata = {
          uri: metadataUri,
          name: '',
          image: '',
          description: '',
          attributes: []
        }
      }
      metadata = this.cleanMetadata({ uri: metadataUri, metadata, fallbackName: `${contractAddress}-${tokenId}` });
      const balanceFrom = from != ethers.constants.AddressZero
        ? await contract['balanceOf(address,uint256)'](from, ids[i], { blockTag: blockNumber })
        : ethers.BigNumber.from(0);
      const balanceTo = to != ethers.constants.AddressZero
        ? await contract['balanceOf(address,uint256)'](to, ids[i], { blockTag: blockNumber })
        : ethers.BigNumber.from(0);
      const tokenOwnershipWrite =
        await this.createUpdateTokenOwnership({
          contractAddress,
          from,
          to,
          tokenId,
          quantity,
          balanceFrom: balanceFrom.toNumber(),
          balanceTo: balanceTo.toNumber(),
          timestamp: timestamp,
          chainId,
          transactionHash,
          blockNumber: blockNumberInt,
          txIndex: i,
          logIndex,
          isBatch: true,
        });
      // If tokenOwnerships has not changed && transfer is not mint return
    if (from == ethers.constants.AddressZero) {
        await this.createOrMintItem({
          contract,
          collection,
          tokenId: ids[i].toString(),
          chainId,
          tokenType,
          metadata,
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
    balanceFrom,
    balanceTo,
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
    balanceFrom: number;
    balanceTo: number;
    timestamp: number;
    chainId: number;
    transactionHash: string;
    blockNumber: number;
    txIndex: number;
    logIndex: number;
    isBatch?: boolean;
  }) {
    const tokenTransferHistory =
      await this.prisma.tokenTransferHistory.findFirst({
        where: {
          transactionHash,
          txIndex,
          chainId,
          logIndex,
        },
      });
    if (tokenTransferHistory) return [];

    await this.prisma.tokenTransferHistory.upsert({
      where: {
        transactionHash_chainId_txIndex_logIndex: {
          transactionHash,
          txIndex,
          chainId,
          logIndex,
        },
      },
      create: {
        contractAddress: contractAddress.toLowerCase(),
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
        isBatch,
      },
      update: {},
    })

    const _from = await this.prisma.tokenOwnerships.findFirst({
      where: {
        contractAddress: {
          contains: contractAddress,
          mode: 'insensitive',
        },
        tokenId,
        ownerAddress: {
          contains: from,
          mode: 'insensitive',
        },
        chainId,
      },
    });
    const _to = await this.prisma.tokenOwnerships.findFirst({
      where: {
        contractAddress: {
          contains: contractAddress,
          mode: 'insensitive',
        },
        tokenId,
        ownerAddress: {
          contains: to,
          mode: 'insensitive',
        },
        chainId,
      },
    });

    
    // Upsert From
    if (_from && _from.ownerAddress != ethers.constants.AddressZero) {
      await this.prisma.tokenOwnerships.upsert({
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
            quantity: balanceFrom,
            timestamp,
            chainId,
            transactionHash,
          },
          update: {
            quantity: balanceFrom,
            transactionHash,
          },
        })
    }

    await this.prisma.tokenOwnerships.upsert({
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
          quantity: balanceTo,
          timestamp,
          chainId,
          transactionHash,
        },
        update: {
          quantity: balanceTo,
          transactionHash,
        },
      })
  }

  async createOrMintItem({
    contract,
    collection,
    tokenId,
    chainId,
    tokenType,
    contractAddress,
    user,
    amount = 1,
    metadata
  }: {
    contract: ethers.Contract;
    collection: Collection;
    tokenId: Prisma.Decimal;
    chainId: number;
    tokenType: TokenType;
    contractAddress: string;
    user: User;
    amount?: number;
    metadata?: Metadata
  }) {
    // check item using uuid, if exists, mint
    if (metadata.nusa_item_id) {
      const item = await this.prisma.item.findFirst({
        where: {
          uuid: metadata.nusa_item_id
        },
      })
      // This handles lazy mint sale
      if (item) {
        const onChainSupply = await (contract as NusaNFT).totalSupply(tokenId.toString());
        await this.prisma.item.update({
          where: { id: item.id },
          data: {
            tokenId: tokenId,
            quantity_minted: onChainSupply.toNumber()
          }
        });
        return;
      }
    }
    // else create
    const item = await this.prisma.item.findFirst({
      where: {
        tokenId: tokenId,
        contract_address: {
          contains: contractAddress,
          mode: 'insensitive',
        },
        chainId,
      },
      include: {
        attributes: true,
      },
    });
    let itemData: Prisma.ItemCreateInput = {
      chainId,
      uuid: metadata.nusa_item_id ? metadata.nusa_item_id : undefined,
      supply: amount,
      quantity_minted: amount,
      token_standard: tokenType,
      metadata: metadata.uri,
      tokenId: tokenId,
      contract_address: contractAddress.toLowerCase(),
      is_metadata_freeze: true,
      name: metadata.name,
      image: metadata.image,
      description: metadata.description,
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
    if (this.validateMetadataAttributes(metadata.attributes)) {
      itemData = {
        ...itemData,
        attributes: {
          createMany: {
            data: metadata.attributes.map((x) => ({ ...x, value: String(x.value) })),
          },
        },
      };
    };

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

  async extractMetadata(
    contract: ethers.Contract,
    collection: Collection,
    tokenId: Prisma.Decimal,
    tokenType: TokenType,
  ) {
    let name = '';
    let description = '';
    let image = '';
    let metadataUri = '';
    let attributes = [];
    try {
      if (tokenType == TokenType.ERC721) {
        metadataUri = await contract.tokenURI(tokenId);
        Logger.log({ metadataUri });
        metadataUri = normalizeIpfsUri(metadataUri);
      }
      if (tokenType == TokenType.ERC1155) {
        metadataUri = await contract.uri(tokenId);
        metadataUri = normalizeIpfsUri(metadataUri);
      }
      const metadata = await this.getMetadata(metadataUri);
      Logger.log({ metadata });
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

    return {
      name,
      description,
      image,
      metadataUri,
      attributes
    };
  }

  cleanMetadata({ uri, metadata, fallbackName }: { uri: string, metadata: any, fallbackName: string }) {
    const name = metadata.name ? metadata.name : fallbackName;
    const description = metadata.description;
    const image = metadata.image.includes('ipfs') ? normalizeIpfsUri(metadata.image) : metadata.image;
    uri = uri.includes('ipfs') ? normalizeIpfsUri(uri) : uri;
    const attributes = metadata.attributes;
    const nusa_collection = metadata.nusa_collection;

    return {
      ...metadata,
      name,
      description,
      image,
      uri,
      attributes,
      nusa_collection,
    };
  }

  async getMetadata(uri: string, timeout: number = 10000) {
    Logger.log('fetching metadata', uri);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (uri.startsWith('ipfs://')) {
      const res = await axios.get(
        `${process.env.IPFS_GATEWAY}/${uri.replace('ipfs://', '')}`,
        {
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'identity',
          },
          timeout,
        },
      ).catch(err => {
        Logger.error('fetch metadata failed');
        Logger.error(uri);
        Logger.error(err);
        throw new Error(err);
      }) 
      return this.parseJson(res.data);
    }
    const res = await axios.get(uri, {
      headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' },
      timeout,
    })
    .catch(err => {
      Logger.error('fetch metadata failed');
      Logger.error(uri);
      Logger.error(err);
      throw new Error(err);
    });
    return this.parseJson(res.data);
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
}
