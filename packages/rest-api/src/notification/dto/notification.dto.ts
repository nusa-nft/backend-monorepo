import { ApiProperty } from '@nestjs/swagger';

export enum Take {
  Take_3 = 'Take_3',
  Take_10 = 'Take_10',
}

export class NotificationQueryParam {
  @ApiProperty({
    type: Number,
    description: 'page number',
  })
  page: number;

  @ApiProperty({
    enum: Take,
  })
  take: Take;
}
