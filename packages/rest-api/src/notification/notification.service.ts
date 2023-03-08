import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { formatDistance } from 'date-fns';
import { NotificationQueryParam, Take } from './dto/notification.dto';
import { events } from '../lib/newEventEmitter';
import {
  LazyMintListing,
  LazyMintSale,
  NotificationType,
  TokenTransferHistory,
} from '@prisma/client';
import retry from 'async-retry';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  // async onModuleInit() {
  //   this.handleLazyMintedSale();
  // }

  async getNotificationData(
    userId: number,
    queryParam: NotificationQueryParam,
  ) {
    if (!userId) return;

    const { page, take } = queryParam;

    let takeValue;
    if (take.toString() == Take.Take_3) {
      takeValue = 3;
    }
    if (take.toString() == Take.Take_10) {
      takeValue = 10;
    }

    const notificationData = await this.prisma.notification.findMany({
      skip: +takeValue * (+page - 1),
      take: takeValue,
      orderBy: {
        id: 'desc',
      },
      include: {
        notification_detail_offer: {
          include: {
            offeror: true,
            token_owner: true,
          },
        },
        notification_detail_sale: {
          include: {
            lister: true,
            buyer: true,
          },
        },
        notification_detail_bid: {
          include: {
            lister: true,
            bidder: true,
          },
        },
      },
      where: {
        user: {
          id: +userId,
        },
      },
    });

    for (const data of notificationData) {
      if (data.notification_detail_offer) {
        const offerData = data.notification_detail_offer;
        const createdAt_description = `${formatDistance(
          Date.now(),
          offerData.createdAt_timestamp * 1000,
        )} ago`;

        const item = await this.getItemData(
          NotificationType.Offer,
          offerData.tokenId,
        );
        Object.assign(data.notification_detail_offer, {
          item,
          createdAt_description,
        });
      }

      if (data.notification_detail_sale) {
        const saleData = data.notification_detail_sale;
        const createdAt_description = `${formatDistance(
          Date.now(),
          saleData.createdAt_timestamp * 1000,
        )} ago`;
        const item = await this.getItemData(
          NotificationType.Sale,
          saleData.listingId,
        );
        Object.assign(data.notification_detail_sale, {
          item,
          createdAt_description,
        });
      }

      if (data.notification_detail_bid) {
        const bidData = data.notification_detail_bid;
        console.log(bidData);
        const createdAt_description = `${formatDistance(
          Date.now(),
          bidData.createdAt_timestamp * 1000,
        )} ago`;
        const item = await this.getItemData(
          NotificationType.Bid,
          bidData.listingId,
        );
        Object.assign(data.notification_detail_bid, {
          item,
          createdAt_description,
        });
      }
    }

    for (const notification of notificationData) {
      await this.setIsSeen(notification.id);
    }

    if (take.toString() == Take.Take_10) {
      return {
        status: HttpStatus.OK,
        message: 'success',
        metadata: {
          page: +page,
          perPage: 10,
          pageCount: Math.ceil(notificationData.length / 10),
          totalCount: notificationData.length,
        },
        records: notificationData,
      };
    }

    if (take.toString() == Take.Take_3) {
      return notificationData;
    }
  }

  async setIsSeen(notificationDataId: number) {
    await this.prisma.notification.update({
      where: {
        id: notificationDataId,
      },
      data: {
        is_seen: true,
      },
    });
  }

  async checkNewNotification(userId: number) {
    if (!userId) {
      return {
        newNotification: false,
      };
    }
    const newNotification = await this.prisma.notification.findMany({
      where: {
        is_seen: false,
        user: {
          id: userId,
        },
      },
    });

    if (!newNotification.length) {
      return {
        newNotification: false,
      };
    }

    return {
      newNotification: true,
    };
  }

  async getItemData(notificationType: NotificationType, foreignKey: any) {
    let item;

    if (
      notificationType == NotificationType.Sale ||
      notificationType == NotificationType.Bid
    ) {
      item = await this.prisma.item.findFirst({
        where: {
          OR: [
            {
              MarketplaceListing: {
                some: { id: +foreignKey },
              },
            },
            {
              LazyMintListing: {
                some: { id: +foreignKey },
              },
            },
          ],
        },
      });
    } else {
      item = await this.prisma.item.findFirst({
        where: { tokenId: +foreignKey },
      });
    }
    console.log(item);
    return { id: item.id, name: item.name };
  }

  async lazyMintNotification(data: LazyMintSale, listingData: LazyMintListing) {
    let transferHistory: TokenTransferHistory;
    await retry(
      async () => {
        transferHistory =
          await this.prisma.tokenTransferHistory.findFirstOrThrow({
            where: {
              tokenId: data.tokenId,
              contractAddress: listingData.assetContract,
            },
          });
        return transferHistory;
      },
      {
        forever: true,
      },
    );

    const listerData = await this.prisma.user.findFirst({
      where: {
        assets: {
          some: {
            id: data.itemId,
          },
        },
      },
    });
    console.log('lister data', listerData);

    const notificationDataLister = await this.prisma.notification.create({
      data: {
        notification_type: NotificationType.Sale,
        is_seen: false,
        user: {
          connectOrCreate: {
            create: {
              wallet_address: listerData.wallet_address,
            },
            where: {
              wallet_address: listerData.wallet_address,
            },
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
            create: {
              wallet_address: transferHistory.to,
            },
            where: {
              wallet_address: transferHistory.to,
            },
          },
        },
      },
    });

    const saleNotification = await this.prisma.notificationDetailSale.create({
      data: {
        listingId: +data.lazyMintListingId,
        asset_contract: listingData.assetContract,
        lister_wallet_address: listerData.wallet_address,
        buyer_wallet_address: transferHistory.to,
        quantity_bought: data.quantityBought,
        total_price_paid: data.totalPricePaid,
        transaction_hash: transferHistory.transactionHash,
        Notification: {
          connect: [
            { id: notificationDataBuyer.id },
            { id: notificationDataLister.id },
          ],
        },
        createdAt_timestamp: transferHistory.createdAt,
      },
    });

    if (saleNotification) {
      Logger.log('notification sale data created');
    }
  }
}
