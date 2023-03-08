import { Injectable, Logger } from '@nestjs/common';
import { events } from '../lib/newEventEmitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationType,
  MarketplaceListing,
  MarketplaceOffer,
  MarketplaceSale,
  OfferStatus,
  Prisma,
  ListingType,
  Bid,
  NotificationDetailBid,
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
      Logger.log('notification event received');
      const data = eventData.data;

      let marketplaceOffer;
      // const dataOfListing = listingData;
      if (eventData.notification == 'offer') {
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
          royaltyInfoId,
          tokenId,
          status,
        } = data;
        // FIXME:
        // let marketplaceOffer;
        marketplaceOffer = {
          id,
          offeror,
          assetContract,
          tokenId,
          quantity,
          currency,
          totalPrice,
          expirationTimestamp,
          transactionHash,
          status,
          royaltyInfoId,
          createdAt,
        };

        this.newOfferNotification(marketplaceOffer);
      }

      if (eventData.notification == 'sale') {
        const listingData = await this.prisma.marketplaceListing.findFirst({
          where: {
            id: +data.listingId,
          },
        });

        let marketplaceSale;
        await retry(
          async () => {
            marketplaceSale =
              await this.prisma.marketplaceSale.findFirstOrThrow({
                where: {
                  listingId: +listingData.id,
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

      if (eventData.notification == 'bid') {
        this.newBidNotification(data);
      }
    });
  }

  // FIXME:
  async newOfferNotification(
    // listingData: MarketplaceListing,
    eventData: MarketplaceOffer,
  ) {
    console.log('event data', eventData);
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
      tokenId,
    } = eventData;
    // console.log({ eventData });
    const tokenOwner = await this.prisma.tokenOwnerships.findMany({
      where: {
        tokenId,
        contractAddress: assetContract,
      },
    });

    if (tokenOwner.length == 0) return;

    const createManyOwnerData = [];

    for (const owner of tokenOwner) {
      const wallet_address = owner.ownerAddress;
      createManyOwnerData.push({
        wallet_address,
        notification_type: NotificationType.Offer,
        is_seen: false,
      });
    }

    const notificationDataOwner = await this.prisma.notification.createMany({
      data: createManyOwnerData,
    });

    const notificationDataOfferor = await this.prisma.notification.create({
      data: {
        notification_type: NotificationType.Offer,
        is_seen: false,
        user: {
          connectOrCreate: {
            create: {
              wallet_address: offeror,
            },
            where: {
              wallet_address: offeror,
            },
          },
        },
      },
    });

    console.log(notificationDataOwner);
    // const createManyOfferNotificationData = [];
    // for (const owner of tokenOwner) {
    //   createManyOfferNotificationData.push({

    //   })
    // }
    // FIXME:
    // const offerNotification = await this.prisma.notificationDetailOffer.create({
    //   data: {
    //     id: id,
    //     token_owner: {
    //       connect: {
    //         wallet_address: {'token owner wallet address'}
    //       }
    //     },
    //     listing_type: ListingType.Direct,
    //     quantity_wanted: Number(quantity),
    //     total_offer_ammount: totalPrice,
    //     currency,
    //     expiration_timestamp: expirationTimestamp,
    //     transaction_hash: transactionHash,
    //     Notification: {
    //       connect: [
    //         { id: notificationDataOfferor.id },
    //         { id: {'notification data owner here'} },
    //       ],
    //     },
    //     createdAt_timestamp: createdAt,
    //   },
    // });

    // if (offerNotification) {
    //   Logger.log('notification offer data created');
    // }

    // return offerNotification;
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
          connectOrCreate: {
            where: { wallet_address: lister },
            create: { wallet_address: lister },
          },
        },
      },
    });

    const notificationDataBuyer = await this.prisma.notification.create({
      data: {
        notification_type: NotificationType.Sale,
        is_seen: false,
        user: {
          connectOrCreate: {
            where: { wallet_address: buyer },
            create: { wallet_address: buyer },
          },
        },
      },
    });

    const saleNotification = await this.prisma.notificationDetailSale.create({
      data: {
        listingId: listingId.toNumber(),
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

    if (saleNotification) {
      Logger.log('notification sale data created');
    }

    return saleNotification;
  }

  async newBidNotification(eventData) {
    const {
      listingId,
      bidder,
      quantityWanted,
      currency,
      totalPrice,
      transactionHash,
    } = eventData;

    const listingData: MarketplaceListing =
      await this.prisma.marketplaceListing.findUniqueOrThrow({
        where: {
          id: Number(listingId),
        },
      });

    const tokenOwner = await this.prisma.tokenOwnerships.findFirst({
      where: {
        tokenId: +listingData.tokenId,
        contractAddress: listingData.assetContract,
      },
    });

    if (!tokenOwner) return;

    const notificationDataOwner = await this.prisma.notification.create({
      data: {
        notification_type: NotificationType.Bid,
        is_seen: false,
        user: {
          connectOrCreate: {
            create: {
              wallet_address: tokenOwner.ownerAddress,
            },
            where: {
              wallet_address: tokenOwner.ownerAddress,
            },
          },
        },
      },
    });

    const notificationDataOfferor = await this.prisma.notification.create({
      data: {
        notification_type: NotificationType.Bid,
        is_seen: false,
        user: {
          connectOrCreate: {
            create: {
              wallet_address: bidder,
            },
            where: {
              wallet_address: bidder,
            },
          },
        },
      },
    });

    // FIXME:
    const bidNotification: NotificationDetailBid =
      await this.prisma.notificationDetailBid.create({
        data: {
          lister: {
            connect: {
              wallet_address: notificationDataOfferor.wallet_address,
            },
          },
          bidder: {
            connect: {
              wallet_address: bidder,
            },
          },
          listingId: +listingId,
          listing_type: ListingType.Auction,
          quantity_wanted: quantityWanted,
          total_offer_ammount: totalPrice,
          currency,
          transaction_hash: transactionHash,
          Notification: {
            connect: [
              { id: notificationDataOfferor.id },
              { id: notificationDataOwner.id },
            ],
          },
          createdAt_timestamp: Math.ceil(new Date().getTime() / 1000),
        },
      });

    if (bidNotification) {
      Logger.log('notification bid data created');
    }

    return bidNotification;
  }
}
