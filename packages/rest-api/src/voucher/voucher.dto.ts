import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

ApiProperty;
export class RegisterDTO {
  @ApiProperty()
  @IsNotEmpty()
  tokenId: number;
  @ApiProperty()
  @IsNotEmpty()
  hash: string[];
}

export class ClaimDTO {
  @ApiProperty()
  @IsNotEmpty()
  tokenId: number;
  @ApiProperty()
  @IsNotEmpty()
  voucher: string;
  @ApiProperty()
  @IsNotEmpty()
  toAddress: string;
  @ApiProperty()
  @IsNotEmpty()
  signature: string;
}

export class CheckDTO {
  @ApiProperty()
  @IsNotEmpty()
  tokenId: number;
  @ApiProperty()
  @IsNotEmpty()
  voucher: string;
}

export class CreateNftDTO {
  @ApiProperty()
  toAddress: string;
  @ApiProperty()
  tokenURI: string;
}

export class CreateVoucherDTO {
  @ApiProperty()
  voucher: string[];
}

export class GenerateUuidDTO {
  @ApiProperty()
  quantity: number;
}