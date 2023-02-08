import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { formatDistance } from 'date-fns';
import { NotificationQueryParam, Take } from './dto/notification.dto';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  async getNotificationData(
    userId: number,
    queryParam: NotificationQueryParam,
  ) {
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
