import { Test } from '@nestjs/testing';
import { ethers } from 'ethers';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { UsersModule } from '../src/users/users.module';
import { AuthModule } from '../src/auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';

describe('AuthController', () => {
  let app: INestApplication;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, UsersModule, ConfigModule.forRoot()],
    }).compile();

    app = moduleRef.createNestApplication();
    configService = moduleRef.get<ConfigService>(ConfigService);
    await app.init();
  });

  describe('profile', () => {
    it('should update user data', async () => {
      const provider = new ethers.providers.JsonRpcProvider(
        configService.get<string>('RPC_URL'),
      );

      const wallet = new ethers.Wallet(
        configService.get<string>('TEST_WALLET_PRIVATE_KEY') as string,
        provider,
      );

      const date = new Date().toUTCString();
      const CONNECT_WALLET_MSG = `I want to login at ${date}`;
      const signature = await wallet.signMessage(CONNECT_WALLET_MSG);
      const walletAddress = configService.get<string>(
        'TEST_WALLET_ADDRESS',
      ) as string;

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: walletAddress,
          signature: signature,
          message: CONNECT_WALLET_MSG,
        })
        .then(async (resp) => {
          const { jwt } = resp.body;

          await request(app.getHttpServer())
            .patch('/users/1')
            .set('Authorization', 'Bearer ' + jwt);

          expect(201);
        });
    });
    afterAll(async () => {
      await app.close();
    });
  });

  describe('profile', () => {
    it('should return unauthorized', async () => {
      const provider = new ethers.providers.JsonRpcProvider(
        configService.get<string>('RPC_URL'),
      );

      const wallet = new ethers.Wallet(
        configService.get<string>('TEST_WALLET_PRIVATE_KEY') as string,
        provider,
      );

      const date = new Date().toUTCString();
      const CONNECT_WALLET_MSG = `I want to login at ${date}`;
      const signature = await wallet.signMessage(CONNECT_WALLET_MSG);
      const walletAddress = configService.get<string>(
        'TEST_WALLET_ADDRESS',
      ) as string;

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: walletAddress,
          signature: signature,
          message: CONNECT_WALLET_MSG,
        })
        .then(async (resp) => {
          const { jwt } = resp.body;

          await request(app.getHttpServer())
            .patch('/users/2')
            .set('Authorization', 'Bearer ' + jwt);

          expect(400);
        });
    });
    afterAll(async () => {
      await app.close();
    });
  });
});
