import {
  setupBlockchain,
  setupDatabase,
  setupIndexer,
  setupIpfs,
  setupRestApi
} from "./lib/setup-services";
import { deployContracts } from './lib/setup-smart-contracts';
import { ethers, Event } from "ethers";
import { Server } from 'ganache';
import { ChildProcess } from 'child_process'
import { login, createCollection, createItem, uploadMetadataToIpfs, createLazyMintListing, getLazyMintListingSignature } from "./lib/rest-api";
import { getIpfsData } from "./lib/ipfs";
import { assert } from "./lib/assertions";
import { Collection, Item, ListingType, PrismaClient, TokenType } from "@nusa-nft/database";
import _ from "lodash";
import { NusaNFT, TokensMintedWithSignatureEvent, TransferSingleEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/NusaNFT";
import retry from 'async-retry';
import { NATIVE_CURRENCY } from "@nusa-nft/rest-api/src/item/web3/constants";
import { INestApplication } from "@nestjs/common";
import { testCreateItemOnChain } from "./test-cases/create-item";
import { testLazyMintItemSale } from "./test-cases/lazy-mint-item-sale";
import { testMarketplaceDirectListing } from "./test-cases/marketplace-direct-listing";

let ipfsProcess: ChildProcess;

function getTestAccounts(blockchain: Server<"ethereum">) {
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


async function main() {
  // Reset database
  const db = await setupDatabase();
  // Local blockchain
  const blockchain = setupBlockchain();
  // Deploy contracts
  const {
    wmatic,
    nft,
    diamond,
    marketplace,
    offers
  } = await deployContracts(blockchain);
  // Get blockchain accounts
  const [deployer, acc1, acc2] = getTestAccounts(blockchain);

  // set contract address to env variables
  // this should be picked up by rest-api and indexer services
  process.env.NFT_CONTRACT_ADDRESS = nft.address;
  process.env.MARKETPLACE_CONTRACT_ADDRESS = diamond.address;
  process.env.NFT_CONTRACT_OWNER_PRIVATE_KEY = deployer.privateKey;
  process.env.CHAIN_ID = '1337';


  // Setup indexer, rest api, ipfs
  // IPFS takes 15 seconds to start
  const promises = await Promise.all([setupIndexer(), setupRestApi(), setupIpfs()]);
  const indexer = promises[0];
  const restApi = promises[1];
  ipfsProcess = promises[2]

  /**
   * Test Cases
   */
  // Login
  let { jwt, data } = await login(restApi, acc1);

  // Create Collection
  ({ data } = await createCollection(restApi, acc1, jwt, {
    name: 'My Collection',
    description: 'This is my collection',
    contract_address: nft.address,
    category_id: 1,
    logo_image: `${__dirname}/test-data/image2.png`,
    chainId: 1337,
    royalty: [
      {
        wallet_address: acc1.address,
        percentage: 0.05
      }
    ]
  }));
  const collection: Collection = data;
  const collectionId = data.id;
  assert(collection.slug == 'my-collection', 'collection.slug assertion failed');

  /// ======================
  // Test Create Item On Chain
  // =======================
  await testCreateItemOnChain({
    restApi,
    collectionId,
    wallet: acc1,
    db,
    nft
  });
  
  /// =========================================
  /// Test Create Lazy Mint Item, Sell, and Buy
  /// =========================================
  await testLazyMintItemSale({
    restApi,
    db,
    nft,
    collectionId,
    sellerWallet: acc1,
    buyerWallet: acc2,
  });

  /// =========================================
  /// Test Create Direct Listing and Buy
  /// =========================================
  await testMarketplaceDirectListing({
    restApi,
    db,
    nft,
    marketplace,
    collectionId,
    sellerWallet: acc1,
    buyerWallet: acc2,
  })
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