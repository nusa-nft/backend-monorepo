import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ListingType, TokenType } from '@prisma/client';
import { ToBoolean } from '../../lib/toBoolean';

export enum OnSaleItemSortBy {
  RECENTLY_ADDED,
  PRICE_HIGH_TO_LOW,
  PRICE_LOW_TO_HIGH,
  AUCTION_ENDING_SOON,
}

export enum PriceHistorySortBy {
  LAST_7_DAYS,
  LAST_30_DAYS,
  LAST_60_DAYS,
  LAST_90_DAYS,
  LAST_24_HOURS,
}

export class ItemDto {
  @ApiProperty({
    type: String,
    description: 'Item name',
  })
  name: string;

  @ApiProperty({
    type: String,
    description: 'Item description',
  })
  description: string;

  @ApiProperty({
    type: String,
    required: false,
    description: 'Item external link',
  })
  external_link: string;

  @ApiProperty({
    type: Number,
    description: 'Item collection ID',
  })
  collection_id: number;

  @ApiProperty({
    format: 'binary',
    description: 'received mime types: jpeg, png, jpg, gif, webp',
  })
  image: string;

  @ApiProperty({
    type: Number,
    description: 'item supply',
  })
  supply: number;

  @ApiProperty({
    type: Boolean,
    default: false,
    description: 'unlockable option',
  })
  @ToBoolean()
  unlockable: boolean;

  @ApiProperty({
    type: Boolean,
    default: false,
    description: 'explicit & sensitive identifier',
  })
  @ToBoolean()
  explicit_sensitive: boolean;

  @ApiProperty({
    type: Boolean,
    default: false,
    description: 'is metadata frozen status',
  })
  @ToBoolean()
  is_metadata_freeze: boolean;

  @ApiProperty({
    type: 'object',
    name: 'attributes',
    description: 'item attributes',
    additionalProperties: {},
    example: [
      {
        trait_type: 'eyes',
        nusa_attribute_type: 'PROPERTIES',
        value: 'blue',
      },
    ],
    required: false,
  })
  attributes: string;

  @ApiProperty({
    type: String,
    description: 'blockchain chain id',
    required: false,
  })
  chainId: number;

  @ApiProperty({
    type: Boolean,
    default: false,
    description: 'mint status',
  })
  @ToBoolean()
  is_minted: boolean;
}

export class ItemQueryParams {
  @ApiProperty({
    type: Number,
    description: 'collectionId',
    required: true,
  })
  collectionId: number;

  @ApiProperty({
    type: 'object',
    description: 'attributes',
    name: 'attributes',
    additionalProperties: {},
    required: false,
    example: {
      attributes: {
        eyes: ['blue', 'red'],
        body: 'skinny',
        height: {
          min: 1,
          max: 2,
        },
      },
    },
  })
  attributes: Map<string, string | number>;

  @ApiProperty({
    type: String,
    description: 'name',
    required: false,
  })
  name: string;

  @ApiProperty({
    type: String,
    description: 'category name',
    required: false,
  })
  category: string;

  @ApiProperty({
    type: String,
    description: 'creator wallet address',
    required: false,
  })
  walletAddress: string;

  @ApiProperty({
    description: 'page number',
    type: Number,
    required: true,
  })
  page?: number;
}

export class SetItemMintedDto {
  @ApiProperty({
    type: Number,
    description: 'tokenId',
    required: true,
  })
  tokenId: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'quantityMinted',
    required: false,
  })
  quantityMinted?: number;
}

export class LazyMintListingDto {
  @ApiProperty({
    type: Number,
    description: 'startTime',
    required: true,
  })
  startTime: number;

  @ApiProperty({
    type: Number,
    description: 'endTime',
    required: true,
  })
  endTime: number;

  @ApiProperty({
    type: Number,
    description: 'quantity',
    required: true,
  })
  quantity: number;

  @ApiProperty({
    type: String,
    description:
      'currency (token address) 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE for native tokens',
    required: true,
  })
  currency: string;

  @ApiProperty({
    type: String,
    description: 'reservePricePerToken',
    required: true,
  })
  reservePricePerToken: string;

  @ApiProperty({
    type: String,
    description: 'buyoutPricePerToken',
    required: true,
  })
  buyoutPricePerToken: string;

  @ApiProperty({
    enum: TokenType,
    description: 'tokenType: "ERC1155" or "ERC721"',
    required: true,
  })
  tokenType: TokenType;

  @ApiProperty({
    enum: ListingType,
    description: 'listingType: "DIRECT" or "AUCTION"',
    required: true,
  })
  listingType: ListingType;
}

export class PaginationQueryParams {
  @ApiProperty({
    description: 'page number',
    type: Number,
    required: true,
  })
  page?: number;
}

export class OnSaleQueryParams {
  @ApiProperty({
    description: 'page number',
    type: Number,
    required: true,
  })
  page?: number;

  @ApiProperty({
    description: 'collection categoryId',
    type: Number,
    required: false,
  })
  categoryId: number;

  @ApiProperty({
    description: 'owner wallet address',
    type: String,
    required: false,
  })
  owner_address: string;

  @ApiProperty({
    description: 'sort by',
    enum: OnSaleItemSortBy,
    required: false,
  })
  sortBy: OnSaleItemSortBy;

  @ApiProperty({
    description: 'nsfw only',
    type: Boolean,
    default: false,
    required: false,
  })
  @ToBoolean()
  nsfwOnly: boolean;

  @ApiProperty({
    description: 'show lazy minted',
    type: Boolean,
    default: false,
    required: false,
  })
  @ToBoolean()
  showLazyMinted: boolean;
}

export class ActivitiesParams extends PaginationQueryParams {
  @ApiPropertyOptional({
    name: 'event',
    required: false,
  })
  event?: string;
}

export class SaleHistoryQueryParams {
  @ApiProperty({
    type: String,
    description: 'price history sorting',
    enum: PriceHistorySortBy,
  })
  sortRange: PriceHistorySortBy;
}

export class LazyMintSale {
  @ApiProperty({
    type: Number,
    description: 'listingId',
  })
  listingId: number;

  @ApiProperty({
    type: Number,
    description: 'quantity',
  })
  quantity: number;
}

export class ItemQueryParamsV2 {
  @ApiProperty({
    type: Number,
    description: 'collectionId',
    required: false,
  })
  collectionId: number;

  @ApiProperty({
    type: 'object',
    description: 'attributes',
    name: 'attributes',
    additionalProperties: {},
    required: false,
    example: {
      attributes: {
        eyes: ['blue', 'red'],
        body: 'skinny',
        height: {
          min: 1,
          max: 2,
        },
      },
    },
  })
  attributes: Map<string, string | number>;

  @ApiProperty({
    type: String,
    description: 'name',
    required: false,
  })
  name: string;

  @ApiProperty({
    type: Number,
    description: 'Category id',
    required: false,
  })
  categoryId: number;

  @ApiProperty({
    type: String,
    description: 'creator wallet address',
    required: false,
  })
  creator?: string;

  @ApiProperty({
    type: String,
    description: 'owner wallet address',
    required: false,
  })
  owner?: string;

  @ApiProperty({
    type: Boolean,
    description: 'is favorited. need to be authenticated with bearer token',
    required: false,
  })
  @ToBoolean()
  isFavorited?: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'is currently on sale',
    required: false,
  })
  @ToBoolean()
  isOnSale?: boolean;

  @ApiProperty({
    type: ListingType,
    description: 'Auction | Direct',
    required: false,
  })
  listingType?: ListingType;

  @ApiProperty({
    type: Boolean,
    description: 'has offers',
    required: false,
  })
  @ToBoolean()
  hasOffers?: boolean;

  @ApiProperty({
    type: Number,
    description: 'Min price',
    required: false,
  })
  priceMin: number;

  @ApiProperty({
    type: Number,
    description: 'Max price',
    required: false,
  })
  priceMax: number;

  @ApiProperty({
    type: Boolean,
    description: 'Multiple Items',
    required: false,
  })
  @ToBoolean()
  isMultiple: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Single Item',
    required: false,
  })
  @ToBoolean()
  isSingle: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Recently Sold',
    required: false,
  })
  @ToBoolean()
  isRecentlySold: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Search Collection',
    required: false,
  })
  @ToBoolean()
  searchCollection: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Search Account',
    required: false,
  })
  @ToBoolean()
  searchAccount: boolean;

  @ApiProperty({
    type: Number,
    description: 'account page number',
    required: false,
  })
  accountPage: number;

  @ApiProperty({
    type: Number,
    description: 'collection page number',
    required: false,
  })
  collectionPage: number;

  @ApiProperty({
    description: 'page number',
    type: Number,
    required: true,
  })
  page: number;
}
