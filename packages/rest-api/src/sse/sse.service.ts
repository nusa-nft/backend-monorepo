import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as MarketplaceAbi from '../abi/marketplace.json';
import { abi as NFTContractAbi } from '../abi/NusaNFT.json';
import { ethers, BigNumber } from 'ethers';
import { WsProvider } from './ws-provider';
import { ConfigService } from '@nestjs/config';
import { parseListingType } from 'src/lib/parseListingType';
import { IndexerService } from 'src/indexer/indexer.service';
import { UsersService } from 'src/users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';
import { events } from 'src/lib/newEventEmitter';

@Injectable()
export class SseService implements OnModuleInit {
  provider;

  marketplace: ethers.Contract;
  nftContract: ethers.Contract;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private configService: ConfigService,
    private indexerService: IndexerService,
    private usersService: UsersService,
    private prisma: PrismaService,
  ) {
    // this.eventEmitter.setMaxListeners(100000);
    const wsProvider = new WsProvider(
      {
        KEEP_ALIVE_CHECK_INTERVAL: 10000,
        RPC_URL: this.configService.get<string>('WSS_RPC_URL'),
      },
      this.eventEmitter,
    );

    this.provider = wsProvider.provider;

    this.marketplace = new ethers.Contract(
      this.configService.get<string>('MARKETPLACE_CONTRACT_ADDRESS'),
      MarketplaceAbi as any,
      this.provider,
    );

    this.nftContract = new ethers.Contract(
      this.configService.get<string>('NFT_CONTRACT_ADDRESS'),
      NFTContractAbi as any,
      this.provider,
    );
  }

  async onModuleInit() {
    this.handleMarketplaceNewSale();
    this.handleMarketplaceNewOffer();
    this.handleLazyMintedSale();
  }

  async handleMarketplaceNewSale() {
    this.marketplace.on(
      'NewSale',
      async (
        _listingId,
        _assetContract,
        listerAddress,
        buyerAddress,
        quantityBought,
        totalPricePaid,
        log,
      ) => {
        const { blockNumber, transactionHash } = log;
        const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
        const notificationData = await this.prisma.notification.create({
          data: {
            notification_type: NotificationType.Sale,
            is_seen: false,
          },
        });

        const saleData = await this.prisma.notificationDetailSale.create({
          data: {
            listingId: parseInt(_listingId._hex),
            asset_contract: _assetContract,
            lister_wallet_address: listerAddress,
            buyer_wallet_address: buyerAddress,
            quantity_bought: parseInt(quantityBought._hex),
            total_price_paid: parseInt(totalPricePaid._hex),
            transaction_hash: transactionHash,
            notification_id: +notificationData.id,
            createdAt_timestamp: timestamp,
          },
        });

        return saleData;
      },
    );
  }

  async handleMarketplaceNewOffer() {
    this.marketplace.on(
      'NewOffer',
      async (
        listingId: BigNumber,
        offerorAddress: string,
        listingType: number,
        quantityWanted: BigNumber,
        totalOfferAmount: BigNumber,
        currency: string,
        log: any,
      ) => {
        const { blockNumber, transactionHash } = log;
        const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
        const offer = await this.marketplace.offers(listingId, offerorAddress);
        const listingIdData = parseInt(listingId._hex);
        const listerAddress =
          await this.indexerService.getMarketplaceListerAddress(listingIdData);

        const notificationData = await this.prisma.notification.create({
          data: {
            notification_type: NotificationType.Offer,
            is_seen: false,
          },
        });

        const offerData = await this.prisma.notificationDetailOffer.create({
          data: {
            listingId: listingIdData,
            lister_wallet_address: listerAddress,
            offeror_wallet_address: offerorAddress,
            listing_type: parseListingType(listingType),
            quantity_wanted: parseInt(quantityWanted._hex),
            total_offer_ammount: parseInt(totalOfferAmount._hex),
            currency,
            expiration_timestamp: parseInt(offer.expirationTimestamp._hex),
            transaction_hash: transactionHash,
            notification_id: +notificationData.id,
            createdAt_timestamp: timestamp,
          },
        });

        return offerData;
      },
    );
  }

  async handleLazyMintedSale() {
    events.on('notification', async (eventData) => {
      if (eventData.notification) {
        const data = eventData.data;
        const tokenId = data.tokenId;
        const lazyMintListing =
          await this.prisma.lazyMintListing.findUniqueOrThrow({
            where: {
              id: +data.lazyMintListingId,
            },
          });

        const listerData = await this.prisma.user.findFirst({
          where: {
            assets: {
              some: {
                tokenId,
              },
            },
          },
        });

        const transferHistory =
          await this.prisma.erc1155TransferHistory.findFirst({
            where: {
              tokenId,
            },
          });

        const buyerDataWallet = transferHistory.to;
        console.log(lazyMintListing, listerData, buyerDataWallet);

        const notificationData = await this.prisma.notification.create({
          data: {
            notification_type: NotificationType.Sale,
            is_seen: false,
          },
        });

        const total_price_paid =
          +lazyMintListing.buyoutPricePerToken * lazyMintListing.quantity;

        await this.prisma.notificationDetailSale.create({
          data: {
            listingId: +data.lazyMintListingId,
            asset_contract: lazyMintListing.assetContract,
            lister_wallet_address: listerData.wallet_address,
            buyer_wallet_address: buyerDataWallet,
            quantity_bought: lazyMintListing.quantity,
            total_price_paid,
            transaction_hash: transferHistory.transactionHash,
            notification_id: +notificationData.id,
            createdAt_timestamp: transferHistory.createdAt,
          },
        });
      }
    });
  }

  async checkUserDataExist(wallet_address: string) {
    const user = await this.usersService.findWalletOne(wallet_address);

    let data;
    if (user) {
      data = {
        wallet_address: wallet_address,
        username: user.username,
        profile_picture: user.profile_picture,
      };
    } else {
      data = wallet_address;
    }

    return data;
  }

  async getItemName(listingId: number) {
    const item = await this.prisma.item.findFirst({
      where: {
        MarketplaceListing: {
          every: {
            listingId,
          },
        },
      },
    });

    return item.name;
  }
}
