import { Injectable } from '@nestjs/common';
import { formatDistance } from 'date-fns';
import { ethers } from 'ethers';
import { IndexerService } from 'src/indexer/indexer.service';
import { PrismaService } from 'src/prisma/prisma.service';
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

    const royaltyHistory: { records: RoyaltyHistory[] } =
      await this.indexerService.getRoyaltyReceivedHistory(tokenIds, page);

    const records = [];
    for (const r of royaltyHistory.records as RoyaltyHistory[]) {
      const item = await this.prisma.item.findFirst({
        where: { tokenId: r.tokenId },
        include: {
          Collection: true,
        },
      });

      const seller = await this.prisma.user.findFirst({
        where: {
          wallet_address: {
            contains: r.listing.lister,
            mode: 'insensitive',
          },
        },
      });

      const buyer = await this.prisma.user.findFirst({
        where: {
          wallet_address: {
            contains: r.listing.MarketplaceSale.buyer,
            mode: 'insensitive',
          },
        },
      });

      const date = formatDistance(new Date(r.createdAt * 1000), new Date(), {
        addSuffix: true,
      });

      const rec = {
        amount: ethers.utils.formatEther(r.amount),
        collection: item?.Collection.name,
        itemName: item?.name,
        seller: seller ? seller : { wallet_address: r.listing.lister },
        buyer: buyer
          ? buyer
          : { wallet_address: r.listing.MarketplaceSale.buyer },
        date,
      };
      records.push(rec);
    }

    return {
      ...royaltyHistory,
      records,
    };
  }
}
