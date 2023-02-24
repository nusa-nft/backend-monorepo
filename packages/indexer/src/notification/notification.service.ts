import { Injectable } from '@nestjs/common';
import { events } from 'src/lib/newEventEmitter';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  NotificationType,
  MarketplaceListing,
  MarketplaceOffer,
  MarketplaceSale,
  OfferStatus,
  Prisma,
  ListingType,
} from '@prisma/client';
import retry from 'async-retry';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    this.handleMarketplaceNotification();
  }

  async handleMarketplaceNotification() {
    events.on('notification', async (eventData) => {
      const data = eventData.data;
      console.log('event masuk', data);

      // const dataOfListing = listingData;
      if (eventData.notification == 'offer') {
        // FIXME:
        // let marketplaceOffer;
        let marketplaceOffer = {
          id: 0,
          offeror: 'TODO',
          assetContract: 'TODO',
          tokenId: new Prisma.Decimal(0),             
          quantity: new Prisma.Decimal(0),            
          currency: 'TODO',
          totalPrice: new Prisma.Decimal(0),          
          expirationTimestamp: new Prisma.Decimal(0), 
          transactionHash: '',
          status: OfferStatus.COMPLETED,
          royaltyInfoId: 0,
          createdAt: 0
        }
        // await retry(
        //   async () => {
        //     marketplaceOffer =
        //       await this.prisma.marketplaceOffer.findFirstOrThrow({
        //         where: {
        //           id: +data.offerId,
        //           createdAt: +data.createdAt,
        //         },
        //       });
        //     return marketplaceOffer;
        //   },
        //   {
        //     forever: true,
        //   },
        // );

        this.newOfferNotification(marketplaceOffer);
      }

      if (eventData.notification == 'sale') {
        const listingData = await this.prisma.marketplaceListing.findFirst({
          where: {
            listingId: +data.listingId,
          },
        });

        let marketplaceSale;
        await retry(
          async () => {
            marketplaceSale =
              await this.prisma.marketplaceSale.findFirstOrThrow({
                where: {
                  listingId: +listingData.listingId,
                },
              });
            return marketplaceSale;
          },
          {
            forever: true,
          },
        );

        this.newSaleNotification(marketplaceSale);
      }
    });
  }

  // FIXME:
  async newOfferNotification(
    // listingData: MarketplaceListing,
    eventData: MarketplaceOffer,
  ) {
    const {
      id,
      offeror,
      quantity,
      totalPrice,
      transactionHash,
      currency,
      createdAt,
      expirationTimestamp,
      assetContract,
      tokenId
    } = eventData;
    const tokenOwner = await this.prisma.tokenOwnerships.findFirst({
      where: {
        tokenId,
        contractAddress: assetContract
      }
    })
    if (!tokenOwner) return 
    const notificationDataOwner = await this.prisma.notification.create({
      data: {
        notification_type: NotificationType.Offer,
        is_seen: false,
        user: {
          connect: {
            wallet_address: tokenOwner.ownerAddress,
          },
        },
      },
    });

    const notificationDataOfferor = await this.prisma.notification.create({
      data: {
        notification_type: NotificationType.Offer,
        is_seen: false,
        user: {
          connect: {
            wallet_address: offeror,
          },
        },
      },
    });

    // FIXME:
    const offerNotification = await this.prisma.notificationDetailOffer.create({
      data: {
        id: id,
        lister_wallet_address: tokenOwner.ownerAddress, // TODO: fix. should be tokenOwnerAddress 
        offeror_wallet_address: offeror,
        listing_type: ListingType.Direct,
        quantity_wanted: quantity.toNumber(),
        total_offer_ammount: totalPrice,
        currency,
        expiration_timestamp: expirationTimestamp,
        transaction_hash: transactionHash,
        Notification: {
          connect: [
            { id: notificationDataOfferor.id },
            { id: notificationDataOwner.id },
          ],
        },
        createdAt_timestamp: createdAt,
      },
    });

    console.log('offer notif data', offerNotification);
    return offerNotification;
  }

  async newSaleNotification(eventData: MarketplaceSale) {
    const {
      listingId,
      assetContract,
      lister,
      buyer,
      quantityBought,
      totalPricePaid,
      transactionHash,
      createdAt,
    } = eventData;
    const notificationDataLister = await this.prisma.notification.create({
      data: {
        notification_type: NotificationType.Sale,
        is_seen: false,
        user: {
          connect: {
            wallet_address: lister,
          },
        },
      },
    });

    const notificationDataBuyer = await this.prisma.notification.create({
      data: {
        notification_type: NotificationType.Sale,
        is_seen: false,
        user: {
          connect: {
            wallet_address: buyer,
          },
        },
      },
    });

    const saleNotification = await this.prisma.notificationDetailSale.create({
      data: {
        listingId,
        asset_contract: assetContract,
        lister_wallet_address: lister,
        buyer_wallet_address: buyer,
        quantity_bought: quantityBought,
        total_price_paid: totalPricePaid,
        transaction_hash: transactionHash,
        Notification: {
          connect: [
            { id: notificationDataBuyer.id },
            { id: notificationDataLister.id },
          ],
        },
        createdAt_timestamp: createdAt,
      },
    });

    console.log('sale notif data', saleNotification);

    return saleNotification;
  }
}
