import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import Ganache from "ganache";
import { PrismaClient } from '@nusa-nft/database';
import { exec, spawn } from "child_process";
import { AppModule as IndexerAppModule } from "@nusa-nft/indexer/src/app.module";
import { AppModule as RestApiAppModule } from "@nusa-nft/rest-api/src/app.module";
import { AppModule as WorkerAppModule } from '@nusa-nft/worker/src/app.module';

export async function setupDatabase() {
  // FIXME: script should read .env.test instead of .env
  // currently have not found a way to do this yet
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  // Create new connection and return handle for checking the db contents
  const prisma = new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_URL}
    }
  });
  // Apply migration and reset DB
  await runMigrationAndResetDB();
  // Seed DB
  await seedData(prisma);

  return prisma;
}

async function runMigrationAndResetDB() {
  console.log("Running Migration")
  await new Promise(resolve => {
    exec(`cd ${__dirname}/../../../database && npx prisma migrate deploy && npx prisma migrate reset --force --skip-seed`, async (error, stdout, stderr) => {
      if (error) {
        throw error;
      }
      console.log(`stdout: ${stdout}`);
      // await new Promise(resolve => setTimeout(resolve, 5000));
      resolve(true);
    })
  });
}

async function seedData(db: PrismaClient) {
  console.log("Seeding Database");
  // Seed Categories
  await db.category.createMany({
    data: [
      { name: 'Photography' },
      { name: 'Sports' },
      { name: 'Music' },
      { name: 'Collectibles' },
      { name: 'Trading Cards' },
      { name: 'Art' },
    ]
  })
}

export function setupBlockchain() {
  const blockchain = Ganache.server({
    deterministic: true,
    quiet: true,
  });
  blockchain.listen(8545);
  return blockchain;
}

export async function setupIndexer() {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [IndexerAppModule],
  }).compile();
  const indexer: INestApplication = moduleFixture.createNestApplication({ logger: ['error'] });

  return indexer;
}

export async function setupRestApi() {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [RestApiAppModule],
  }).compile();
  const restApi: INestApplication = moduleFixture.createNestApplication({ logger: ['error'] });

  return restApi;
}

export async function setupWorker() {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [WorkerAppModule],
  }).compile();
  const worker: INestApplication = moduleFixture.createNestApplication({ logger: ['log', 'error', 'debug', 'warn'] });

  return worker;
}

export async function setupIpfs() {
  const proc = spawn("ipfs", ["daemon"], {detached: true});
  // Wait until ipfs runs
  console.log("starting IPFS..")
  await new Promise(resolve => setTimeout(resolve, 15000))
  return proc;
}