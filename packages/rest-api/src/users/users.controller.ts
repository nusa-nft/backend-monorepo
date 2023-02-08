import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  UseInterceptors,
  UnsupportedMediaTypeException,
  UploadedFiles,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';

const maxFileSize = 5 * 1000 * 1000;
@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @ApiOkResponse({ description: 'Username Available' })
  @ApiBadRequestResponse({ description: 'Username Already Used' })
  @Get('check/:username')
  findUserOne(@Param('username') username: string) {
    return this.usersService.findUserOne(username);
  }

  @Get('wallet/:wallet_address')
  findWalletOne(@Param('wallet_address') wallet_address: string) {
    return this.usersService.findWalletOne(wallet_address);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'User has been Updated' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'profile_picture', maxCount: 1 },
        { name: 'cover_picture', maxCount: 1 },
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
  @Patch('update-profile')
  update(
    @UploadedFiles()
    files: {
      profile_picture?: Express.Multer.File;
      cover_picture?: Express.Multer.File;
    },
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: any,
  ) {
    if (files) {
      if (files.profile_picture) {
        updateUserDto.profile_picture = files.profile_picture[0].filename;
      }
      if (files.cover_picture) {
        updateUserDto.cover_picture = files.cover_picture[0].filename;
      }
    }
    const { user } = req;
    return this.usersService.update(user.id, updateUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'User has been deleted' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    const { user } = req;
    return this.usersService.remove(+id, user.id);
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
