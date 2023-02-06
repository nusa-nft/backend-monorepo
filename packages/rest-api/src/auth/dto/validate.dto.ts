import { ApiProperty } from '@nestjs/swagger';

export class ValidateDto {
  @ApiProperty({
    type: String,
    description: 'wallet address of user',
  })
  walletAddress: string;
  @ApiProperty({
    type: String,
    description: 'signed message',
  })
  signature: string;
  @ApiProperty({
    type: String,
    description: 'message content',
  })
  message: string;
}
