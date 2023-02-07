import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ImportCollectionModule } from './import-collection/import-collection.module';
import { PrismaModule } from './prisma/prisma.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    ImportCollectionModule,
    PrismaModule,
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
