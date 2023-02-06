import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ethers } from 'ethers';
import { AuthModule } from '../src/auth/auth.module';
import { ItemModule } from '../src/item/item.module';
import { CollectionModule } from '../src/collection/collection.module';
import * as request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';

jest.setTimeout(20000);

// Returns JWT
const login = async (
  app: INestApplication,
  provider: ethers.providers.JsonRpcProvider,
  wallet: ethers.Wallet,
): Promise<string> => {
  const date = new Date().toUTCString();
  const CONNECT_WALLET_MSG = `I want to login at ${date}`;
  const signature = await wallet.signMessage(CONNECT_WALLET_MSG);
  const loginResponse = await request(app.getHttpServer())
    .post('/auth/login')
    .send({
      walletAddress: wallet.address,
      signature: signature,
      message: CONNECT_WALLET_MSG,
    });
  const resp = loginResponse.body;
  return resp.jwt;
};

describe('ItemController', () => {
  let app: INestApplication;
  let configService: ConfigService;
  let prismaService: PrismaService;
  let jwt: string;
  const testDataIds = []; // To Delete after tests are finished
  let collectionId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        CollectionModule,
        ItemModule,
        AuthModule,
        PrismaModule,
        ConfigModule.forRoot(),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    configService = moduleRef.get<ConfigService>(ConfigService);
    prismaService = moduleRef.get<PrismaService>(PrismaService);
    await app.init();

    // Login
    const provider = new ethers.providers.JsonRpcProvider(
      configService.get<string>('RPC_URL'),
    );
    // Signing wallet for login
    const wallet = new ethers.Wallet(
      configService.get<string>('TEST_WALLET_PRIVATE_KEY') as string,
    );
    jwt = await login(app, provider, wallet);

    const royaltyData = JSON.stringify([
      {
        wallet_address: wallet.address,
        percentage: 0.05,
      },
    ]);
    // Create Collection
    const resp = await request(app.getHttpServer())
      .post('/collection/create')
      .set('Authorization', 'Bearer ' + jwt)
      .field('royalty', royaltyData)
      .field('logo_image', 'some image')
      .field('name', 'some image')
      .field('description', 'some image')
      .field('contract_address', 'some image')
      .field('creator_address', wallet.address)
      .field('category_id', '1')
      .field('blockchain', '137')
      .expect(201);

    collectionId = resp.body.data.id;
  });

  it('Create Item', async () => {
    const name = 'item name';
    const description = 'item description';
    const external_link = 'external-link.com';
    const collection_id = collectionId;
    const image = 'test/test-image.jpg';
    const supply = 1;
    const unlockable = false;
    const explicit_sensitive = false;
    const is_metadata_freeze = false;
    const attributes = [
      {
        trait_type: 'eyes',
        nusa_attribute_type: 'PROPERTIES',
        value: 'blue',
      },
    ];
    const blockchain = '137';
    const is_minted = false;

    const resp = await request(app.getHttpServer())
      .post('/item')
      .set('Authorization', 'Bearer ' + jwt)
      .set('Content-Type', 'multipart/form-data')
      .field('name', name)
      .field('description', description)
      .field('external_link', external_link)
      .field('collection_id', collection_id)
      .attach('image', image)
      .field('supply', supply)
      .field('unlockable', unlockable)
      .field('explicit_sensitive', explicit_sensitive)
      .field('is_metadata_freeze', is_metadata_freeze)
      .field('attributes', JSON.stringify(attributes))
      .field('chainId', blockchain)
      .field('is_minted', is_minted)
      .expect(201);

    const created = resp.body.data;
    testDataIds.push(created.id);

    expect(created.name).toEqual(name);
    expect(created.description).toEqual(description);
    expect(created.external_link).toEqual(external_link);
    expect(created.collection_id).toEqual(collection_id);
    expect(created.supply).toEqual(supply);
    expect(created.unlockable).toEqual(unlockable);
    expect(created.explicit_sensitive).toEqual(explicit_sensitive);
    expect(created.is_metadata_freeze).toEqual(is_metadata_freeze);
    expect(created.attributes[0].nusa_attribute_type).toEqual(
      attributes[0].nusa_attribute_type,
    );
    expect(created.attributes[0].trait_type).toEqual(attributes[0].trait_type);
    expect(created.attributes[0].value).toEqual(attributes[0].value);
    expect(created.chainId).toEqual(Number(blockchain));
    expect(created.is_minted).toEqual(is_minted);
  });

  it('Set item to is_minted status to true', async () => {
    const resp = await request(app.getHttpServer())
      .patch('/item/set-minted/' + testDataIds[0])
      .set('Authorization', 'Bearer ' + jwt)
      .send({
        tokenId: 1,
      })
      .expect(200);

    const updated = resp.body.data;
    expect(updated.is_minted).toBe(true);
  });

  afterAll(async () => {
    await prismaService.item.deleteMany({ where: { id: { in: testDataIds } } });
    await request(app.getHttpServer())
      .patch('/collection/delete/' + collectionId)
      .set('Authorization', 'Bearer ' + jwt);
    await app.close();
  });
});
