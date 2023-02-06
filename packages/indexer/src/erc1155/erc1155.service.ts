import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ethers } from 'ethers';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  OnSaleParams,
  PaginationParams,
  TokenActivitiesParams,
  CollectionActivitiesParams,
} from './erc1155.dto';

@Injectable()
export class Erc1155Service {
  constructor(private prisma: PrismaService) {}

  async getTokenOwners(tokenId: number) {
    const tokenOwnerships = await this.prisma.tokenOwnerships.findMany({
      where: {
        contractAddress: process.env.CONTRACT_ADDRESS,
        tokenId,
      },
    });

    const ownersValue: Record<string, number> = {};

    for (let x of tokenOwnerships) {
      if (x.quantity == 0) continue;
      ownersValue[x.ownerAddress] = x.quantity;
    }

    return ownersValue;
  }

  async getOwnedByWallet(walletAddress: string) {
    const tokenOwnerships = await this.prisma.tokenOwnerships.findMany({
      where: {
        contractAddress: process.env.CONTRACT_ADDRESS,
        ownerAddress: walletAddress,
      },
    });
    const tokenIdValue: Record<number, number> = {};

    for (let x of tokenOwnerships) {
      if (x.quantity == 0) continue;
      tokenIdValue[x.tokenId] = x.quantity;
    }

    return tokenIdValue;
  }

  async getActivities(params: TokenActivitiesParams) {
    const { tokenId, page, event } = params;
    const limit = 10;
    const offset = limit * (page - 1);

    const query = Prisma.sql`
      SELECT X.* FROM (
          SELECT 
            CASE WHEN "from" = '0x0000000000000000000000000000000000000000'
              THEN 'mint'
              ELSE 'transfer'
            END AS event,
            "createdAt",
            0 AS price,
            "from",
            "to",
            "tokenId"
          FROM
            public."Erc1155TransferHistory"
        UNION
          SELECT
            'listing' AS event,
            "createdAt",
            CASE WHEN "listingType" = 'Direct'
              THEN "buyoutPricePerToken"
              ELSE "reservePricePerToken"
            END AS price,
            "lister" as from,
            '-' as to,
            "tokenId"
          FROM
            public."MarketplaceListing"
        UNION
          SELECT
            'bid' AS event,
            offer."createdAt",
            "totalOfferAmount" as price,
            "offeror" as from,
            "lister" as to,
            listing."tokenId"
          FROM
            public."MarketplaceOffer" offer
            JOIN public."MarketplaceListing" listing
            ON offer."listingId" = listing."listingId"
        UNION
          SELECT
            'sale' AS event,
            sale."createdAt",
            "totalPricePaid" as price,
            "buyer" as from,
            listing."lister" as to,
            listing."tokenId"
          FROM
            public."MarketplaceSale" sale
            JOIN public."MarketplaceListing" listing
            ON sale."listingId" = listing."listingId"
        ) X
      WHERE X."tokenId" = CAST(${tokenId} AS int)
      ${event ? Prisma.sql`AND X."event" = ${event}` : Prisma.empty}
      ORDER BY X."createdAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const countQuery = Prisma.sql`
      SELECT COUNT(X.*) FROM (
        SELECT 
          CASE WHEN "from" = '0x0000000000000000000000000000000000000000'
            THEN 'mint'
            ELSE 'transfer'
          END AS event,
          "createdAt",
          0 AS price,
          "from",
          "to",
          "tokenId"
        FROM
          public."Erc1155TransferHistory"
      UNION
        SELECT
          'listing' AS event,
          "createdAt",
          CASE WHEN "listingType" = 'Direct'
            THEN "buyoutPricePerToken"
            ELSE "reservePricePerToken"
          END AS price,
          "lister" as from,
          '-' as to,
          "tokenId"
        FROM
          public."MarketplaceListing"
      UNION
        SELECT
          'bid' AS event,
          offer."createdAt",
          "totalOfferAmount" as price,
          "offeror" as from,
          "lister" as to,
          listing."tokenId"
        FROM
          public."MarketplaceOffer" offer
          JOIN public."MarketplaceListing" listing
          ON offer."listingId" = listing."listingId"
      UNION
        SELECT
          'sale' AS event,
          sale."createdAt",
          "totalPricePaid" as price,
          "buyer" as from,
          listing."lister" as to,
          listing."tokenId"
        FROM
          public."MarketplaceSale" sale
          JOIN public."MarketplaceListing" listing
          ON sale."listingId" = listing."listingId"
      ) X
    WHERE X."tokenId" = CAST(${tokenId} AS int)
    ${event ? Prisma.sql`AND X."event" = ${event}` : Prisma.empty}
    `;

    const records: any[] = await this.prisma.$queryRaw(query);
    const count: [{ count: BigInt }] = await this.prisma.$queryRaw(countQuery);

    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata: {
        page: Number(page),
        perPage: 10,
        pageCount: records.length,
        totalCount: Number(count[0].count),
      },
      records,
    };
  }

  async getOnSale(params: OnSaleParams) {
    const { owner, page, listingType, hasOffers, priceMin, priceMax } = params;
    const limit = 10;
    const offset = limit * (page - 1);

    let query: Prisma.MarketplaceListingFindManyArgs = {
      select: { tokenId: true, tokenOwner: true },
      distinct: ['tokenId'],
      skip: offset,
      take: limit,
      where: {
        isCancelled: false,
        quantity: {
          gt: 0,
        },
        startTime: {
          lte: Math.floor(Date.now() / 1000),
        },
        endTime: {
          gt: Math.floor(Date.now() / 1000),
        },
      },
    };

    if (owner) {
      query = {
        ...query,
        where: {
          ...query.where,
          tokenOwner: owner,
        },
      };
    }

    if (listingType) {
      query = {
        ...query,
        where: {
          ...query.where,
          listingType,
        },
      };
    }

    if (hasOffers) {
      query = {
        ...query,
        where: {
          ...query.where,
          MarketplaceOffer: {
            some: {
              expirationTimestamp: { gt: Math.floor(Date.now() / 1000) },
            },
          },
        },
      };
    }

    if (priceMin) {
      query = {
        ...query,
        where: {
          ...query.where,
          buyoutPricePerToken: {
            gte: +priceMin,
          },
        },
      };
    }

    if (priceMax) {
      query = {
        ...query,
        where: {
          ...query.where,
          buyoutPricePerToken: {
            lte: +priceMax,
          },
        },
      };
    }

    if (priceMin && priceMax) {
      query = {
        ...query,
        where: {
          ...query.where,
          buyoutPricePerToken: {
            gte: +priceMin,
            lte: +priceMax,
          },
        },
      };
    }

    const tokens = await this.prisma.marketplaceListing.findMany(query);

    const dataCount = await this.prisma.marketplaceListing.aggregate({
      _count: true,
      where: query.where,
    });

    return {
      metadata: {
        page: Number(page),
        perPage: 10,
        pageCount: tokens.length,
        totalCount: Number(dataCount._count),
      },
      records: tokens,
    };
  }

  async getCollectionActivities(params: CollectionActivitiesParams) {
    const { tokenId, page, event } = params;
    const limit = 10;
    const offset = limit * (page - 1);

    const tokenIdsArray = JSON.parse(tokenId);

    const query = Prisma.sql`
      SELECT X.* FROM (
          SELECT 
            CASE WHEN "from" = '0x0000000000000000000000000000000000000000'
              THEN 'mint'
              ELSE 'transfer'
            END AS event,
            "createdAt",
            0 AS price,
            "from",
            "to",
            "tokenId"
          FROM
            public."Erc1155TransferHistory"
        UNION
          SELECT
            'listing' AS event,
            "createdAt",
            CASE WHEN "listingType" = 'Direct'
              THEN "buyoutPricePerToken"
              ELSE "reservePricePerToken"
            END AS price,
            "lister" as from,
            '-' as to,
            "tokenId"
          FROM
            public."MarketplaceListing"
        UNION
          SELECT
            'bid' AS event,
            offer."createdAt",
            "totalOfferAmount" as price,
            "offeror" as from,
            "lister" as to,
            listing."tokenId"
          FROM
            public."MarketplaceOffer" offer
            JOIN public."MarketplaceListing" listing
            ON offer."listingId" = listing."listingId"
        UNION
          SELECT
            'sale' AS event,
            sale."createdAt",
            "totalPricePaid" as price,
            "buyer" as from,
            listing."lister" as to,
            listing."tokenId"
          FROM
            public."MarketplaceSale" sale
            JOIN public."MarketplaceListing" listing
            ON sale."listingId" = listing."listingId"
        ) X
        WHERE X."tokenId" IN (${Prisma.join(tokenIdsArray)})
        ${event ? Prisma.sql`AND X."event" = ${event}` : Prisma.empty}
      ORDER BY X."createdAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const countQuery = Prisma.sql`
      SELECT COUNT(X.*) FROM (
        SELECT 
          CASE WHEN "from" = '0x0000000000000000000000000000000000000000'
            THEN 'mint'
            ELSE 'transfer'
          END AS event,
          "createdAt",
          0 AS price,
          "from",
          "to",
          "tokenId"
        FROM
          public."Erc1155TransferHistory"
      UNION
        SELECT
          'listing' AS event,
          "createdAt",
          CASE WHEN "listingType" = 'Direct'
            THEN "buyoutPricePerToken"
            ELSE "reservePricePerToken"
          END AS price,
          "lister" as from,
          '-' as to,
          "tokenId"
        FROM
          public."MarketplaceListing"
      UNION
        SELECT
          'bid' AS event,
          offer."createdAt",
          "totalOfferAmount" as price,
          "offeror" as from,
          "lister" as to,
          listing."tokenId"
        FROM
          public."MarketplaceOffer" offer
          JOIN public."MarketplaceListing" listing
          ON offer."listingId" = listing."listingId"
      UNION
        SELECT
          'sale' AS event,
          sale."createdAt",
          "totalPricePaid" as price,
          "buyer" as from,
          listing."lister" as to,
          listing."tokenId"
        FROM
          public."MarketplaceSale" sale
          JOIN public."MarketplaceListing" listing
          ON sale."listingId" = listing."listingId"
      ) X
    WHERE X."tokenId" IN (${Prisma.join(tokenIdsArray)})
    ${event ? Prisma.sql`AND X."event" = ${event}` : Prisma.empty}
    `;

    const records: any[] = await this.prisma.$queryRaw(query);
    const count: [{ count: BigInt }] = await this.prisma.$queryRaw(countQuery);

    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata: {
        page: Number(page),
        perPage: 10,
        pageCount: records.length,
        totalCount: Number(count[0].count),
      },
      records,
    };
  }
}
