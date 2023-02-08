import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BigNumber, ethers } from 'ethers';
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

  // RoyaltyDistributor Event Filters
  filterRoyaltyPaid;

  MAX_INTEGER = 2147483647;
  INDEX_OLD_BLOCKS_FINISHED = false;
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

  async indexOldBlocks() {
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
      await this.queryFilterErc1155(Number(fromBlock), Number(toBlock));
      await this.queryFilterMarketplace(Number(fromBlock), Number(toBlock));
      await this.queryFilterRoyaltyDistributor(
        Number(fromBlock),
        Number(toBlock),
      );
      await this.updateLatestBlock(Number(toBlock));
    }
    this.INDEX_OLD_BLOCKS_FINISHED = true;
    Logger.log('INDEX OLD BLOCK DONE');
    return;
  }

  async onModuleInit() {
    this.indexOldBlocks();

    this.handleErc1155TransferSingle();

    this.handleMarketplaceListingAdded();
    this.handleMarketplaceListingRemoved();
    this.handleMarketplaceNewSale();
    this.handleMarketplaceNewOffer();
    this.handleMarketplaceAuctionClosed();

    this.handleRoyaltyDistributorRoyaltyPaid();
  }

  @OnEvent('ws.closed')
  handleWsClosed() {
    // Restart should be handled by PM2
    process.exit(1);
  }

  async handleErc1155TransferSingle() {
    // listen to new transfer transaction
    this.erc1155.on(
      'TransferSingle',
      async (operator, from, to, tokenId, value, log) => {
        const { blockNumber, transactionHash } = log;
        const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
        await this.prisma.erc1155TransferHistory.create({
          data: {
            operator,
            from,
            to,
            tokenId: parseInt(tokenId),
            block: blockNumber,
            value: parseInt(value),
            createdAt: timestamp,
            transactionHash,
          },
        });
        await this.createUpdateTokenOwnership({
          from: log.args.from,
          to: log.args.to,
          tokenId: parseInt(tokenId),
          quantity: parseInt(value),
          timestamp,
          transactionHash,
        });
        if (this.INDEX_OLD_BLOCKS_FINISHED)
          await this.updateLatestBlock(blockNumber);
      },
    );
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
        if (this.INDEX_OLD_BLOCKS_FINISHED)
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
        if (this.INDEX_OLD_BLOCKS_FINISHED)
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
      if (this.INDEX_OLD_BLOCKS_FINISHED)
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
        if (this.INDEX_OLD_BLOCKS_FINISHED)
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
        if (this.INDEX_OLD_BLOCKS_FINISHED)
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
        if (this.INDEX_OLD_BLOCKS_FINISHED)
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
            listingId: listingId.toNumber()
          }
        })
        if (!listing) return;

        const { blockNumber, transactionHash } = log;
        const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
        for (const [i, rec] of (recipients as Array<string>).entries()) {
          const royaltyPaid = await this.prisma.royaltyPaid.findFirst({
            where: { transactionHash, recipient: rec }
          })
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

  async queryFilterErc1155(fromBlock: number, toBlock: number) {
    Logger.log(`queryFilterErc1155(${fromBlock}, ${toBlock})`);
    const logs = await this.erc1155.queryFilter(
      this.filterTransferSingle,
      Number(fromBlock),
      Number(toBlock),
    );
    for (const log of logs) {
      Logger.log('ERC1155#TransferSingle');
      const entry = await this.prisma.erc1155TransferHistory.findFirst({
        where: {
          transactionHash: log.transactionHash,
        },
      });
      if (!entry) {
        const tokenId = parseInt(log.args.id);
        const value = parseInt(log.args.value);
        const timestamp = (await this.provider.getBlock(log.blockNumber))
          .timestamp;
        await this.prisma.erc1155TransferHistory.create({
          data: {
            operator: log.args.operator,
            from: log.args.from,
            to: log.args.to,
            tokenId: tokenId,
            block: log.blockNumber,
            value: value,
            createdAt: timestamp,
            transactionHash: log.transactionHash,
          },
        });
        await this.createUpdateTokenOwnership({
          from: log.args.from,
          to: log.args.to,
          tokenId,
          quantity: value,
          timestamp,
          transactionHash: log.transactionHash
        });
      }
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
        // await this.updateLatestBlock(log.blockNumber);
      }
      if (event.name == 'ListingRemoved') {
        Logger.log('ListingRemoved');
        const timestamp = (await this.provider.getBlock(log.blockNumber))
          .timestamp;
        this.indexMarketplaceRemoveListing({
          listingId: event.args.listingId,
          updatedAt: timestamp,
        });
        // await this.updateLatestBlock(log.blockNumber);
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
            listingId: listingId.toNumber()
          }
        })
        if (!listing) continue;

        for (const [i, rec] of (recipients as Array<string>).entries()) {
          const royaltyPaid = await this.prisma.royaltyPaid.findFirst({
            where: { transactionHash, recipient: rec }
          })
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
    const item = await this.prisma.item.findFirst({ where: { tokenId: tokenId.toNumber() }})

    if (checkListingId || !item) return;
    else {
      const listingHistory = await this.prisma.marketplaceListing.create({
        data: {
          listingId: parseInt(listingId._hex),
          lister,
          tokenOwner,
          assetContract,
          chainId: Number(process.env.CHAIN_ID),
          tokenId: parseInt(tokenId._hex),
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
      where: { listingId: parseInt(listingId) }
    })
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
        listingId: listingId.toNumber()
      }
    })
    if (!listing) return;
    const updateListing = await this.prisma.marketplaceListing.update({
      where: {
        listingId: listingId.toNumber(),
      },
      data: {
        isCancelled: false,
        updatedAt,
        tokenOwner,
        assetContract,
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
      where: { listingId: parseInt(listingId) }
    })
    if (sale || !listing) return;

    const newSale = await this.prisma.marketplaceSale.create({
      data: {
        listingId: parseInt(listingId),
        assetContract: assetContract,
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
      where: { listingId: listingId.toNumber() }
    })
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

  async createUpdateTokenOwnership({
    from,
    to,
    tokenId,
    quantity,
    timestamp,
    transactionHash
  }: {
    from: string,
    to: string,
    tokenId: number,
    quantity: number,
    timestamp: number,
    transactionHash: string
  }) {
    const _from = await this.prisma.tokenOwnerships.findFirst({
      where: {
        contractAddress: this.configService.get<string>('NFT_CONTRACT_ADDRESS'),
        tokenId,
        ownerAddress: from,
      }
    })

    const _to = await this.prisma.tokenOwnerships.findFirst({
      where: {
        contractAddress: this.configService.get<string>('NFT_CONTRACT_ADDRESS'),
        tokenId,
        ownerAddress: to,
      }
    })

    // Upsert From
    if (_from && _from.ownerAddress != ethers.constants.AddressZero) {
      console.log(
        this.configService.get<string>('NFT_CONTRACT_ADDRESS'),
        tokenId,
        from,
      )
      await this.prisma.tokenOwnerships.upsert({
        where: {
          contractAddress_chainId_tokenId_ownerAddress: {
            contractAddress: this.configService.get<string>('NFT_CONTRACT_ADDRESS'),
            tokenId,
            ownerAddress: from,
            chainId: +this.configService.get<number>('CHAIN_ID')
          }
        },
        create: {
          contractAddress: this.configService.get<string>('NFT_CONTRACT_ADDRESS'),
          tokenId,
          ownerAddress: from,
          quantity: _from ? _from.quantity - quantity : 0,
          timestamp,
          transactionHash,
          chainId: +this.configService.get<number>('CHAIN_ID'),
        },
        update: {
          quantity: _from ? _from?.quantity - quantity : 0
        }
      })
    }

    // Upsert To
    await this.prisma.tokenOwnerships.upsert({
      where: {
        contractAddress_chainId_tokenId_ownerAddress: {
          contractAddress: this.configService.get<string>('NFT_CONTRACT_ADDRESS'),
          tokenId,
          ownerAddress: to,
          chainId: +this.configService.get<number>('CHAIN_ID'),
        }
      },
      create: {
        contractAddress: this.configService.get<string>('NFT_CONTRACT_ADDRESS'),
        tokenId,
        ownerAddress: to,
        quantity: _to ? _to.quantity + quantity : quantity,
        timestamp,
        transactionHash,
        chainId: +this.configService.get<number>('CHAIN_ID')
      },
      update: {
        quantity: _to ? _to?.quantity + quantity : quantity
      }
    })
  }
}
