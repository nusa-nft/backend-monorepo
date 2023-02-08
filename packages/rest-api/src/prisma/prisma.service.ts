import { INestApplication, Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@nusa-nft/database';
import { SoftDeleteMiddleware } from './middleware/softdelete';
import { NotificationMiddleware } from './middleware/notification';

@Injectable()
export class PrismaService extends PrismaClient {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: [{ emit: 'event', level: 'query' }] });
    this.logger.log(`Prisma v${Prisma.prismaVersion.client}`);
    this.$use(SoftDeleteMiddleware());
    this.$use(NotificationMiddleware());
  }
  async enableShutdownHooks(app: INestApplication) {
    this.$on('beforeExit', async () => {
      await app.close();
    });
  }
}
