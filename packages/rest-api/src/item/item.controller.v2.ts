import {
  Body,
  Controller,
  UseGuards,
  Get,
  Post,
  Param,
  Patch,
  Headers,
  Version,
  Request,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { extractJwt } from 'src/lib/extractJwt';
import {
  ItemQueryParamsV2,
  LazyMintSale,
  SetItemMintedDto,
} from './dto/item.dto';
import { ItemServiceV2 } from './item.service.v2';

@ApiTags('Item')
@ApiBearerAuth()
@Controller({ version: '2', path: 'item' })
export class ItemControllerV2 {
  constructor(private readonly itemService: ItemServiceV2) {}

  @Version('2')
  @ApiBearerAuth('jwt')
  @Get()
  getItems(@Query() filter: ItemQueryParamsV2, @Headers() headers: any) {
    const authorization = headers.authorization;
    const token = extractJwt(authorization);
    return this.itemService.getItems(filter, token);
  }

  @Version('2')
  @Get(':id')
  getItem(@Param('id') id: number, @Headers() headers: any) {
    const authorization = headers.authorization;
    const jwtToken = extractJwt(authorization);
    return this.itemService.getItem(+id, jwtToken);
  }

  @Version('2')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Patch('set-minted/:itemId')
  setMinted(
    @Param('itemId') itemId: number,
    @Body() { tokenId, quantityMinted }: SetItemMintedDto,
  ) {
    return this.itemService.setMinted(+itemId, tokenId, quantityMinted);
  }

  @Version('2')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Post('lazy-mint-sale')
  createLazyMintSale(@Body() { listingId, quantity }: LazyMintSale) {
    return this.itemService.createLazyMintSale(listingId, quantity);
  }

  @Version('2')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Get('get-lazymint-listing-signature/:listingId')
  getLazyMintListingSignature(
    @Request() req: any,
    @Param('listingId') listingId: number,
    @Query('quantity') quantity: number,
  ) {
    const { user } = req;
    return this.itemService.getLazyMintListingSignature(
      listingId,
      user.wallet_address,
      quantity,
    );
  }
}
