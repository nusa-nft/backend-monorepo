import { Test } from '@nestjs/testing';
import { ethers } from 'ethers';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';

describe('AuthController', () => {
  let app: INestApplication;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, ConfigModule.forRoot()],
    }).compile();

    app = moduleRef.createNestApplication();
    configService = moduleRef.get<ConfigService>(ConfigService);
    await app.init();
  });

  describe('validate', () => {
    it('should return a jwt token', async () => {
      const provider = new ethers.providers.JsonRpcProvider(
        configService.get<string>('RPC_URL'),
      );

      const wallet = new ethers.Wallet(
        configService.get<string>('TEST_WALLET_PRIVATE_KEY') as string,
      );

      const date = new Date().toUTCString();
      const CONNECT_WALLET_MSG = `I want to login at ${date}`;
      const signature = await wallet.signMessage(CONNECT_WALLET_MSG);
      const walletAddress = configService.get<string>(
        'TEST_WALLET_ADDRESS',
      ) as string;
      provider.getSigner();
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: walletAddress,
          signature: signature,
          message: CONNECT_WALLET_MSG,
        })
        .expect(201);
    });
    afterAll(async () => {
      await app.close();
    });
  });

  describe('validate: invalid request address', () => {
    it('should return 401 Bad Request', async () => {
      const provider = new ethers.providers.JsonRpcProvider(
        configService.get<string>('RPC_URL'),
      );

      const wallet = new ethers.Wallet(
        configService.get<string>('TEST_WALLET_PRIVATE_KEY') as string,
      );

      const date = new Date().toUTCString();
      const CONNECT_WALLET_MSG = `I want to login at ${date}`;
      const signature = await wallet.signMessage(CONNECT_WALLET_MSG);
      const walletAddress = 'WrongAddressUser';
      provider.getSigner();
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: walletAddress,
          signature: signature,
          message: CONNECT_WALLET_MSG,
        })
        .expect(401);
    });
    afterAll(async () => {
      await app.close();
    });
  });

  describe('validate: expired request', () => {
    it('should return 401 Bad Request', async () => {
      const provider = new ethers.providers.JsonRpcProvider(
        configService.get<string>('RPC_URL'),
      );

      const wallet = new ethers.Wallet(
        configService.get<string>('TEST_WALLET_PRIVATE_KEY') as string,
      );

      const date = Date.now() - 60001;
      const expiredDate = new Date(date).toUTCString();
      const CONNECT_WALLET_MSG = `I want to login at ${expiredDate}`;
      const signature = await wallet.signMessage(CONNECT_WALLET_MSG);
      const walletAddress = configService.get<string>(
        'TEST_WALLET_ADDRESS',
      ) as string;
      provider.getSigner();
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: walletAddress,
          signature: signature,
          message: CONNECT_WALLET_MSG,
        })
        .expect(401);
    });
    afterAll(async () => {
      await app.close();
    });
  });

  describe('profile', () => {
    it("should return user's profile", async () => {
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
          console.log(jwt);
          const res = await request(app.getHttpServer())
            .get('/auth/profile')
            .set('Authorization', 'Bearer ' + jwt);

          const user = res.body;
          expect(user.wallet_address).toBe(wallet.address);
        });
    });
    afterAll(async () => {
      await app.close();
    });
  });
});
