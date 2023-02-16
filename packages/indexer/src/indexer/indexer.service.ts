import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BigNumber, ethers, logger } from 'ethers';
import { PrismaService } from 'src/prisma/prisma.service';
import * as NusaNFT from '../contract/NusaNFT.json';
import MarketplaceAbi from '../contract/Marketplace.json';
import * as NusaRoyaltyDistributor from '../contract/NusaRoyaltyDistributor.json';
import { ConfigService } from '@nestjs/config';
import _ from 'lodash';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ListingType, TokenType } from '@prisma/client';
import { MarkeplaceListing, MarketplaceNewOffer } from './interfaces';
import { WsProvider } from './ws-provider';
import { Collection, Prisma, User } from '@nusa-nft/database';
import { normalizeIpfsUri, nusaIpfsGateway } from 'src/lib/ipfs-uri';
import axios from 'axios';
import retry from 'async-retry';

const parseListingType = (listingTypeNumber: number) => {
  if (listingTypeNumber == 0) {
    return ListingType.Direct;
  }
  if (listingTypeNumber == 1) {
    return ListingType.Auction;
  }
};

@Injectable()
export class IndexerService implements OnModuleInit {
  provider;

  // Contracts
  erc1155: ethers.Contract;
  marketplace: ethers.Contract;
  royaltyDistributor: ethers.Contract;

  // ERC1155 Event Filters
  filterTransferSingle;

  // Marketplace Event Filters
  filterListingAdded;
  filterListingRemoved;
  filterListingUpdated;
  filterNewSale;
  filterNewOffer;
  filterAuctionClosed;

  chainId = +this.configService.get<number>('CHAIN_ID');

  // RoyaltyDistributor Event Filters
  filterRoyaltyPaid;

  MAX_INTEGER = 2147483647;
  INDEX_MARKETPLACE_PREVIOUS_BLOCK_FINISHED = false;
  INDEX_OLD_IMPORTED_CONTRACTS_BLOCK = false;
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
      NusaNFT.abi as any,
      this.provider,
    );

    this.marketplace = new ethers.Contract(
      this.configService.get<string>('MARKETPLACE_CONTRACT_ADDRESS'),
      MarketplaceAbi as any,
      this.provider,
    );

    this.royaltyDistributor = new ethers.Contract(
      this.configService.get<string>('ROYALTY_DISTRIBUTOR_CONTRACT_ADDRESS'),
      NusaRoyaltyDistributor.abi as any,
      this.provider,
    );

    this.filterTransferSingle = this.erc1155.filters.TransferSingle();
    this.filterListingAdded = this.marketplace.filters.ListingAdded();
    this.filterListingRemoved = this.marketplace.filters.ListingRemoved();
    this.filterListingUpdated = this.marketplace.filters.ListingUpdated();
    this.filterNewSale = this.marketplace.filters.NewSale();
    this.filterNewOffer = this.marketplace.filters.NewOffer();
    this.filterAuctionClosed = this.marketplace.filters.AuctionClosed();
    this.filterRoyaltyPaid = this.royaltyDistributor.filters.RoyaltyPaid();
  }

  async indexMarketplaceOldBlocks() {
    const blockNumbers = [];
    let fromBlock;
    let blockRange = [];

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

    if (indexerState) {
      fromBlock = indexerState.lastBlockProcessed;
    } else {
      fromBlock = Number(this.configService.get<string>('FROM_BLOCK'));
    }
    // ethers get latest block
    const latestBlockNumber = await this.provider.getBlockNumber();
    for (let i = fromBlock; i <= latestBlockNumber; i++) {
      blockNumbers.push(i);
    }
    console.log({ latestBlockNumber });
    // make chunk of per 3500 block range from previously determined block
    const chunk = _.chunk(blockNumbers, 1000);
    // make array of object fromBlock and toBlock value
    blockRange = chunk.map((arr) => {
      const toBlock = arr.slice(-1);
      const fromBlock = arr.slice(0, 1);
      return { fromBlock, toBlock };
    });

    for (const range of blockRange) {
      const { fromBlock, toBlock } = range;
      await this.queryFilterMarketplace(Number(fromBlock), Number(toBlock));
      await this.queryFilterRoyaltyDistributor(
        Number(fromBlock),
        Number(toBlock),
      );
      await this.updateLatestBlock(Number(toBlock));
    }
    this.INDEX_MARKETPLACE_PREVIOUS_BLOCK_FINISHED = true;
    Logger.log('INDEX MARKETPLACE PREVIOUS BLOCK DONE');
    return;
  }

  async indexNftOldBlocks() {
    const blockNumbers = [];
    let fromBlock;
    let blockRange = [];

    const indexerState = await this.prisma.importedContracts.findFirst({
      where: {
        isImportFinish: true,
      },
      orderBy: {
        lastIndexedBlock: 'desc',
      },
    });

    if (indexerState) {
      fromBlock = indexerState.lastIndexedBlock;
    } else {
      fromBlock = Number(this.configService.get<string>('FROM_BLOCK'));
    }
    // ethers get latest block
    const latestBlockNumber = await this.provider.getBlockNumber();
    for (let i = fromBlock; i <= latestBlockNumber; i++) {
      blockNumbers.push(i);
    }
    // make chunk of per 3500 block range from previously determined block
    const chunk = _.chunk(blockNumbers, 3000);
    // make array of object fromBlock and toBlock value
    blockRange = chunk.map((arr) => {
      const toBlock = arr.slice(-1);
      const fromBlock = arr.slice(0, 1);
      return { fromBlock, toBlock };
    });

    for (const range of blockRange) {
      const { fromBlock, toBlock } = range;
      const hexFromBlock = ethers.BigNumber.from(
        fromBlock.toString(),
      ).toHexString();
      const hexToBlock = ethers.BigNumber.from(
        toBlock.toString(),
      ).toHexString();
      await this.handleIndexing(hexFromBlock, hexToBlock);
      await this.prisma.importedContracts.updateMany({
        data: {
          lastIndexedBlock: +toBlock,
        },
      });
      console.log('imported contract block updated');
    }
    this.INDEX_OLD_IMPORTED_CONTRACTS_BLOCK = true;
    Logger.log('INDEX PREVIOUS TRANSFER EVENTS BLOCK DONE');
    return;
  }

  async onModuleInit() {
    this.indexMarketplaceOldBlocks();
    this.indexNftOldBlocks();
    // this.handleErc1155TransferSingle();

    this.handleMarketplaceListingAdded();
    this.handleMarketplaceListingRemoved();
    this.handleMarketplaceNewSale();
    this.handleMarketplaceNewOffer();
    this.handleMarketplaceAuctionClosed();
    this.queryFilterNftContracts();
    this.handleRoyaltyDistributorRoyaltyPaid();
  }

  @OnEvent('ws.closed')
  handleWsClosed() {
    // Restart should be handled by PM2
    process.exit(1);
  }

  async handleMarketplaceListingAdded() {
    this.marketplace.on(
      'ListingAdded',
      async (listingId, assetContract, lister, listing, log) => {
        const {
          tokenOwner,
          tokenId,
          startTime,
          endTime,
          quantity,
          currency,
          reservePricePerToken,
          buyoutPricePerToken,
          tokenType,
          listingType,
        } = listing;
        Logger.log('ListingAdded');
        // console.log(listingId, lister, assetContract, listing, log);
        const { blockNumber } = log;
        const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
        await this.indexMarketplaceCreateListingHistory({
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
          createdAt: timestamp,
        });
        if (this.INDEX_MARKETPLACE_PREVIOUS_BLOCK_FINISHED)
          await this.updateLatestBlock(blockNumber);
      },
    );
  }

  async handleMarketplaceListingRemoved() {
    this.marketplace.on(
      'ListingRemoved',
      async (listingId, listingCreator, log) => {
        console.log(listingId, log);
        const { blockNumber } = log;
        const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
        await this.indexMarketplaceRemoveListing({
          listingId,
          updatedAt: timestamp,
        });
        if (this.INDEX_MARKETPLACE_PREVIOUS_BLOCK_FINISHED)
          await this.updateLatestBlock(blockNumber);
      },
    );
  }

  async handleMarketplaceListingUpdated() {
    this.marketplace.on('ListingUpdated', async (id, listingCreator, log) => {
      console.log(id, 'ini log', log);
      const { blockNumber } = log;
      const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
      const listing = await this.marketplace.listings(id);
      console.log(listing);
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
      });
      if (this.INDEX_MARKETPLACE_PREVIOUS_BLOCK_FINISHED)
        await this.updateLatestBlock(blockNumber);
    });
  }

  async handleMarketplaceNewSale() {
    this.marketplace.on(
      'NewSale',
      async (
        _listingId,
        _assetContract,
        _lister,
        buyer,
        quantityBought,
        totalPricePaid,
        log,
      ) => {
        console.log(_listingId, 'ini log', log);
        const { blockNumber, transactionHash } = log;
        const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;

        await this.indexMarketplaceNewSale({
          listingId: _listingId,
          assetContract: _assetContract,
          lister: _lister,
          buyer,
          quantityBought,
          totalPricePaid,
          createdAt: timestamp,
          transactionHash,
        });

        const listing = await this.marketplace.listings(_listingId);
        console.log(listing);
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
        });
        if (this.INDEX_MARKETPLACE_PREVIOUS_BLOCK_FINISHED)
          await this.updateLatestBlock(blockNumber);
      },
    );
  }

  async handleMarketplaceAuctionClosed() {
    this.marketplace.on(
      'AuctionClosed',
      async (
        listingId,
        closer,
        cancelled,
        auctionCreator,
        winningBidder,
        log,
      ) => {
        const { blockNumber, transactionHash } = log;
        await this.handleAuctionClosed(
          { listingId, closer, cancelled, auctionCreator, winningBidder },
          log,
        );
        if (this.INDEX_MARKETPLACE_PREVIOUS_BLOCK_FINISHED)
          await this.updateLatestBlock(blockNumber);
      },
    );
  }

  async handleMarketplaceNewOffer() {
    this.marketplace.on(
      'NewOffer',
      async (
        listingId: BigNumber,
        offeror: string,
        listingType: number,
        quantityWanted: BigNumber,
        totalOfferAmount: BigNumber,
        currency: string,
        log: any,
      ) => {
        const { blockNumber, transactionHash } = log;
        const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
        const offer = await this.marketplace.offers(listingId, offeror);
        await this.indexMarketplaceNewOffer({
          listingId,
          offeror,
          listingType,
          quantityWanted,
          totalOfferAmount,
          currency,
          createdAt: timestamp,
          expirationTimestamp: offer.expirationTimestamp,
          transactionHash,
        });
        // Update listing because listing time maybe increased when an offer is created
        const listing = await this.marketplace.listings(listingId);
        const {
          tokenOwner,
          assetContract,
          tokenId,
          startTime,
          endTime,
          quantity,
          reservePricePerToken,
          buyoutPricePerToken,
        } = listing;
        await this.indexMarketplaceUpdateListing({
          listingId: listing.listingId,
          assetContract,
          tokenOwner,
          tokenId,
          startTime,
          endTime,
          quantity,
          currency: listing.currency,
          reservePricePerToken,
          buyoutPricePerToken,
          updatedAt: timestamp,
        });
        if (this.INDEX_MARKETPLACE_PREVIOUS_BLOCK_FINISHED)
          await this.updateLatestBlock(blockNumber);
      },
    );
  }

  async handleRoyaltyDistributorRoyaltyPaid() {
    this.royaltyDistributor.on(
      'RoyaltyPaid',
      async (
        listingId: BigNumber,
        recipients: string[],
        bpsPerRecipients: BigNumber[],
        totalPayout: BigNumber,
        log: any,
      ) => {
        const listing = await this.prisma.marketplaceListing.findFirst({
          where: {
            listingId: listingId.toNumber(),
          },
        });
        if (!listing) return;

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

          await this.prisma.royaltyPaid.create({
            data: {
              listingId: listingId.toNumber(),
              recipient: rec,
              bps: bps.toNumber(),
              amount: amount.toString(),
              createdAt: timestamp,
              transactionHash,
            },
          });
        }
      },
    );
  }

  async updateLatestBlock(blockNumber: number) {
    console.log('contract block updated');
    const indexerState = await this.prisma.indexerState.findFirst();
    if (!indexerState) {
      await this.prisma.indexerState.create({
        data: {
          lastBlockProcessed: blockNumber,
        },
      });
      return;
    }
    if (blockNumber <= indexerState.lastBlockProcessed) {
      return;
    }
    if (blockNumber > indexerState.lastBlockProcessed) {
      Logger.log(`${blockNumber} > ${indexerState.lastBlockProcessed}`);
      await this.prisma.indexerState
        .upsert({
          where: { lastBlockProcessed: indexerState.lastBlockProcessed },
          create: { lastBlockProcessed: blockNumber },
          update: { lastBlockProcessed: blockNumber },
        })
        .catch(async () => {
          await this.prisma.indexerState.deleteMany();
          await this.prisma.indexerState.create({
            data: {
              lastBlockProcessed: blockNumber,
            },
          });
        });
      Logger.log('indexerState.lastBlockProcessed updated');
      return;
    }
  }

  async queryFilterMarketplace(fromBlock: number, toBlock: number) {
    Logger.log(`queryFilterMarketplace(${fromBlock}, ${toBlock})`);
    const logs = await this.marketplace.queryFilter(
      {
        topics: [
          [
            this.filterListingAdded.topics[0],
            this.filterListingRemoved.topics[0],
            this.filterListingUpdated.topics[0],
            this.filterNewSale.topics[0],
            this.filterNewOffer.topics[0],
            this.filterAuctionClosed.topics[0],
          ],
        ],
      },
      fromBlock,
      toBlock,
    );
    /**
     * Parsing logs with ABI -> https://github.com/ethers-io/ethers.js/issues/487
     * Constructing ABI -> https://docs.ethers.io/v5/api/utils/abi/interface/#Interface--creating
     * Marketplace Contract Event Reference -> https://github.dev/thirdweb-dev/contracts/blob/main/contracts/marketplace/Marketplace.sol
     */
    const iface = new ethers.utils.Interface([
      'event ListingAdded(uint256 indexed listingId, address indexed assetContract, address indexed lister, tuple(uint256 listingId, address tokenOwner, address assetContract, uint256 tokenId, uint256 startTime, uint256 endTime, uint256 quantity, address currency, uint256 reservePricePerToken, uint256 buyoutPricePerToken, uint8 tokenType, uint8 listingType) listing)',
      'event ListingRemoved(uint256 indexed listingId, address indexed listingCreator)',
      'event ListingUpdated(uint256 indexed listingId, address indexed listingCreator)',
      'event NewSale(uint256 indexed listingId, address indexed assetContract, address indexed lister, address buyer, uint256 quantityBought, uint256 totalPricePaid)',
      'event NewOffer(uint256 indexed listingId, address indexed offeror, uint8 indexed listingType, uint256 quantityWanted, uint256 totalOfferAmount, address currency)',
      'event AuctionClosed(uint256 indexed listingId, address indexed closer, bool indexed cancelled, address auctionCreator, address winningBidder)',
    ]);
    for (const log of logs) {
      const event = iface.parseLog(log);
      const timestamp = (await this.provider.getBlock(log.blockNumber))
        .timestamp;
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
        const listing = await this.marketplace.listings(event.args.listingId);
        console.log(listing);
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
        });
        // await this.updateLatestBlock(log.blockNumber);
      }
      if (event.name == 'NewSale') {
        Logger.log('NewSale');
        const timestamp = (await this.provider.getBlock(log.blockNumber))
          .timestamp;
        const listing = await this.marketplace.listings(event.args.listingId);
        console.log(listing);
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
        });
      }

      if (event.name == 'NewOffer') {
        Logger.log('NewOffer');
        const timestamp = (await this.provider.getBlock(log.blockNumber))
          .timestamp;
        const offer = await this.marketplace.offers(
          event.args.listingId,
          event.args.offeror,
        );
        await this.indexMarketplaceNewOffer({
          listingId: event.args.listingId,
          offeror: event.args.offeror,
          listingType: event.args.listingType,
          quantityWanted: event.args.quantityWanted,
          totalOfferAmount: event.args.totalOfferAmount,
          currency: event.args.currency,
          createdAt: timestamp,
          transactionHash: log.transactionHash,
          expirationTimestamp: offer.expirationTimestamp,
        });
        // Update listing because listing time maybe increased when an offer is created
        const listing = await this.marketplace.listings(event.args.listingId);
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
        });
      }

      if (event.name == 'AuctionClosed') {
        Logger.log('AuctionClosed');
        await this.handleAuctionClosed(event.args, log);
      }
    }
  }

  async queryFilterRoyaltyDistributor(fromBlock: number, toBlock: number) {
    const logs = await this.royaltyDistributor.queryFilter(
      {
        topics: [[this.filterRoyaltyPaid.topics[0]]],
      },
      fromBlock,
      toBlock,
    );
    const iface = new ethers.utils.Interface([
      'event RoyaltyPaid(uint256 indexed listingId, address[] recipients, uint64[] bpsPerRecipients, uint256 totalPayout)',
    ]);
    for (const log of logs) {
      const { transactionHash } = log;
      const event = iface.parseLog(log);
      const timestamp = (await this.provider.getBlock(log.blockNumber))
        .timestamp;
      if (event.name == 'RoyaltyPaid') {
        const { listingId, recipients, bpsPerRecipients, totalPayout } =
          event.args;

        const listing = await this.prisma.marketplaceListing.findFirst({
          where: {
            listingId: listingId.toNumber(),
          },
        });
        if (!listing) continue;

        for (const [i, rec] of (recipients as Array<string>).entries()) {
          const royaltyPaid = await this.prisma.royaltyPaid.findFirst({
            where: { transactionHash, recipient: rec },
          });
          if (royaltyPaid) continue;
          const bps: ethers.BigNumber = bpsPerRecipients[i];
          const amount: ethers.BigNumber = (totalPayout as ethers.BigNumber)
            .mul(bps)
            .div(10000);

          await this.prisma.royaltyPaid.create({
            data: {
              listingId: listingId.toNumber(),
              recipient: rec,
              bps: bps.toNumber(),
              amount: amount.toString(),
              createdAt: timestamp,
              transactionHash,
            },
          });
        }
      }
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

    const listing = await this.marketplace.listings(args.listingId);
    console.log(listing);
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
        updatedAt: timestamp,
        isClosedByLister: true,
      });
      return;
    }

    // If Auction Closed by bidder
    const winningBid = await this.marketplace.winningBid(listingId);
    await this.indexMarketplaceNewSale({
      listingId,
      assetContract,
      lister: auctionCreator,
      buyer: winningBidder,
      quantityBought: quantity,
      totalPricePaid: winningBid.pricePerToken.mul(quantity),
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
    createdAt,
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
        listingId: parseInt(listingId._hex),
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
          listingId: parseInt(listingId._hex),
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
          createdAt,
        },
      });
      return listingHistory;
    }
  }

  async indexMarketplaceRemoveListing({ listingId, updatedAt }) {
    const listing = await this.prisma.marketplaceListing.findFirst({
      where: { listingId: parseInt(listingId) },
    });
    if (!listing) return;
    const deleteListing = await this.prisma.marketplaceListing.update({
      where: {
        listingId: parseInt(listingId),
      },
      data: {
        isCancelled: true,
        updatedAt,
      },
    });
    console.log(deleteListing);
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
  }: MarkeplaceListing) {
    const _endTime =
      endTime.toNumber() > this.MAX_INTEGER
        ? this.MAX_INTEGER
        : endTime.toNumber();
    const listing = await this.prisma.marketplaceListing.findFirst({
      where: {
        listingId: listingId.toNumber(),
      },
    });
    if (!listing) return;
    const updateListing = await this.prisma.marketplaceListing.update({
      where: {
        listingId: listingId.toNumber(),
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
      },
    });
    console.log(updateListing);
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
      where: { listingId: parseInt(listingId) },
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
    console.log(newSale);
    return newSale;
  }

  async indexMarketplaceNewOffer({
    listingId,
    offeror,
    listingType,
    quantityWanted,
    totalOfferAmount,
    currency,
    createdAt,
    expirationTimestamp,
    transactionHash,
  }: MarketplaceNewOffer) {
    const offer = await this.prisma.marketplaceOffer.findFirst({
      where: { transactionHash },
    });
    const listing = await this.prisma.marketplaceListing.findFirst({
      where: { listingId: listingId.toNumber() },
    });
    if (offer || !listing) {
      return;
    }

    await this.prisma.marketplaceOffer.create({
      data: {
        listingId: listingId.toNumber(),
        offeror,
        listingType: parseListingType(listingType),
        quantityWanted: quantityWanted.toNumber(),
        totalOfferAmount: totalOfferAmount.toString(),
        currency,
        createdAt,
        expirationTimestamp: expirationTimestamp.toNumber(),
        transactionHash,
      },
    });
  }

  async queryFilterNftContracts() {
    // query new blocks
    this.provider.on('block', async (blockNumber: number) => {
      const blockNumberString =
        ethers.BigNumber.from(blockNumber).toHexString();
      this.handleIndexing(blockNumberString, blockNumberString);
    });
  }

  async handleIndexing(fromBlock: string, toBlock: string) {
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

    if (contractAdresses.length < 1) return;

    const topics = [
      'TransferSingle(address,address,address,uint256,uint256)',
      'TransferBatch(address,address,address,uint256[],uint256[])',
      'Transfer(address,address,uint256)',
    ];

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

    const arrayOfTopics = [];
    for (const topic of topics) {
      arrayOfTopics.push(ethers.utils.id(topic));
    }
    const logs = await this.provider.send('eth_getLogs', [
      {
        address: contractAdresses,
        fromBlock: fromBlock,
        toBlock: toBlock,
        topics: [arrayOfTopics],
      },
    ]);

    const iface = new ethers.utils.Interface(abi);
    for (const log of logs) {
      const event = iface.parseLog(log);
      const { blockNumber, logIndex } = log;
      const logIndexParsed = parseInt(logIndex.toString());
      const blockNumberParsed = parseInt(blockNumber.toString());
      Logger.log('processing event', JSON.stringify(event));
      const contractAddress: string = log.address;

      const contract = new ethers.Contract(contractAddress, abi, this.provider);

      let tokenId;
      if (event.name == 'Transfer') {
        tokenId = parseInt(event.args[2]._hex);
      }
      if (event.name == 'TransferBatch') {
        const ids = event.args[3];
        tokenId = ids[0].toString();
      }
      if (event.name == 'TransferSingle') {
        tokenId = parseInt(event.args[3]._hex);
      }

      let collection;
      console.log(
        contractAddress.toLowerCase(),
        nusaContractAddress.toLowerCase(),
      );

      if (contractAddress.toLowerCase() != nusaContractAddress.toLowerCase()) {
        // Get Collection from imported contract address
        console.log('kesana');
        collection = await this.prisma.collection.findFirstOrThrow({
          where: {
            contract_address: {
              contains: contractAddress,
              mode: 'insensitive',
            },
          },
        });
      } else {
        // Create nusa-collection (if not exists) for items that do not have a collection
        console.log('kesini');
        const metadataUri = await contract.uri(tokenId);
        const metadata = await this.getMetadata(metadataUri);
        if (!metadata.nusa_collection) {
          const privateKey = process.env.NFT_CONTRACT_OWNER_PRIVATE_KEY;
          const nusaWallet = new ethers.Wallet(
            privateKey,
            this.provider,
          );

          const findNusaCollection: Collection =
            await this.prisma.collection.findFirst({
              where: {
                slug: {
                  contains: 'nusa-collection',
                },
              },
            });

          if (!findNusaCollection) {
            collection = await this.prisma.collection.create({
              data: {
                name: 'nusa collection',
                slug: 'nusa-collection',
                Category: {
                  connect: {
                    id: 1,
                  },
                },
                contract_address: nusaContractAddress.toLowerCase(),
                Creator: {
                  connectOrCreate: {
                    create: {
                      username: 'nusa collection',
                      wallet_address: nusaWallet.address,
                    },
                    where: {
                      wallet_address: nusaWallet.address,
                    },
                  },
                },
              },
            });
          } else {
            collection = findNusaCollection;
          }
        } else {
          // Find item's collection from metadata info 
          const slug = metadata.nusa_collection.slug;
          console.log(slug);
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

      console.log('ini data collection', collection);
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

      if (
        fromBlock == toBlock &&
        this.INDEX_OLD_IMPORTED_CONTRACTS_BLOCK &&
        this.INDEX_MARKETPLACE_PREVIOUS_BLOCK_FINISHED
      ) {
        if (
          contractAddress.toLowerCase() == nusaContractAddress.toLowerCase()
        ) {
          await this.updateLatestBlock(blockNumberParsed);
        } else {
          console.log(contractAddress, this.chainId);
          const update = await this.prisma.importedContracts.updateMany({
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
          console.log(update);
          console.log('imported contract block updated');
        }
      }
      return;
    }
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
    const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
    const blockNumberHashed = parseInt(blockNumber.toString());

    await this.createUpdateImportedContractTokenOwnership({
      contractAddress,
      from,
      to,
      tokenId,
      quantity: 1,
      timestamp,
      chainId,
      transactionHash,
      blockNumber: blockNumberHashed,
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
    const tokenId = event.args[3].toString();
    const value = event.args[4].toNumber();
    const { blockNumber, transactionHash } = log;
    const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
    const blockNumberHashed = parseInt(blockNumber.toString());

    const tokenOwnershipWrite =
      await this.createUpdateImportedContractTokenOwnership({
        contractAddress,
        from,
        to,
        tokenId,
        quantity: value,
        timestamp: timestamp,
        chainId,
        transactionHash,
        blockNumber: blockNumberHashed,
        txIndex: 0,
        logIndex,
      });
    // If tokenOwnerships has not changed && transfer is not mint return
    if (from == ethers.constants.AddressZero &&
        contractAddress.toLowerCase() != (process.env.NFT_CONTRACT_ADDRESS).toLowerCase()
      ) {
      await this.createItemIfNotExists({
        contract,
        collection,
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
    const blockNumberHashed = parseInt(blockNumber.toString());

    const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
    for (let i = 0; i < ids.length; i++) {
      console.log({ tokenId: ids[i].toString() });
      console.log({ quantity: values[i].toString() });
      const tokenId = ids[i].toString();
      const quantity = values[i].toNumber();

      const tokenOwnershipWrite =
        await this.createUpdateImportedContractTokenOwnership({
          contractAddress,
          from,
          to,
          tokenId,
          quantity,
          timestamp: timestamp,
          chainId,
          transactionHash,
          blockNumber: blockNumberHashed,
          txIndex: i,
          logIndex,
          isBatch: true,
        });
      // If tokenOwnerships has not changed && transfer is not mint return
    if (from == ethers.constants.AddressZero && contractAddress != process.env.NFT_CONTRACT_ADDRESS) {
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

  async createUpdateImportedContractTokenOwnership({
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

    const transactions = [];
    transactions.push(
      this.prisma.tokenTransferHistory.upsert({
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
      }),
    );

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
    tokenId: Prisma.Decimal;
    chainId: number;
    tokenType: TokenType;
    contractAddress: string;
    user: User;
    amount?: number;
  }) {
    console.log('handle check if item not exist');
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
    let name;
    let metadataUri;
    let attributes;
    let description;
    let image;
    if (!item || !item.image || !item.name) {
      const metadata = await this.extractMetadata(
        contract,
        collection,
        tokenId,
        tokenType,
      );
      console.log({ metadata });
      name = metadata.name;
      metadataUri = metadata.metadataUri;
      attributes = metadata.attributes;
      description = metadata.description;
      image = metadata.image;
    } else {
      name = item.name;
      metadataUri = item.metadata;
      description = item.description;
      attributes = item.attributes.map((x) => ({
        trait_type: x.trait_type,
        value: x.value,
      }));
    }
    let itemData: Prisma.ItemCreateInput = {
      chainId,
      supply: amount,
      quantity_minted: amount,
      token_standard: tokenType,
      metadata: metadataUri,
      tokenId: tokenId,
      contract_address: contractAddress.toLowerCase(),
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

    console.log('create or update item finished');
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
    return { name, description, image, metadataUri, attributes };
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
      );
      return this.parseJson(res.data);
    }
    const res = await axios.get(uri, {
      headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' },
      timeout,
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
