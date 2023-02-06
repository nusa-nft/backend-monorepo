import { ApiProperty } from '@nestjs/swagger';

export class PaginationQueryParams {
  @ApiProperty({
    description: 'page number',
    type: Number,
    required: true,
  })
  page?: number;
}
