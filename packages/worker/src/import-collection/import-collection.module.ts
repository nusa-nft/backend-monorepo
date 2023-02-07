import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ImportCollectionService } from './import-collection.service';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'import-collection',
    }),
  ],
  providers: [
    ImportCollectionService,
  ]
})
export class ImportCollectionModule {}
