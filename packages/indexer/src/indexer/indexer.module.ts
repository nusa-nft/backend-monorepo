import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { IndexerService } from './indexer.service';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [PrismaModule, ConfigModule, EventEmitterModule.forRoot()],
  controllers: [],
  providers: [IndexerService],
})
export class IndexerModule {}
