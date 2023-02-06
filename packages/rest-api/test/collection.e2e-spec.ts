import { Test } from '@nestjs/testing';
import { ethers } from 'ethers';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { CollectionModule } from '../src/collection/collection.module';
import { AuthModule } from '../src/auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { slugify } from '../src/lib/slugify';

describe('CollectionController', () => {
  let app: INestApplication;
  let configService: ConfigService;
  let provider;
  let wallet;
  let jwt;
  const testDataIds = []; // To Delete After tests are finished
  let createdCollectionId: number;

  // For Royalties
  let walletAddress, walletAddress2, walletAddress3;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CollectionModule, AuthModule, ConfigModule.forRoot()],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    configService = moduleRef.get<ConfigService>(ConfigService);
    await app.init();

    provider = new ethers.providers.JsonRpcProvider(
      configService.get<string>('RPC_URL'),
    );

    // Signing wallet for login
    wallet = new ethers.Wallet(
      configService.get<string>('TEST_WALLET_PRIVATE_KEY') as string,
    );

    // For Royalties
    walletAddress = configService.get<string>('TEST_WALLET_ADDRESS') as string;
    walletAddress2 = configService.get<string>(
      'TEST_WALLET_ADDRESS_2',
    ) as string;
    walletAddress3 = configService.get<string>(
      'TEST_WALLET_ADDRESS_3',
    ) as string;

    const date = new Date().toUTCString();
    const CONNECT_WALLET_MSG = `I want to login at ${date}`;
    const signature = await wallet.signMessage(CONNECT_WALLET_MSG);
    provider.getSigner();
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        walletAddress: walletAddress,
        signature: signature,
        message: CONNECT_WALLET_MSG,
      })
      .expect(201);
    const resp = loginResponse.body;
    jwt = resp.jwt;
  });

  describe('create', () => {
    it('should create a new collection', async () => {
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
      const walletAddress2 = configService.get<string>(
        'TEST_WALLET_ADDRESS_2',
      ) as string;
      const walletAddress3 = configService.get<string>(
        'TEST_WALLET_ADDRESS_3',
      ) as string;

      const royaltyData = JSON.stringify([
        {
          wallet_address: walletAddress,
          percentage: 0.05,
        },
        {
          wallet_address: walletAddress2,
          percentage: 0.04,
        },
        {
          wallet_address: walletAddress3,
          percentage: 0.01,
        },
      ]);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: walletAddress,
          signature: signature,
          message: CONNECT_WALLET_MSG,
        })
        .expect(201);
      const { jwt } = loginResponse.body;

      const resp = await request(app.getHttpServer())
        .post('/collection/create')
        .set('Authorization', 'Bearer ' + jwt)
        .field('royalty', royaltyData)
        .field('logo_image', 'some image')
        .field('name', 'some image')
        .field('description', 'some image')
        .field('contract_address', 'some image')
        .field('creator_address', walletAddress)
        .field('category_id', '1')
        .field('blockchain', '137')
        .expect(201);

      createdCollectionId = resp.body.data.id;
    });
  });

  describe('create: percentage to high', () => {
    it('should return 400 Bad Request', async () => {
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
      const walletAddress2 = configService.get<string>(
        'TEST_WALLET_ADDRESS_2',
      ) as string;
      const walletAddress3 = configService.get<string>(
        'TEST_WALLET_ADDRESS_3',
      ) as string;

      const royaltyData = JSON.stringify([
        {
          wallet_address: walletAddress,
          percentage: 0.05,
        },
        {
          wallet_address: walletAddress2,
          percentage: 0.04,
        },
        {
          wallet_address: walletAddress3,
          percentage: 0.04,
        },
      ]);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: walletAddress,
          signature: signature,
          message: CONNECT_WALLET_MSG,
        })
        .expect(201);
      const { jwt } = loginResponse.body;

      await request(app.getHttpServer())
        .post('/collection/create')
        .set('Authorization', 'Bearer ' + jwt)
        .field('royalty', royaltyData)
        .field('logo_image', 'some image')
        .field('name', 'some image')
        .field('description', 'some image')
        .field('contract_address', 'some image')
        .field('creator_address', walletAddress)
        .field('category_id', '1')
        .field('blockchain', '137')
        .expect(400);
    });
  });

  describe('update', () => {
    it('should change collection detail', async () => {
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
      const walletAddress2 = configService.get<string>(
        'TEST_WALLET_ADDRESS_2',
      ) as string;
      const walletAddress3 = configService.get<string>(
        'TEST_WALLET_ADDRESS_3',
      ) as string;

      const royaltyData = JSON.stringify([
        {
          wallet_address: walletAddress,
          percentage: 0.05,
        },
        {
          wallet_address: walletAddress2,
          percentage: 0.03,
        },
        {
          wallet_address: walletAddress3,
          percentage: 0.02,
        },
      ]);

      provider.getSigner();
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: walletAddress,
          signature: signature,
          message: CONNECT_WALLET_MSG,
        })
        .expect(201);
      const { jwt } = loginResponse.body;
      const searchResponse = await request(app.getHttpServer())
        .get('/collection')
        .set('Authorization', 'Bearer ' + jwt)
        .query({
          page: '1',
        })
        .expect(200);
      console.log({ searchResponse });

      await request(app.getHttpServer())
        .patch('/collection/update/' + createdCollectionId)
        .set('Authorization', 'Bearer ' + jwt)
        .field('royalty', royaltyData)
        .field('logo_image', 'some image')
        .field('name', 'some image')
        .field('description', 'some image')
        .field('contract_address', 'some image')
        .field('creator_address', walletAddress)
        .field('category_id', '1')
        .field('blockchain', '137')
        .expect(200);
    });
  });

  describe('update: percentage over 0.1', () => {
    it('should return 400 Bad Request', async () => {
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
      const walletAddress2 = configService.get<string>(
        'TEST_WALLET_ADDRESS_2',
      ) as string;
      const walletAddress3 = configService.get<string>(
        'TEST_WALLET_ADDRESS_3',
      ) as string;

      const royaltyData = JSON.stringify([
        {
          wallet_address: walletAddress,
          percentage: 0.05,
        },
        {
          wallet_address: walletAddress2,
          percentage: 0.04,
        },
        {
          wallet_address: walletAddress3,
          percentage: 0.04,
        },
      ]);

      provider.getSigner();
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: walletAddress,
          signature: signature,
          message: CONNECT_WALLET_MSG,
        })
        .expect(201);
      const { jwt } = loginResponse.body;

      const searchResponse = await request(app.getHttpServer())
        .get('/collection')
        .set('Authorization', 'Bearer ' + jwt)
        .query({
          page: '1',
        })
        .expect(200);
      console.log({ searchResponse });

      await request(app.getHttpServer())
        .patch('/collection/update/' + createdCollectionId)
        .set('Authorization', 'Bearer ' + jwt)
        .field('royalty', royaltyData)
        .field('logo_image', 'some image')
        .field('name', 'some image')
        .field('description', 'some image')
        .field('contract_address', 'some image')
        .field('creator_address', walletAddress)
        .field('category_id', '1')
        .field('blockchain', '137')
        .expect(400);
    });
  });

  describe('search', () => {
    it('should return pagination metadata', async () => {
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
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: walletAddress,
          signature: signature,
          message: CONNECT_WALLET_MSG,
        })
        .expect(201);
      const { jwt } = loginResponse.body;

      await request(app.getHttpServer())
        .get('/collection')
        .set('Authorization', 'Bearer ' + jwt)
        .query({
          collection_name: 'lizard',
          page: '1',
        })
        .expect(200);
    });
  });

  describe('collection details', () => {
    it('should return collection details', async () => {
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
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: walletAddress,
          signature: signature,
          message: CONNECT_WALLET_MSG,
        })
        .expect(201);
      const { jwt } = loginResponse.body;

      const searchResponse = await request(app.getHttpServer())
        .get('/collection')
        .set('Authorization', 'Bearer ' + jwt)
        .query({
          page: '1',
        })
        .expect(200);
      console.log({ searchResponse });

      await request(app.getHttpServer())
        .get('/collection/details/' + createdCollectionId)
        .set('Authorization', 'Bearer ' + jwt)
        .expect(200);
    });
  });

  describe('delete', () => {
    it('should softdelete collection', async () => {
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
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: walletAddress,
          signature: signature,
          message: CONNECT_WALLET_MSG,
        })
        .expect(201);
      const { jwt } = loginResponse.body;

      const searchResponse = await request(app.getHttpServer())
        .get('/collection')
        .set('Authorization', 'Bearer ' + jwt)
        .query({
          page: '1',
        })
        .expect(200);
      console.log({ searchResponse });

      await request(app.getHttpServer())
        .patch('/collection/delete/' + createdCollectionId)
        .set('Authorization', 'Bearer ' + jwt)
        .expect(200);
    });
  });

  describe('delete: id not found', () => {
    it('should return 400 Bad Request', async () => {
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
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: walletAddress,
          signature: signature,
          message: CONNECT_WALLET_MSG,
        })
        .expect(201);
      const { jwt } = loginResponse.body;

      const searchResponse = await request(app.getHttpServer())
        .get('/collection')
        .set('Authorization', 'Bearer ' + jwt)
        .query({
          page: '1',
        })
        .expect(200);
      const invalidId = searchResponse.body.metadata.totalCount + 1;

      await request(app.getHttpServer())
        .patch('/collection/delete/' + invalidId)
        .set('Authorization', 'Bearer ' + jwt)
        .expect(400);
    });
  });

  describe('unique slugs for same collection names', () => {
    it('should slugify', async () => {
      const royaltyData = JSON.stringify([
        {
          wallet_address: walletAddress,
          percentage: 0.05,
        },
        {
          wallet_address: walletAddress2,
          percentage: 0.04,
        },
        {
          wallet_address: walletAddress3,
          percentage: 0.01,
        },
      ]);

      const name = 'Bagus';

      await request(app.getHttpServer())
        .post('/collection/create')
        .set('Authorization', 'Bearer ' + jwt)
        .field('royalty', royaltyData)
        .field('logo_image', 'some image')
        .field('name', 'Bagus')
        .field('description', 'some image')
        .field('contract_address', 'some image')
        .field('creator_address', walletAddress)
        .field('category_id', '1')
        .field('blockchain', '137')
        .expect(201);

      const resp = await request(app.getHttpServer())
        .get('/collection')
        .set('Authorization', 'Bearer ' + jwt)
        .query({
          collection_name: 'Bagus',
          page: '1',
        })
        .expect(200);

      const createdItem = resp.body.records[0];
      testDataIds.push(createdItem.id);

      expect(createdItem.slug).toBe(slugify(name));
    });

    it('should slugify + index for duplicate name', async () => {
      const royaltyData = JSON.stringify([
        {
          wallet_address: walletAddress,
          percentage: 0.05,
        },
        {
          wallet_address: walletAddress2,
          percentage: 0.04,
        },
        {
          wallet_address: walletAddress3,
          percentage: 0.01,
        },
      ]);

      const name = 'Bagus';

      await request(app.getHttpServer())
        .post('/collection/create')
        .set('Authorization', 'Bearer ' + jwt)
        .field('royalty', royaltyData)
        .field('logo_image', 'some image')
        .field('name', 'Bagus')
        .field('description', 'some image')
        .field('contract_address', 'some image')
        .field('creator_address', walletAddress)
        .field('category_id', '1')
        .field('blockchain', '137')
        .expect(201);

      const resp = await request(app.getHttpServer())
        .get('/collection')
        .set('Authorization', 'Bearer ' + jwt)
        .query({
          collection_name: 'Bagus',
          page: '1',
        })
        .expect(200);

      const createdItem = resp.body.records[0];
      testDataIds.push(createdItem.id);

      expect(createdItem.slug).toBe(slugify(name) + '-1');
    });

    it('should slugify + index for duplicate name', async () => {
      const royaltyData = JSON.stringify([
        {
          wallet_address: walletAddress,
          percentage: 0.05,
        },
        {
          wallet_address: walletAddress2,
          percentage: 0.04,
        },
        {
          wallet_address: walletAddress3,
          percentage: 0.01,
        },
      ]);

      const name = 'Bagus';

      await request(app.getHttpServer())
        .post('/collection/create')
        .set('Authorization', 'Bearer ' + jwt)
        .field('royalty', royaltyData)
        .field('logo_image', 'some image')
        .field('name', 'Bagus')
        .field('description', 'some image')
        .field('contract_address', 'some image')
        .field('creator_address', walletAddress)
        .field('category_id', '1')
        .field('blockchain', '137')
        .expect(201);

      const resp = await request(app.getHttpServer())
        .get('/collection')
        .set('Authorization', 'Bearer ' + jwt)
        .query({
          collection_name: 'Bagus',
          page: '1',
        })
        .expect(200);

      const createdItem = resp.body.records[0];
      testDataIds.push(createdItem.id);

      expect(createdItem.slug).toBe(slugify(name) + '-2');
    });
  });

  it('Should generate slug', async () => {
    const name = 'Bagus';
    const resp = await request(app.getHttpServer())
      .get('/collection/slug/' + name)
      .expect(200);

    const slug = resp.body.slug;

    expect(slug).toBe(slugify(name) + '-3');
  });

  afterAll(async () => {
    for (const id of testDataIds) {
      await request(app.getHttpServer())
        .patch('/collection/delete/' + id)
        .set('Authorization', 'Bearer ' + jwt);
    }
    await app.close();
  });
});
