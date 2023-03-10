import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Display } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ToBoolean } from '../../lib/toBoolean';

export enum PriceHistorySortBy {
  LAST_7_DAYS = 'LAST_7_DAYS',
  LAST_30_DAYS = 'LAST_30_DAYS',
  LAST_60_DAYS = 'LAST_60_DAYS',
  LAST_90_DAYS = 'LAST_90_DAYS',
  LAST_24_HOURS = 'LAST_24_HOURS',
}

export enum SortBy {
  VOLUME = 'VOLUME',
  PERCENT_CHANGES = 'PERCENT_CHANGES',
  FLOOR_PRICE = 'FLOOR_PRICE',
}

export class Royalty {
  @ApiProperty({
    type: Number,
    description: 'collection category id',
  })
  wallet_address: string;

  @ApiProperty({
    type: Number,
    description: 'collection category id',
  })
  percentage: number;
}
export class CollectionDto {
  @ApiProperty({
    type: String,
    format: 'binary',
    description: 'received mime types: jpeg, png, jpg, gif',
  })
  logo_image?: string;

  @ApiProperty({
    type: String,
    format: 'binary',
    required: false,
    description: 'received mime types: jpeg, png, jpg, gif',
  })
  banner_image?: string;

  @ApiProperty({
    type: String,
    format: 'binary',
    required: false,
    description: 'received mime types: jpeg, png, jpg, gif',
  })
  feature_image?: string;

  @ApiProperty({
    type: String,
    description: 'collection name',
  })
  name: any;

  @ApiProperty({
    type: String,
    description: 'collection slug',
  })
  slug: any;

  @ApiProperty({
    type: String,
    required: false,
    description: 'collection description',
  })
  description?: string;

  @ApiProperty({
    type: String,
    required: false,
    description: 'collection creator address',
  })
  creator_address: string;

  @ApiProperty({
    type: Number,
    description: 'collection category id',
  })
  @Transform((val) => Number(val.value))
  category_id: number;

  @ApiProperty({
    type: String,
    description:
      'JSON array of object with key wallet_address: string, percentage: float. Percentage must not exceed 0.1 ',
  })
  royalty?: string;

  @ApiProperty({
    type: Number,
    description: 'blockchain chain id',
  })
  @Transform((val) => Number(val.value))
  chainId: number;

  @ApiProperty({
    type: String,
    description: 'website link',
  })
  website_link?: string;

  @ApiProperty({
    type: String,
    description: 'discord link',
  })
  discord_link?: string;

  @ApiProperty({
    type: String,
    description: 'telegram link',
  })
  telegram_link?: string;

  @ApiProperty({
    type: String,
    description: 'medium link',
  })
  medium_link?: string;

  @ApiProperty({
    type: Number,
    description: 'paymen token address',
  })
  payment_token?: number;

  @ApiProperty({
    type: Number,
    description: 'explicit & sensitive content identifier',
  })
  @ToBoolean()
  explicit_sensitive: boolean;
}

export class UpdateCollectionDto {
  @ApiProperty({
    type: String,
    format: 'binary',
    required: false,
    description: 'received mime types: jpeg, png, jpg, gif',
  })
  logo_image: string;

  @ApiProperty({
    type: String,
    format: 'binary',
    required: false,
    description: 'received mime types: jpeg, png, jpg, gif',
  })
  banner_image: string;

  @ApiProperty({
    type: String,
    format: 'binary',
    required: false,
    description: 'received mime types: jpeg, png, jpg, gif',
  })
  feature_image: string;

  @ApiProperty({
    type: String,
    required: false,
    description: 'collection name',
  })
  name: any;

  @ApiProperty({
    type: String,
    description: 'collection slug',
  })
  slug: any;

  @ApiProperty({
    type: String,
    required: false,
    description: 'collection description',
  })
  description: string;

  @ApiProperty({
    type: String,
    required: false,
    description: 'collection contract address',
  })
  contract_address: string;

  @ApiProperty({
    type: Number,
    required: false,
    description: 'collection category id',
  })
  Category: any;

  @ApiProperty({
    type: Number,
    required: false,
    description: 'collection creator address',
  })
  Creator: any;

  @ApiProperty({
    type: Array,
    required: false,
    description: 'royalty',
  })
  royalty: any;

  @ApiProperty({
    type: Number,
    required: false,
    description: 'blockchain chain id',
  })
  chainId: number;

  @ApiProperty({
    type: String,
    description: 'website link',
  })
  website_link: string;

  @ApiProperty({
    type: String,
    description: 'discord link',
  })
  discord_link: string;

  @ApiProperty({
    type: String,
    description: 'telegram link',
  })
  telegram_link: string;

  @ApiProperty({
    type: String,
    description: 'medium link',
  })
  medium_link: string;

  @ApiProperty({
    type: String,
    required: false,
    description: 'paymen token address',
  })
  payment_token: string;

  @ApiProperty({
    type: String,
    default: 'CONTAINED',
    description: 'enum, display theme, PADDED, CONTAINED, COVERED',
  })
  display_theme: Display;

  @ApiProperty({
    type: Number,
    required: false,
    description: 'explicit & sensitive content identifier',
  })
  explicit_sensitive: boolean;
}

export class SaleHistoryQueryParams {
  @ApiProperty({
    type: String,
    description: 'sorting range',
    enum: PriceHistorySortBy,
  })
  sortRange: PriceHistorySortBy;
}

export class CollectionSortBy {
  @ApiProperty({
    type: String,
    description: 'sort by',
    enum: SortBy,
  })
  sortBy: SortBy;
}

export class CollectionActivitiesParams {
  @ApiPropertyOptional({
    name: 'event',
    required: false,
  })
  event?: string;

  @ApiProperty({
    type: Number,
    description: 'page number',
  })
  page: number;
}

export class ImportDto {
  @ApiProperty({
    name: 'contractAddress',
    required: true,
  })
  contractAddress: string;

  @ApiProperty({
    name: 'categoryId',
    required: true,
  })
  categoryId: number;
}

export class CollectionStatusQueryParams {
  @ApiProperty({
    type: String,
    description: 'token ids',
    example: '1, 2, 3',
  })
  tokenIds: number[];

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
//       }

export class RefreshMetadataDto {
  // TODO:
}

export class SyncOwnershipDto {
  // TODO:
}
