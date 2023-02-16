import {
  Body,
  Controller,
  Post,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  UnsupportedMediaTypeException,
  Get,
  Param,
  Query,
  Patch,
  Headers,
  Ip,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ItemService } from './item.service';
import {
  ItemDto,
  SetItemMintedDto,
  PaginationQueryParams,
  LazyMintListingDto,
  ActivitiesParams,
  SaleHistoryQueryParams,
} from './dto/item.dto';
import { extractJwt } from '../lib/extractJwt';
import { diskStorage } from 'multer';
import { extname } from 'path';

const maxFileSize = 5 * 1000 * 1000;

@ApiTags('Item')
@ApiBearerAuth()
@Controller('item')
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiConsumes('multipart/form-data')
  @Post('')
  @ApiOkResponse({ description: 'Item has been created' })
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
  createItem(
    @Request() req: any,
    @Body() createItemDto: ItemDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: maxFileSize })],
      }),
    )
    file: Express.Multer.File,
  ) {
    const { user } = req;
    return this.itemService.createItem(
      createItemDto,
      file,
      +user.id,
      user.wallet_address,
    );
  }

  @ApiBearerAuth('jwt')
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  deleteItem(@Param('id') id: number, @Request() req: any) {
    return this.itemService.deleteItem(+id, req.user.wallet_address);
  }

  @Get('filter-data/:collectionId')
  getFilter(@Param('collectionId') collectionId: number) {
    return this.itemService.filter(+collectionId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Post('like/:itemId')
  like(@Request() req: any, @Param('itemId') itemId: number) {
    const { user } = req;
    return this.itemService.like(+user.id, itemId);
  }

  @ApiBearerAuth('jwt')
  @Get('views/:itemId')
  view(
    @Headers() headers: any,
    @Request() req: any,
    @Param('itemId') itemId: number,
    @Ip() ip: string,
  ) {
    const authorization = headers.authorization;
    const token = extractJwt(authorization);

    let realIp = headers['x-forwarded-for'];
    if (!realIp) {
      realIp = ip;
    }

    return this.itemService.view(token, +itemId, realIp);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Post('create-lazymint-listing/:itemId')
  createLazyMintListing(
    @Request() req: any,
    @Param('itemId') itemId: number,
    @Body() listingData: LazyMintListingDto,
  ) {
    const { user } = req;
    return this.itemService.createLazyMintListing(
      +itemId,
      user.id,
      listingData,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Post('cancel-lazymint-listing/:listingId')
  cancelLazyMintListing(@Param('listingId') listingId: number) {
    return this.itemService.cancelLazyMintListing(listingId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Get('get-lazymint-listing-signature/:listingId')
  getLazyMintListingSignature(
    @Request() req: any,
    @Param('listingId') listingId: number,
  ) {
    const { user } = req;
    return this.itemService.getLazyMintListingSignature(
      listingId,
      user.wallet_address,
    );
  }

  @Get('metadata/:itemId')
  getItemMetadata(@Param('itemId') itemId: number) {
    return this.itemService.getItemMetadata(itemId);
  }

  @Get('offer-history/:itemId')
  getItemOfferHistory(
    @Param('itemId') itemId: number,
    @Query() pagination: PaginationQueryParams,
  ) {
    return this.itemService.getItemOfferHistory(+itemId, pagination);
  }

  @Get('activities/:itemId')
  getItemActivities(
    @Param('itemId') itemId: number,
    @Query() params: ActivitiesParams,
  ) {
    return this.itemService.getItemActivities(+itemId, params);
  }

  @Get('sale-history/:itemId')
  getItemSaleHistory(
    @Param('itemId') itemId: number,
    @Query() sortBy: SaleHistoryQueryParams,
  ) {
    return this.itemService.getItemSaleHistory(+itemId, sortBy);
  }
}

export function fileMimetypeFilter(...mimetypes: string[]) {
  return (
    req,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (mimetypes.some((m) => file.mimetype.includes(m))) {
      callback(null, true);
    } else {
      callback(
        new UnsupportedMediaTypeException(
          `File type is not matching: ${mimetypes.join(', ')}`,
        ),
        false,
      );
    }
  };
}
