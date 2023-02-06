import { Module } from '@nestjs/common';
import { VoucherService } from './voucher.service';
import { VoucherController } from './voucher.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'blockchain-tx',
      limiter: { max: 10, duration: 10000 }
    }),
  ],
  controllers: [VoucherController],
  providers: [VoucherService],
})
export class VoucherModule {}
