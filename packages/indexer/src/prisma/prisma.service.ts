import { INestApplication, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@nusa-nft/database';
import { NotificationMiddleware } from './middleware/notification';

@Injectable()
export class PrismaService extends PrismaClient {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: [{ emit: 'event', level: 'query' }] });
    this.$use(NotificationMiddleware());
  }
  async onModuleInit() {
    await this.$connect();
  }
  async enableShutdownHooks(app: INestApplication) {
    this.$on('beforeExit', async () => {
      await app.close();
    });
  }
}
