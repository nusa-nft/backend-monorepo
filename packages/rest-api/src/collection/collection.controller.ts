import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Query,
  UseGuards,
  UseInterceptors,
  UnsupportedMediaTypeException,
  UploadedFiles,
  Request,
  Headers,
  Delete,
} from '@nestjs/common';
import { diskStorage } from 'multer';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CollectionService } from './collection.service';
import {
  CollectionActivitiesParams,
  CollectionDto,
  CollectionSortBy,
  ImportDto,
  RefreshMetadataDto,
  SaleHistoryQueryParams,
  SyncOwnershipDto,
  UpdateCollectionDto,
} from './dto/collection.dto';
import { SearchDtoParam } from './dto/search.dto';
import { extractJwt } from '../lib/extractJwt';

const maxFileSize = 5 * 1000 * 1000;
@ApiTags('collection')
@ApiBearerAuth()
@Controller('collection')
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiConsumes('multipart/form-data')
  @Post('create')
  @ApiOkResponse({ description: 'Collection has been created' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'logo_image', maxCount: 1 },
        { name: 'feature_image', maxCount: 1 },
        { name: 'banner_image', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: join(__dirname, '../../uploads'),
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
        limits: { fileSize: maxFileSize },
        fileFilter: fileMimetypeFilter('jpeg', 'png', 'jpg', 'gif', 'webp'),
      },
    ),
  )
  createCollection(
    @UploadedFiles()
    files: {
      logo_image?: Express.Multer.File;
      feature_image?: Express.Multer.File;
      banner_image?: Express.Multer.File;
    },
    @Body() createCollectionDto: CollectionDto,
    @Request() req: any,
  ) {
    if (files) {
      if (files.logo_image) {
        createCollectionDto.logo_image = files.logo_image[0].filename;
      }
      if (files.feature_image) {
        createCollectionDto.feature_image = files.feature_image[0].filename;
      }
      if (files.banner_image) {
        createCollectionDto.banner_image = files.banner_image[0].filename;
      }
    }
    const { user } = req;
    return this.collectionService.createCollection(
      user.wallet_address,
      createCollectionDto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Patch('update/:id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'logo_image', maxCount: 1 },
        { name: 'feature_image', maxCount: 1 },
        { name: 'banner_image', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: join(__dirname, '../../uploads'),
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
        limits: { fileSize: maxFileSize },
        fileFilter: fileMimetypeFilter('jpeg', 'png', 'jpg', 'gif', 'webp'),
      },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ description: 'Collection has been Updated' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async updateCollection(
    @UploadedFiles()
    files: {
      logo_image?: Express.Multer.File;
      feature_image?: Express.Multer.File;
      banner_image?: Express.Multer.File;
    },
    @Param('id') id: number,
    @Request() req: any,
    @Body() updateCollectionDto: UpdateCollectionDto,
  ) {
    const { user } = req;
    if (files) {
      if (files.logo_image) {
        updateCollectionDto.logo_image = files.logo_image[0].filename;
      }
      if (files.feature_image) {
        updateCollectionDto.feature_image = files.feature_image[0].filename;
      }
      if (files.banner_image) {
        updateCollectionDto.banner_image = files.banner_image[0].filename;
      }
    }
    return this.collectionService.updateCollection(
      +id,
      user.wallet_address,
      updateCollectionDto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Patch('delete/:id')
  @ApiOkResponse({ description: 'Collection has been deleted' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  deleteCollection(@Param('id') id: number, @Request() req: any) {
    const { user } = req;
    return this.collectionService.deleteCollection(+id, user.wallet_address);
  }

  @Get('')
  @ApiOkResponse({ description: 'Success' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  findCollection(@Query() search_param: SearchDtoParam) {
    return this.collectionService.findByCollection(search_param);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Get('my-collection')
  @ApiOkResponse({ description: 'Success' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  myCollection(@Request() req: any, @Query() search_param: SearchDtoParam) {
    const { user } = req;
    return this.collectionService.findMyCollection(user.id, search_param);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Get('watchlist')
  watchlist(@Request() req: any, @Query('page') page: number) {
    const { user } = req;
    return this.collectionService.getWatchlist(+user.id, +page);
  }

  @Get('top-collection/')
  getTopCollection(
    @Query() sortRange: SaleHistoryQueryParams,
    @Query() sortBy: CollectionSortBy,
  ) {
    return this.collectionService.getTopCollection(sortRange, sortBy);
  }

  @Get('/:id')
  @ApiOkResponse({ description: 'Success' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  collectionDetailId(@Param('id') id: number) {
    return this.collectionService.findCollectionId(+id);
  }

  @ApiBearerAuth('jwt')
  @Get('details/:slug')
  @ApiOkResponse({ description: 'Success' })
  // @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  collectionDetailSlug(@Param('slug') slug: string, @Headers() headers: any) {
    const authorization = headers.authorization;
    const token = extractJwt(authorization);
    return this.collectionService.findCollectionSlug(slug, token);
  }

  @Get('slug/:name')
  @ApiOkResponse({ description: 'Success' })
  getSlug(@Param('name') name: string) {
    return this.collectionService.getSlug(name);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Post('watchlist/:collectionId')
  watch(@Request() req: any, @Param('collectionId') collectionId: number) {
    const { user } = req;
    return this.collectionService.watch(+user.id, collectionId);
  }

  @Get('status/:collectionId')
  @ApiOkResponse({ description: 'Success' })
  getVolume(@Param('collectionId') collectionId: number) {
    return this.collectionService.getCollectionStatus(collectionId);
  }

  @Get('sale-history/:collectionId')
  @ApiOkResponse({ description: 'Success' })
  getCollectionSaleHistory(
    @Param('collectionId') collectionId: number,
    @Query() sortBy: SaleHistoryQueryParams,
  ) {
    return this.collectionService.getCollectionSaleHistory(
      collectionId,
      sortBy,
    );
  }

  @Get('activities/:collectionId')
  @ApiOkResponse({ description: 'Success' })
  getCollectionActivities(
    @Param('collectionId') collectionId: number,
    @Query() param: CollectionActivitiesParams,
  ) {
    return this.collectionService.getCollectionActivities(collectionId, param);
  }

  @Post('import-queue')
  import(@Body() payload: ImportDto) {
    return this.collectionService.importQueue(payload);
  }

  @Get('import-queue/status/:jobId')
  getImportQueueStatus(@Param('jobId') jobId: number) {
    return this.collectionService.getJobStatus(jobId);
  }

  @Get('import-queue/delete/:jobId')
  deleteImportQueueJob(@Param('jobId') jobId: number) {
    return this.collectionService.deleteImportJob(jobId);
  }

  @Delete('imported-collection/:collectionId')
  deleteImportedCollection(@Param('collectionId') collectionId: number) {
    return this.collectionService.deleteImportedCollection(collectionId);
  }

  // TODO:
  // @Post('refresh-metadata-queue')
  // refreshMetadataQueue(@Body() payload: RefreshMetadataDto) {
  //   return this.collectionService.refreshMetadataQueue(payload);
  // }

  // @Post('sync-ownership-queue')
  // syncOwnershipQueue(@Body() payload: SyncOwnershipDto) {
  //   return this.collectionService.syncOwnershipQueue(payload);
  // }
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
