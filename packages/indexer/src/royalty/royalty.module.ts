import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RoyaltyController } from './royalty.controller';
import { RoyaltyService } from './royalty.service';

@Module({
  imports: [PrismaModule],
  controllers: [RoyaltyController],
  providers: [RoyaltyService],
  exports: [RoyaltyService],
})
export class RoyaltyModule {}
