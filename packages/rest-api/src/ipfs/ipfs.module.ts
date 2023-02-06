import { Module } from '@nestjs/common';
import { IpfsService } from './ipfs.service';
import { PrismaModule } from '../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [PrismaModule, HttpModule],
  providers: [IpfsService],
  exports: [IpfsService],
})
export class IpfsModule {}
