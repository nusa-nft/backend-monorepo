import { Module } from '@nestjs/common';
import { IndexerModule } from 'src/indexer/indexer.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RoyaltyController } from './royalty.controller';
import { RoyaltyService } from './royalty.service';

@Module({
  imports: [IndexerModule, PrismaModule],
  controllers: [RoyaltyController],
  providers: [RoyaltyService],
})
export class RoyaltyModule {}
