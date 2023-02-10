import { Injectable } from '@nestjs/common';
import { events } from 'src/lib/newEventEmitter';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  NotificationType,
  MarketplaceListing,
  MarketplaceOffer,
  MarketplaceSale,
} from '@prisma/client';

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

      const listingData = await this.prisma.marketplaceListing.findFirst({
        where: {
          listingId: +data.listingId,
        },
      });

      console.log('listing', listingData);

      if (eventData.notification == 'offer') {
        const offerData = await this.prisma.marketplaceOffer.findFirst({
          where: {
            listingId: +listingData.listingId,
            createdAt: +data.createdAt,
          },
        });

        this.newOfferNotification(listingData, offerData);
      }

      if (eventData.notification == 'sale') {
        const saleData = await this.prisma.marketplaceSale.findFirst({
          where: {
            listingId: +listingData.listingId,
          },
        });

        this.newSaleNotification(saleData);
      }
    });
  }

  async newOfferNotification(
    listingData: MarketplaceListing,
    eventData: MarketplaceOffer,
  ) {
    const {
      listingId,
      offeror,
      listingType,
      quantityWanted,
      totalOfferAmount,
      transactionHash,
      currency,
      createdAt,
      expirationTimestamp,
    } = eventData;
    const notificationDataLister = await this.prisma.notification.create({
      data: {
        notification_type: NotificationType.Offer,
        is_seen: false,
        user: {
          connect: {
            wallet_address: listingData.lister,
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

    const offerNotification = await this.prisma.notificationDetailOffer.create({
      data: {
        listingId: listingId,
        lister_wallet_address: listingData.lister,
        offeror_wallet_address: offeror,
        listing_type: listingType,
        quantity_wanted: quantityWanted,
        total_offer_ammount: totalOfferAmount,
        currency,
        expiration_timestamp: expirationTimestamp,
        transaction_hash: transactionHash,
        Notification: {
          connect: [
            { id: notificationDataOfferor.id },
            { id: notificationDataLister.id },
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
        notification_type: NotificationType.Offer,
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
        notification_type: NotificationType.Offer,
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
