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
  Notification,
  NotificationDetailOffer,
  AcceptedOffer,
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

      if (eventData.notification == 'acceptOffer') {
        this.newAcceptOfferNotification(data);
      }
    });
  }

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
      tokenId,
    } = eventData;
    const tokenOwner = await this.prisma.tokenOwnerships.findMany({
      where: {
        tokenId,
        contractAddress: assetContract,
      },
    });

    if (tokenOwner.length == 0) return;

    const notificationDataOwner: Notification[] = [];
    for (const owner of tokenOwner) {
      const wallet_address = owner.ownerAddress;
      const notificationData = await this.prisma.notification.create({
        data: {
          wallet_address,
          notification_type: NotificationType.Offer,
          is_seen: false,
        },
      });

      notificationDataOwner.push(notificationData);
    }

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

    const notificationOfferDatas = [];
    for (const notification of notificationDataOwner) {
      const notificationOffers =
        await this.prisma.notificationDetailOffer.create({
          data: {
            tokenId: +tokenId,
            token_owner: {
              connect: {
                wallet_address: notification.wallet_address,
              },
            },
            offeror: {
              connect: {
                wallet_address: offeror,
              },
            },
            listing_type: ListingType.Direct,
            quantity_wanted: quantity,
            total_offer_ammount: totalPrice,
            currency,
            expiration_timestamp: expirationTimestamp,
            transaction_hash: transactionHash,
            Notification: {
              connect: [
                { id: notificationDataOfferor.id },
                { id: notification.id },
              ],
            },
            createdAt_timestamp: createdAt,
          },
        });
      notificationOfferDatas.push(notificationOffers);
    }

    if (notificationOfferDatas) {
      Logger.log('notification offer data created');
    }

    return notificationOfferDatas;
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
      listing,
      Bidder,
      quantityWanted,
      currency,
      totalPrice,
      transactionHash,
    } = eventData;
    const bidder = Bidder.connectOrCreate.create.wallet_address;
    const listingId = listing.connect.id;
    const listingData: MarketplaceListing =
      await this.prisma.marketplaceListing.findUniqueOrThrow({
        where: {
          id: +listingId,
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
              wallet_address: tokenOwner.ownerAddress,
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

  async newAcceptOfferNotification(eventData: AcceptedOffer) {
    const {
      assetContract,
      offeror,
      seller,
      quantityBought,
      totalPricePaid,
      createdAt,
      tokenId,
    } = eventData;

    const notificationDataLister = await this.prisma.notification.create({
      data: {
        notification_type: NotificationType.Sale,
        is_seen: false,
        user: {
          connectOrCreate: {
            where: { wallet_address: seller },
            create: { wallet_address: seller },
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
            where: { wallet_address: offeror },
            create: { wallet_address: offeror },
          },
        },
      },
    });

    const saleNotification = await this.prisma.notificationDetailSale.create({
      data: {
        tokenId: +tokenId,
        asset_contract: assetContract,
        lister_wallet_address: seller,
        buyer_wallet_address: offeror,
        quantity_bought: quantityBought,
        total_price_paid: totalPricePaid,
        transaction_hash: '-',
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
}
