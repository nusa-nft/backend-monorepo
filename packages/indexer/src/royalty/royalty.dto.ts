import { ApiProperty } from "@nestjs/swagger";

export class RoyaltyReceivedHistoryParams {
  @ApiProperty({
    name: 'tokenIds',
    required: true,
    isArray: true
  })
  tokenIds: number[];

  @ApiProperty({
    name: 'page',
    required: true
  })
  page: number;
}