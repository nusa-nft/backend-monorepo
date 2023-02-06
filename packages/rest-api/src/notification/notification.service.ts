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
    if (take.toString() == Take[0]) {
      takeValue = 3;
    }
    if (take.toString() == Take[1]) {
      takeValue = 10;
    }

    const notificationData = await this.prisma.notification.findMany({
      skip: takeValue * (page ? page - 1 : take - 1),
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
        OR: [
          {
            notification_detail_sale: {
              OR: [
                {
                  lister: {
                    id: userId,
                  },
                },
                {
                  buyer: {
                    id: userId,
                  },
                },
              ],
            },
          },
          {
            notification_detail_offer: {
              OR: [
                {
                  lister: {
                    id: userId,
                  },
                },
                {
                  offeror: {
                    id: userId,
                  },
                },
              ],
            },
          },
        ],
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

    if (take.toString() == Take[1]) {
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
    return notificationData;
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

  async getItemName(listingId: number) {
    const item = await this.prisma.item.findFirst({
      where: {
        MarketplaceListing: {
          some: {
            listingId,
          },
        },
      },
    });

    return item.name;
  }
}
