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
  voucher: string;
  @ApiProperty()
  @IsNotEmpty()
  toAddress: string;
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
  @ApiProperty()
  voucherHashes: string[];
  @ApiProperty()
  voucherRootHash: string;
  @ApiProperty()
  itemUuid: string;
}

export class CreateVoucherDTO {
  @ApiProperty()
  voucher: string[];
}

export class GenerateUuidDTO {
  @ApiProperty()
  quantity: number;
}
