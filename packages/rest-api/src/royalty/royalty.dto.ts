import { ApiProperty } from '@nestjs/swagger';

export class RoyaltyReceivedHistoryParams {
  @ApiProperty({
    name: 'collectionId',
    required: true,
  })
  collectionId: number;

  @ApiProperty({
    name: 'page',
    required: true,
  })
  page: number;
}
