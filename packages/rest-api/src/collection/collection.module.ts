import { forwardRef, Module } from '@nestjs/common';
import { CollectionService } from './collection.service';
import { CollectionController } from './collection.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { IndexerModule } from 'src/indexer/indexer.module';
import { JwtModule } from '@nestjs/jwt';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ItemModule } from 'src/item/item.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    PrismaModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', ''),
      renderPath: '/uploads',
    }),
    JwtModule.register({ secret: process.env.JWT_SECRET_KEY }),
    BullModule.registerQueue({
      name: 'import-collection',
    }),
    IndexerModule,
    forwardRef(() => ItemModule),
  ],
  providers: [CollectionService],
  exports: [CollectionService],
  controllers: [CollectionController],
})
export class CollectionModule {}
