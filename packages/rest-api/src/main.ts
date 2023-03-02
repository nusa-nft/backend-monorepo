import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { BigIntInterceptor } from './interceptors/big-int.interceptor';
import { ScientificNumberInterceptor } from './interceptors/scientific-number.interceptor';
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import Bull from 'bull';
import dotenv from 'dotenv';
dotenv.config({ path: '../../../.env' });

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
  });
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalInterceptors(new BigIntInterceptor());
  app.useGlobalInterceptors(new ScientificNumberInterceptor());
  app.useStaticAssets(join(__dirname, '../', 'uploads'), {
    prefix: '/uploads/',
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  app.enableVersioning({
    defaultVersion: '1',
    type: VersioningType.URI,
  });

  const config = new DocumentBuilder()
    .setTitle('Tadpole Rest API')
    .setDescription('API for Tadpole NFT Marketplace')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document);

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/bull-board');
  const blockchainTxQueue = app.get<Bull.Queue>(`BullQueue_blockchain-tx`);
  const importCollectionQueue = app.get<Bull.Queue>(
    `BullQueue_import-collection`,
  );
  createBullBoard({
    queues: [
      new BullMQAdapter(blockchainTxQueue),
      new BullMQAdapter(importCollectionQueue),
    ],
    serverAdapter,
  });
  app.use('/bull-board', serverAdapter.getRouter());

  await app.listen(process.env.API_PORT ? process.env.API_PORT : 3000);
}
bootstrap();
