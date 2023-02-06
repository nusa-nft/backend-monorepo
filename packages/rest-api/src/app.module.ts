import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CollectionModule } from './collection/collection.module';
import { CategoryModule } from './category/category.module';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { IpfsModule } from './ipfs/ipfs.module';
import { ItemModule } from './item/item.module';
import { HttpModule } from '@nestjs/axios';
import { IndexerModule } from './indexer/indexer.module';
import { RoyaltyModule } from './royalty/royalty.module';
import { SseModule } from './sse/sse.module';
import { NotificationModule } from './notification/notification.module';
import { SearchModule } from './search/search.module';
import { VoucherModule } from './voucher/voucher.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    AuthModule,
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
      }
    }),
    PrismaModule,
    CollectionModule,
    CategoryModule,
    UsersModule,
    IpfsModule,
    ItemModule,
    HttpModule,
    IndexerModule,
    RoyaltyModule,
    SseModule,
    NotificationModule,
    SearchModule,
    VoucherModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
