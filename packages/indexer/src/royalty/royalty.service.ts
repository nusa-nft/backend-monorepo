import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoyaltyReceivedHistoryParams } from './royalty.dto';

@Injectable()
export class RoyaltyService {
  constructor(
    private readonly prisma: PrismaService
  ) {}

  async getRoyaltyReceivedHistory(params: RoyaltyReceivedHistoryParams) {
    let { tokenIds, page } = params;

    if (!tokenIds || tokenIds.length == 0) {
      return {
        status: HttpStatus.OK,
        message: 'success',
        metadata: {
          page,
          perPage: 10,
          pageCount: 0,
          totalCount: 0,
        },
        records: [],
      };
    }

    if (!page) {
      page = 1;
    }

    const records = await this.prisma.royaltyPaid.findMany({
      where: {
        listing: {
          tokenId: { in: tokenIds.map(x => Number(x)) }
        }
      },
      include: {
        listing: {
          include: {
            MarketplaceSale: true,
          }
        }
      },
      orderBy: { id: 'desc' },
      take: 10,
      skip: 10 * (page - 1),
    });

    const count = await this.prisma.royaltyPaid.aggregate({
      _count: true,
      where: {
        listing: {
          tokenId: { in: tokenIds.map(x => Number(x)) }
        }
      },
      orderBy: { id: 'desc' }
    })

    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata: {
        page,
        perPage: 10,
        pageCount: Math.ceil(count._count / 10),
        totalCount: count._count,
      },
      records,
    };
  }
}
