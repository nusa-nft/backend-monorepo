import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [NotificationService],
})
export class NotificationModule {}
