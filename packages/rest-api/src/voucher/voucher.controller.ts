import { Controller, Body, Post, Get, Param } from '@nestjs/common';
import { VoucherService } from './voucher.service';
import {
  ApiTags,
} from '@nestjs/swagger';
import { CheckDTO, ClaimDTO, CreateDTO, CreateVoucherDTO, RegisterDTO } from './voucher.dto';


@ApiTags('voucher')
// @ApiBearerAuth()
@Controller('voucher')
export class VoucherController {
  constructor(
    private readonly voucherService: VoucherService,
  ) {}

  @Post('claim')
  claim(@Body() param: ClaimDTO) {
    return this.voucherService.claim(
      param.voucher,
      param.tokenId,
      param.toAddress,
      param.signature,
    );
  }

  @Post('check')
  check(@Body() param: CheckDTO) {
    return this.voucherService.check(param.tokenId, param.voucher);
  }

  @Get('owner')
  getOwner() {
    return this.voucherService.ownerContract();
  }

  @Get('creator/:tokenId')
  getCreator(@Param('tokenId') tokenId: string) {
    return this.voucherService.getCreator(tokenId);
  }

  @Post('create')
  createToken(@Body() param: CreateDTO) {
    return this.voucherService.create(param.toAddress, param.tokenURI);
  }

  @Post('create-voucher')
  createVoucher(@Body() param: CreateVoucherDTO) {
    return this.voucherService.createVoucher(
      param.tokenId,
      param.voucher,
      param.exp,
    );
  }

  @Post('register-voucher-queue')
  queueRegisterVoucher(@Body() param: RegisterDTO) {
    return this.voucherService.queueRegisterVoucher(param);
  }

  @Post('create-nft-queue')
  queueCreateNft(@Body() param: CreateDTO) {
    return this.voucherService.queueCreateNft(param);
  }

  @Post('claim-nft-queue')
  queueClaimNft(@Body() param: ClaimDTO) {
    return this.voucherService.queueClaimNft(param);
  }
}
