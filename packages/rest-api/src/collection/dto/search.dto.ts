import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { ToBoolean } from 'src/lib/toBoolean';

export class SearchDtoParam {
  @ApiProperty({
    description: 'collection name',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsString()
  collection_name?: string;

  @ApiProperty({
    description: 'category name',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({
    description: 'Is Curated',
    type: Boolean,
    required: false,
  })
  @ToBoolean()
  isCurated?: boolean;

  @ApiProperty({
    description: 'page number',
    type: [Number],
    required: false,
  })
  page?: number;
}
