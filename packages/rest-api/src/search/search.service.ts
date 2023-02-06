import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async getSuggestion(name: string) {
    const query: Record<string, any> = {
      take: 3,
      orderBy: {
        id: 'desc',
      },
    };

    const accounts = await this.prisma.user.findMany({
      ...query,
      where: {
        deleted: false,
        username: {
          contains: name,
          mode: 'insensitive',
        },
      },
    });

    const collections = await this.prisma.collection.findMany({
      ...query,
      where: {
        deleted: false,
        name: {
          contains: name,
          mode: 'insensitive',
        },
      },
      include: {
        Creator: true,
      },
    });

    const items = await this.prisma.item.findMany({
      ...query,
      where: {
        deleted: false,
        name: {
          contains: name,
          mode: 'insensitive',
        },
      },
      include: {
        Creator: true,
      },
    });

    return {
      accounts,
      collections,
      items,
    };
  }

  async getAccountResult(name: string, page: number) {
    const accounts = await this.prisma.user.findMany({
      skip: 10 * (+page - 1),
      take: 10,
      orderBy: {
        id: 'desc',
      },
      where: {
        deleted: false,
        username: {
          contains: name,
          mode: 'insensitive',
        },
      },
      include: {
        collections: true,
      },
    });

    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata: {
        page: +page,
        perPage: 10,
        pageCount: Math.ceil(accounts.length / 10),
        totalCount: accounts.length,
      },
      records: accounts,
    };
  }

  async getCollectionResult(name: string, page: number) {
    const collections = await this.prisma.collection.findMany({
      skip: 10 * (+page - 1),
      take: 10,
      orderBy: {
        id: 'desc',
      },
      where: {
        deleted: false,
        name: {
          contains: name,
          mode: 'insensitive',
        },
      },
      include: {
        Creator: true,
        _count: true,
      },
    });

    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata: {
        page: +page,
        perPage: 10,
        pageCount: Math.ceil(collections.length / 10),
        totalCount: collections.length,
      },
      records: collections,
    };
  }
}
