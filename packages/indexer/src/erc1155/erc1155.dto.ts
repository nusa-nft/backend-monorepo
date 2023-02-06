import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ListingType, TokenType } from '@prisma/client';
import { ToBoolean } from "../lib/toBoolean";

export class PaginationParams {
  @ApiProperty({
    name: 'page'
  })
  page: number;
}

export class TokenActivitiesParams extends PaginationParams {
  @ApiProperty({
    name: 'tokenId'
  })
  tokenId: number;

  @ApiPropertyOptional({
    name: 'event',
    required: false,
  })
  event?: string
}

export class OnSaleParams extends PaginationParams {
  @ApiProperty({
    name: 'owner',
    type: String,
    required: false,
  })
  owner?: string

  @ApiProperty({
    name: 'listingType',
    type: ListingType,
  })
  listingType?: ListingType

  @ApiProperty({
    type: Boolean,
    name: 'hasOffers',
    required: false,
  })
  @ToBoolean()
  hasOffers?: boolean;

  @ApiProperty({
    type: String,
    name: 'Min price',
    required: false,
  })
  priceMin: string;

  @ApiProperty({
    type: String,
    name: 'Max price',
    required: false,
  })
  priceMax: string
}

export class CollectionActivitiesParams extends PaginationParams {
  @ApiProperty({
    name: 'tokenId'
  })
  tokenId: string;

  @ApiPropertyOptional({
    name: 'event',
    required: false,
  })
  event?: string
}
