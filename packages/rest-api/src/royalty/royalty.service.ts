import { Injectable } from '@nestjs/common';
import { Prisma } from '@nusa-nft/database';
import { formatDistance } from 'date-fns';
import { ethers } from 'ethers';
import { IndexerService } from '../indexer/indexer.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoyaltyReceivedHistoryParams } from './royalty.dto';

interface RoyaltyHistory {
  recipient: string;
  bps: string;
  amount: string;
  tokenId: number;
  createdAt: number;
  listing: {
    lister: string;
    MarketplaceSale: {
      buyer: string;
    };
  };
}

@Injectable()
export class RoyaltyService {
  constructor(
    private readonly indexerService: IndexerService,
    private readonly prisma: PrismaService,
  ) {}

  async getRoyaltyReceivedHistory(params: RoyaltyReceivedHistoryParams) {
    const { collectionId, page } = params;
    const collection = await this.prisma.collection.findFirstOrThrow({
      where: { id: +collectionId },
      include: { items: true },
    });

    const tokenIds = collection.items.map((it) => it.tokenId);

    // const royaltyHistory: { records: RoyaltyHistory[] } =
    //   await this.indexerService.getRoyaltyReceivedHistory(tokenIds, page);
    const where: Prisma.RoyaltyPaidWhereInput = {
      OR: [
        { offer: { tokenId: { in: tokenIds } } },
        { listing: { tokenId: { in: tokenIds } } }
      ]
    }

    const royaltyPaids = await this.prisma.royaltyPaid.findMany({
      where,
      include: {
        offer: { include: { acceptedOffer: true } },
        listing: true
      },
    });

    const countQuery = await this.prisma.royaltyPaid.aggregate({
      _count: true,
      where,
    })

    const records = [];
    for (const r of royaltyPaids) {
      const tokenId = r.offer ? r.offer.tokenId : r.listing.tokenId;
      const item = await this.prisma.item.findFirst({
        where: { tokenId },
        include: {
          Collection: true,
        },
      });

      let sellerAddress: string;
      let buyerAddress: string;

      if (r.offer) {
        sellerAddress = r.offer.acceptedOffer.seller;
        buyerAddress = r.payer;
      }

      if (r.listing) {
        sellerAddress = r.listing.lister;
        buyerAddress = r.payer;
      }

      const seller = await this.prisma.user.findFirst({
        where: {
          wallet_address: {
            contains: sellerAddress,
            mode: 'insensitive',
          },
        },
      });

      const buyer = await this.prisma.user.findFirst({
        where: {
          wallet_address: {
            contains: buyerAddress,
            mode: 'insensitive',
          },
        },
      });

      const date = formatDistance(new Date(r.createdAt * 1000), new Date(), {
        addSuffix: true,
      });

      const rec = {
        amount: ethers.utils.formatEther(r.amount.toString()),
        collection: item?.Collection.name,
        itemName: item?.name,
        seller: seller ? seller : { wallet_address: sellerAddress },
        buyer: buyer ? buyer : { wallet_address: buyerAddress },
        date,
      };
      records.push(rec);
    }

    return {
      status: 200,
      message: "success",
      metadata: {
        page: page,
        perPage: 10,
        pageCount: Math.ceil(countQuery._count / 10),
        totalCount: countQuery._count,
      },
      records,
    };
  }
}
