import { forwardRef, Module } from '@nestjs/common';
import { ItemService } from './item.service';
import { ItemController } from './item.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { IpfsModule } from '../ipfs/ipfs.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { IndexerModule } from 'src/indexer/indexer.module';
import { UsersModule } from 'src/users/users.module';
import { CollectionModule } from 'src/collection/collection.module';
import { ItemControllerV2 } from './item.controller.v2';
import { ItemServiceV2 } from './item.service.v2';

@Module({
  imports: [
    ConfigModule.forRoot(),
    PrismaModule,
    IpfsModule,
    JwtModule.register({ secret: process.env.JWT_SECRET_KEY }),
    IndexerModule,
    UsersModule,
    forwardRef(() => CollectionModule),
  ],
  providers: [ItemService, ItemServiceV2],
  exports: [ItemService, ItemServiceV2],
  controllers: [ItemController, ItemControllerV2],
})
export class ItemModule {}
