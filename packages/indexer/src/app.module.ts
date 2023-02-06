import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IndexerModule } from './indexer/indexer.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { Erc1155Module } from './erc1155/erc1155.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RoyaltyModule } from './royalty/royalty.module';

@Module({
  imports: [
    IndexerModule,
    PrismaModule,
    ConfigModule.forRoot(),
    EventEmitterModule.forRoot(),
    Erc1155Module,
    MarketplaceModule,
    RoyaltyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
