import { ApiProperty } from '@nestjs/swagger';

export enum OnSaleItemSortBy {
  RECENTLY_ADDED = 'RECENTLY_ADDED',
  PRICE_HIGH_TO_LOW = 'PRICE_HIGH_TO_LOW',
  PRICE_LOW_TO_HIGH = 'PRICE_LOW_TO_HIGH',
  AUCTION_ENDING_SOON = 'AUCTION_ENDING_SOON',
}

export enum PriceHistorySortBy {
  LAST_7_DAYS = 'LAST_7_DAYS',
  LAST_30_DAYS = 'LAST_30_DAYS',
  LAST_60_DAYS = 'LAST_60_DAYS',
  LAST_90_DAYS = 'LAST_90_DAYS',
  LAST_24_HOURS = 'LAST_24_HOURS',
}

export class OnSaleQueryParams {
  page?: number;
  sortBy: OnSaleItemSortBy;
  listerAddress: string;
}

export class CollectionStatusQueryParams {
  @ApiProperty({
    type: String,
    description: 'token ids',
    example: '1, 2, 3',
  })
  tokenIds: string;

  @ApiProperty({
    type: Number,
    description: 'total items',
    required: false,
  })
  totalItems: number;

  @ApiProperty({
    type: String,
    description: 'lazy minted item owners address',
    example: '0x0000000',
    required: false,
  })
  lazyMintedOwners: string;

  @ApiProperty({
    type: String,
    description: 'lazy minted item prices',
    example: '0.001, 0.003, 0.003',
    required: false,
  })
  lazyMintedItemPrices: string;

  @ApiProperty({
    type: String,
    description: 'sold lazy minted item prices',
    example: '0.001, 0.003, 0.003',
    required: false,
  })
  soldLazyMintedItemPrices: string;
}

export class SaleHistoryQueryParams {
  @ApiProperty({
    type: String,
    description: 'price history sorting',
    enum: PriceHistorySortBy,
  })
  sortRange: PriceHistorySortBy;
}
