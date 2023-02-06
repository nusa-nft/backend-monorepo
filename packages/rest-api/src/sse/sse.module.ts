import { Module } from '@nestjs/common';
import { SseService } from './sse.service';
import { SseController } from './sse.controller';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';
import { IndexerModule } from 'src/indexer/indexer.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ConfigModule,
    IndexerModule,
    PrismaModule,
    UsersModule,
  ],
  controllers: [SseController],
  providers: [SseService],
})
export class SseModule {}
