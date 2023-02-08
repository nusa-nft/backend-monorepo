import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppClusterService } from './app-cluster.service';
import * as dotenv from "dotenv";
dotenv.config({ path: '../../../.env'});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.WORKER_PORT ? process.env.WORKER_PORT : 3000);
}

if (process.env.NODE_ENV) {
  AppClusterService.clusterize(bootstrap);
} else {
  bootstrap();
}
