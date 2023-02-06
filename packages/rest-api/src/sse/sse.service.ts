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
import { formatDistance } from 'date-fns';

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
        RPC_URL: this.configService.get<string>('RPC_URL_WSS'),
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

        const lister = await this.checkUserDataExist(listerAddress);
        const buyer = await this.checkUserDataExist(buyerAddress);

        const itemName = await this.getItemName(parseInt(_listingId._hex));

        const notificationData = await this.prisma.notification.create({
          data: {
            notification_type: NotificationType.Sale,
            is_seen: false,
          },
        });

        await this.prisma.notificationDetailSale.create({
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

        const createdAt = `${formatDistance(Date.now(), timestamp * 1000)} ago`;

        const saleData = {
          listingId: parseInt(_listingId._hex),
          assetContract: _assetContract,
          lister,
          buyer,
          quantityBought: parseInt(quantityBought._hex),
          totalPricePaid: parseInt(totalPricePaid._hex),
          createdAt,
          transactionHash,
        };

        Object.assign(notificationData, { saleData, itemName });

        if (saleData) {
          this.eventEmitter.emit('marketplaceSale', { notificationData });
        }
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
        const lister = await this.checkUserDataExist(listerAddress);
        const offeror = await this.checkUserDataExist(offerorAddress);

        const itemName = await this.getItemName(listingIdData);

        const notificationData = await this.prisma.notification.create({
          data: {
            notification_type: NotificationType.Offer,
            is_seen: false,
          },
        });

        await this.prisma.notificationDetailOffer.create({
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

        const createdAt = `${formatDistance(Date.now(), timestamp * 1000)} ago`;
        const expirationTimestamp =
          parseInt(offer.expirationTimestamp._hex) * 1000;

        const offerData = {
          listingId: listingIdData,
          lister,
          offeror,
          listingType: parseListingType(listingType),
          quantityWanted: parseInt(quantityWanted._hex),
          totalOfferAmount: parseInt(totalOfferAmount._hex),
          currency,
          createdAt,
          expirationTimestamp,
          transactionHash,
        };
        Object.assign(notificationData, { offerData, itemName });
        if (notificationData) {
          this.eventEmitter.emit('marketplaceOffer', {
            notificationData,
          });
        }
      },
    );
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
