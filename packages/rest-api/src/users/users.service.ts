import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  private logger = new Logger(UsersService.name);
  async create(createUserDto: CreateUserDto) {
    try {
      const wallet = await this.prisma.user.findFirst({
        where: {
          wallet_address: {
            equals: createUserDto.wallet_address,
            mode: 'insensitive',
          },
        },
      });
      if (wallet) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Wallet Already Used',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      const user = await this.prisma.user.create({
        data: {
          email: createUserDto.email,
          twitter_link: createUserDto.twitter_link,
          instagram_link: createUserDto.instagram_link,
          website_link: createUserDto.website_link,
          username: createUserDto.username,
          wallet_address: createUserDto.wallet_address,
          first_name: createUserDto.first_name,
          last_name: createUserDto.last_name,
          profile_picture: createUserDto.profile_picture,
          cover_picture: createUserDto.cover_picture,
        },
      });

      return user;
    } catch (e) {
      this.logger.log(e.message);
      throw e;
    }
  }

  findOne(id: number) {
    return this.prisma.user.findFirst({
      where: {
        id,
      },
    });
  }

  async findUserOne(username: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        username: username,
      },
    });
    if (!user) {
      throw new HttpException(
        {
          status: HttpStatus.OK,
          error: 'Username Available',
        },
        HttpStatus.OK,
      );
    }
    throw new HttpException(
      {
        status: HttpStatus.BAD_REQUEST,
        error: 'Username Already Used',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  findWalletOne(wallet_address: string) {
    return this.prisma.user.findFirst({
      where: {
        wallet_address: {
          equals: wallet_address,
          mode: 'insensitive',
        },
      },
    });
  }

  async update(userId: number, updateUserDto: UpdateUserDto) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'User not found',
          },
          HttpStatus.BAD_REQUEST,
        );
        return;
      }
      const records = await this.prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          username: updateUserDto.username,
          email: updateUserDto.email,
          twitter_link: updateUserDto.twitter_link,
          instagram_link: updateUserDto.instagram_link,
          website_link: updateUserDto.website_link,
          first_name: updateUserDto.first_name,
          last_name: updateUserDto.last_name,
          profile_picture: updateUserDto.profile_picture,
          description: updateUserDto.description,
          cover_picture: updateUserDto.cover_picture,
        },
      });
      return {
        status: HttpStatus.OK,
        message: 'User has been updated',
        records,
      };
    } catch (e) {
      this.logger.log(e.message);
      throw e;
    }
  }

  remove(id: number, userId: number) {
    if (id != userId) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Unauthorized',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    this.prisma.user.delete({
      where: {
        id,
      },
    });
    return {
      status: HttpStatus.OK,
      message: 'User has been deleted',
    };
  }
}
