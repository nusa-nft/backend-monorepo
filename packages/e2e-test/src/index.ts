import request from 'supertest';
import {
  setupBlockchain,
  setupDatabase,
  setupIndexer,
  setupIpfs,
  setupRestApi
} from "./lib/setup-services";
import { deployContracts } from './lib/setup-smart-contracts';
import { ethers } from "ethers";
import { Server } from 'ganache';
import { INestApplication } from '@nestjs/common';
import { ChildProcess } from 'child_process'

let ipfsProcess: ChildProcess;

function testAccounts(blockchain: Server<"ethereum">) {
  const provider = blockchain.provider;
  const accounts = provider.getInitialAccounts();
  const web3Provider = new ethers.providers.Web3Provider(provider);

  const wallets: ethers.Wallet[] = [];
  for (const address of Object.keys(accounts)) {
    const privateKey = accounts[address].secretKey;
    const w = new ethers.Wallet(privateKey, web3Provider);
    wallets.push(w);
  }

  return wallets;
}

async function login(restApi: INestApplication, user: ethers.Wallet) {
  const date = new Date().toUTCString();
  const CONNECT_WALLET_MSG = `I want to login at ${date}`;
  const signature = await user.signMessage(CONNECT_WALLET_MSG);
  const resp = await request(restApi.getHttpServer())
    .post('/auth/login')
    .send({
      walletAddress: user.address,
      signature: signature,
      message: CONNECT_WALLET_MSG,
    })
  return resp.body;
}

async function createCollection(restApi: INestApplication, user: ethers.Wallet, jwt: string) {
  const royaltyData = JSON.stringify([
    {
      wallet_address: user.address,
      percentage: 0.05,
    },
  ]);
  const resp = await request(restApi.getHttpServer())
    .post('/collection/create')
    .set('Authorization', 'Bearer ' + jwt)
    .field('royalty', royaltyData)
    .field('logo_image', 'some image')
    .field('name', 'some image')
    .field('description', 'some image')
    .field('contract_address', 'some image')
    .field('creator_address', user.address)
    .field('category_id', '1')
    .field('chainId', '137')

  return resp.body;
}

async function createItem(
  restApi: INestApplication,
  user: ethers.Wallet,
  jwt: string,
  collectionId: number
) {
  const name = 'item name';
  const description = 'item description';
  const external_link = 'external-link.com';
  const collection_id = collectionId;
  const image = `${__dirname}/test-data/image1.png`;
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
  const blockchain = '1337';
  const is_minted = false;

  try {
    const resp = await request(restApi.getHttpServer())
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
    console.log({ resp })
    return resp.body;

  } catch (err) {
    throw err;
  }
}

async function main() {
  // Reset database
  const db = await setupDatabase();
  // Local blockchain
  const blockchain = setupBlockchain();
  // Indexer
  const indexer = await setupIndexer();
  // REST API
  const restApi = await setupRestApi();
  // ipfs
  ipfsProcess = await setupIpfs();

  const {
    wmatic,
    nft,
    diamond,
    marketplace,
    offers
  } = await deployContracts(blockchain);

  const [deployer, acc1, acc2] = testAccounts(blockchain);
  // console.log({ wmatic, nft, diamond, marketplace, offers });

  /**
   * Test Cases
   */
  // Login
  let { jwt, data } = await login(restApi, acc1);

  // Create Collection
  ({ data } = await createCollection(restApi, acc1, jwt));
  // Create Item
  // - REST API should create item data to DB quantity minted 0
  // - REST API should upload metadata to IPFS
  // - Client should mint item to blockchain
  // - Indexer should pickup minted item, read the metadata
  ({ data } = await createItem(restApi, acc1, jwt, data.id));

  console.log({ data });
}

/**
 * Cleanup
 */
process.on('SIGINT', () => {
  process.kill(-ipfsProcess.pid);
});  // CTRL+C
process.on('SIGQUIT', () => {
  process.kill(-ipfsProcess.pid);
}); // Keyboard quit
process.on('SIGTERM', () => {
  process.kill(-ipfsProcess.pid);
}); // `kill` command

main()
  .then(() => {
    process.kill(-ipfsProcess.pid);
    process.exit(0)
  })
  .catch(error => {
    console.error(error);
    process.kill(-ipfsProcess.pid);
    process.exit(1)
  })