import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { Erc1155Controller } from './erc1155.controller';
import { Erc1155Service } from './erc1155.service';

@Module({
  imports: [PrismaModule],
  controllers: [Erc1155Controller],
  providers: [Erc1155Service],
  exports: [Erc1155Service]
})
export class Erc1155Module {}
