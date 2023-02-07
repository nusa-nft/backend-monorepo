import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import blocked from 'blocked';
import { Logger } from '@nestjs/common';
import { BigIntInterceptor } from './interceptors/big-int.interceptor';
import { ScientificNumberInterceptor } from './interceptors/scientific-number.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true
  });

  app.setGlobalPrefix('indexer/api');
  app.useGlobalInterceptors(new BigIntInterceptor());
  app.useGlobalInterceptors(new ScientificNumberInterceptor());

  const config = new DocumentBuilder()
    .setTitle('Nusa NFT Indexer Rest API')
    .setDescription('API for Nusa NFT Indexer')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document);

  blocked(function(ms) {
    Logger.error("Blocked");
  }, {threshold:5000, interval: 5000});

  await app.listen(process.env.INDEXER_PORT ? process.env.INDEXER_PORT : 3000);
}
bootstrap();
