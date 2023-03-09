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
  MaxFileSizeValidator,
  ParseFilePipe,
  UploadedFile,
  UseInterceptors,
  ValidationPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { extractJwt } from '../lib/extractJwt';
import {
  ItemDto,
  ItemQueryParamsV2,
  LazyMintSale,
  PaginationQueryParams,
  SetItemMintedDto,
} from './dto/item.dto';
import { fileMimetypeFilter } from './item.controller';
import { ItemServiceV2 } from './item.service.v2';

const maxFileSize = 5 * 1000 * 1000;

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
  @Get('recently-sold')
  getRecentlySoldItem(@Query('page') page: number) {
    return this.itemService.getRecentlySold(page);
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
    @Param('listingId', ParseIntPipe) listingId: number,
    @Query('quantity') quantity: number,
  ) {
    const { user } = req;
    return this.itemService.getLazyMintListingSignature(
      listingId,
      user.wallet_address,
      quantity,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiConsumes('multipart/form-data')
  @Post('/upload-metadata')
  @ApiOkResponse({ description: 'Metadata uploaded to IPFS' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          // Generating a 32 random chars long string
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          //Calling the callback passing the random name generated with the original extension name
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: fileMimetypeFilter('jpeg', 'png', 'jpg', 'gif', 'webp'),
    }),
  )
  uploadIpfsItemMetadata(
    @Request() req: any,
    @Body(
      new ValidationPipe({
        transform: true,
      }),
    )
    createItemDto: ItemDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: maxFileSize })],
      }),
    )
    file: Express.Multer.File,
  ) {
    const { user } = req;
    return this.itemService.uploadIpfsItemMetadata(
      createItemDto,
      file,
      +user.id,
      user.wallet_address,
    );
  }

  @Get('uuid/:uuid')
  getItemByUuid(@Param('uuid') uuid: string) {
    return this.itemService.getItemByUuid(uuid);
  }

  @Get('bids/:listingId')
  getBidsByListingId(
    @Param('listingId') listingId: number,
    @Query() pagination: PaginationQueryParams,
  ) {
    return this.itemService.getBidsByListingId(listingId, pagination);
  }
}
