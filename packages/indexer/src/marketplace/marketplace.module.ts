import { Module } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { Erc1155Module } from 'src/erc1155/erc1155.module';

@Module({
  imports: [PrismaModule, Erc1155Module],
  providers: [MarketplaceService],
  controllers: [MarketplaceController]
})
export class MarketplaceModule {}
