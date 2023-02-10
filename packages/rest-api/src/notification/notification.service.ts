import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { formatDistance } from 'date-fns';
import { NotificationQueryParam, Take } from './dto/notification.dto';
import { events } from 'src/lib/newEventEmitter';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    this.handleLazyMintedSale();
  }

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
            lister: true,
            offeror: true,
          },
        },
        notification_detail_sale: {
          include: {
            lister: true,
            buyer: true,
          },
        },
      },
      where: {
        user: {
          id: userId,
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

        const itemName = await this.getItemName(offerData.listingId);
        Object.assign(data.notification_detail_offer, {
          itemName,
          createdAt_description,
        });
      }

      if (data.notification_detail_sale) {
        const saleData = data.notification_detail_sale;
        const createdAt_description = `${formatDistance(
          Date.now(),
          saleData.createdAt_timestamp * 1000,
        )} ago`;
        const itemName = await this.getItemName(saleData.listingId);
        Object.assign(data.notification_detail_sale, {
          itemName,
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

        const notificationDataLister = await this.prisma.notification.create({
          data: {
            notification_type: NotificationType.Sale,
            is_seen: false,
            user: {
              connect: {
                wallet_address: listerData.wallet_address,
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
                wallet_address: buyerDataWallet,
              },
            },
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
            Notification: {
              connect: [
                { id: notificationDataBuyer.id },
                { id: notificationDataLister.id },
              ],
            },
            createdAt_timestamp: transferHistory.createdAt,
          },
        });
      }
    });
  }

  async getItemName(listingId: number) {
    const item = await this.prisma.item.findFirst({
      where: {
        OR: [
          {
            MarketplaceListing: {
              some: {
                listingId,
              },
            },
          },
          {
            LazyMintListing: {
              some: {
                id: listingId,
              },
            },
          },
        ],
      },
    });

    return item.name;
  }
}
