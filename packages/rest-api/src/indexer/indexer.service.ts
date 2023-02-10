import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ListingType, Prisma } from '@prisma/client';
import { SaleHistoryQueryParams } from 'src/item/dto/item.dto';

@Injectable()
export class IndexerService {
  INDEXER_URL: string;

  constructor(private readonly httpService: HttpService) {
    this.INDEXER_URL = process.env.API_INDEXER_URL;
  }

  async getTokenOwners(tokenId: number | Prisma.Decimal) {
    try {
      const resp = await this.httpService.axiosRef.get(
        `${this.INDEXER_URL}/erc1155/token-owner?tokenId=${tokenId.toString()}`,
      );
      return resp.data;
    } catch (err) {
      Logger.error('indexer.service#getTokenOwners failed to fetch', err);
      return {};
    }
  }

  async getItemActiveListing(assetContract: string, tokenId: number | Prisma.Decimal) {
    try {
      const resp = await this.httpService.axiosRef.get(
        `${this.INDEXER_URL}/marketplace/active-listing?assetContractAddress=${assetContract}&tokenId=${tokenId.toString()}`,
      );
      return resp.data;
    } catch (err) {
      Logger.error('indexer.service#getItemActiveListing failed to fetch', err);
      return null;
    }
  }

  async getMarketplaceActiveListings(
    page: number,
    sortBy,
    walletAddress: string,
  ) {
    try {
      const resp = await this.httpService.axiosRef.get(
        `${this.INDEXER_URL}/marketplace/listings?page=${page}&sortBy=${sortBy}&listerAddress=${walletAddress}`,
      );
      return resp.data;
    } catch (err) {
      Logger.error(
        'indexer.service#getMarketplaceActiveListings failed to fetch',
        err,
      );
      return null;
    }
  }

  async getOwnedTokensByWallet(walletAddress: string) {
    try {
      const resp = await this.httpService.axiosRef.get(
        `${this.INDEXER_URL}/erc1155/owned-by-wallet?walletAddress=${walletAddress}`,
      );
      return resp.data;
    } catch (err) {
      Logger.error('indexer.service#getOwnedByWallet failed to fetch', err);
      return null;
    }
  }

  async getListingOffers(listingId: number) {
    try {
      const resp = await this.httpService.axiosRef.get(
        `${this.INDEXER_URL}/marketplace/offers/${listingId}`,
      );
      return resp.data;
    } catch (err) {
      Logger.error('indexer.service#getListingOffers failed to fetch', err);
    }
  }

  async getStatusData(
    tokenIds: string,
    totalItems: number,
    lazyMintedOwners: string,
    lazyMintedItemPrices: string,
    soldLazyMintedItemPrices: string,
  ) {
    try {
      const resp = await this.httpService.axiosRef.get(
        `${this.INDEXER_URL}/marketplace/collection-status?tokenIds=${tokenIds}&totalItems=${totalItems}&lazyMintedOwners=${lazyMintedOwners}&lazyMintedItemPrices=${lazyMintedItemPrices}&soldLazyMintedItemPrices=${soldLazyMintedItemPrices}`,
      );
      return resp.data;
    } catch (err) {
      Logger.error('indexer.service#getStatusData failed to fetch', err);
    }
  }

  async getItemOfferHistory(tokenId: number, page: number, floorPrice: number) {
    try {
      const resp = await this.httpService.axiosRef.get(
        `${this.INDEXER_URL}/marketplace/offer-history?tokenId=${tokenId}&page=${page}&floorPrice=${floorPrice}`,
      );
      return resp.data;
    } catch (err) {
      Logger.error('indexer.service#getItemOfferHistory failed to fetch', err);
    }
  }

  async getRoyaltyReceivedHistory(tokenIds: number[] | Prisma.Decimal[], page: number) {
    try {
      const resp = await this.httpService.axiosRef.get(
        `${this.INDEXER_URL}/royalty?${tokenIds
          .map((x) => 'tokenIds=' + x)
          .join('&')}&page=${page}`,
      );
      return resp.data;
    } catch (err) {
      Logger.error(
        'indexer.service#getRoyaltyReceivedHistory failed to fetch',
        err,
      );
    }
  }

  async getItemActivities(tokenId: number | Prisma.Decimal, page: number, event: string) {
    try {
      const resp = await this.httpService.axiosRef.get(
        `${
          this.INDEXER_URL
        }/erc1155/activities?tokenId=${tokenId.toString()}&page=${page}${
          event ? `&event=${event}` : ''
        }`,
      );
      return resp.data;
    } catch (err) {
      Logger.error('indexer.service#getItemActivities failed to fetch', err);
    }
  }

  async getItemSaleHistory(tokenId: number | Prisma.Decimal, sortBy: SaleHistoryQueryParams) {
    try {
      const resp = await this.httpService.axiosRef.get(
        `${this.INDEXER_URL}/marketplace/sale-history/${tokenId.toString()}?&sortRange=${sortBy.sortRange}`,
      );
      return resp.data;
    } catch (err) {
      Logger.error('indexer.service#getItemSaleHistory failed to fetch', err);
    }
  }

  async getMarketplaceListerAddress(listingId: number) {
    try {
      const resp = await this.httpService.axiosRef.get(
        `${this.INDEXER_URL}/marketplace/get-lister/${listingId}?`,
      );
      return resp.data;
    } catch (err) {
      Logger.error(
        'indexer.service#getMarketplaceListerAddress failed to fetch',
        err,
      );
    }
  }

  async getTokenIdsOnSale({
    page,
    owner,
    listingType,
    hasOffers,
    priceMin,
    priceMax,
  }: {
    page: number;
    owner?: string;
    listingType?: ListingType;
    hasOffers?: boolean;
    priceMin?: string;
    priceMax?: string;
  }) {
    try {
      const resp = await this.httpService.axiosRef.get(
        `${this.INDEXER_URL}/erc1155/on-sale/`,
        {
          params: {
            page,
            owner,
            listingType,
            hasOffers,
            priceMin,
            priceMax,
          },
        },
      );
      return resp.data;
    } catch (err) {
      Logger.error('indexer.service#getTokenIdsOnSale failed to fetch', err);
    }
  }

  async getCollectionActivities(tokenId: string, page: number, event: string) {
    try {
      const resp = await this.httpService.axiosRef.get(
        `${
          this.INDEXER_URL
        }/erc1155/collection-activities?tokenId=${tokenId}&page=${page}${
          event ? `&event=${event}` : ''
        }`,
      );
      return resp.data;
    } catch (err) {
      Logger.error(
        'indexer.service#getCollectionActivities failed to fetch',
        err,
      );
    }
  }
}
