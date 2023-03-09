import {
  setupBlockchain,
  setupDatabase,
  setupIndexer,
  setupIpfs,
  setupRestApi,
  setupWorker
} from "./lib/setup-services";
import { deployContracts } from './lib/setup-smart-contracts';
import { ethers, Event } from "ethers";
import { Server } from 'ganache';
import { ChildProcess } from 'child_process'
import { login, createCollection, createItem, uploadMetadataToIpfs, createLazyMintListing, getLazyMintListingSignature } from "./lib/rest-api";
import { getIpfsData } from "./lib/ipfs";
import { assert } from "./lib/assertions";
import { Collection, Item, ListingType, PrismaClient, TokenType } from "@nusa-nft/database";
import _, { rest } from "lodash";
import { NusaNFT, TokensMintedWithSignatureEvent, TransferSingleEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/NusaNFT";
import retry from 'async-retry';
import { NATIVE_CURRENCY } from "@nusa-nft/rest-api/src/item/web3/constants";
import { INestApplication } from "@nestjs/common";
import {
  testCreateItemOnChain,
  testLazyMintItemSale,
  testMarketplaceDirectListing,
  testMarketplacAuctionListing,
  offer,
  importERC1155BatchMint,
  importERC1155Mint,
  importERC721Mint,
  itemMultiQuantityListings,
  voucherRedeemableItems,
  indexerSync
} from "./test-cases";

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
    offers,
    erc1155,
    erc721,
  } = await deployContracts(blockchain);
  // Get blockchain accounts
  const [deployer, acc1, acc2, acc3, acc4] = getTestAccounts(blockchain);
  const web3Provider = new ethers.providers.Web3Provider(blockchain.provider);

  // set contract address to env variables
  // this should be picked up by rest-api and indexer services
  process.env.NFT_CONTRACT_ADDRESS = nft.address;
  process.env.MARKETPLACE_CONTRACT_ADDRESS = diamond.address;
  process.env.NFT_CONTRACT_OWNER_PRIVATE_KEY = deployer.privateKey;
  process.env.CHAIN_ID = '1337';
  process.env.WORKER_IMPORT_COLLECTION_START_BLOCK = '0';
  process.env.INDEXER_FROM_BLOCK = '0';
  process.env.RPC_URL = 'http://localhost:8545'
  process.env.WSS_RPC_URL = 'ws://localhost:8545'


  // Setup indexer, rest api, ipfs
  // IPFS takes 15 seconds to start
  const promises = await Promise.all([setupIndexer(), setupRestApi(), setupWorker(), setupIpfs()]);
  const indexer = promises[0];
  const restApi = promises[1];
  const worker = promises[2];
  ipfsProcess = promises[3];

  // Initialize services
  await restApi.init();
  await indexer.init();
  await worker.init();

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
  // await testCreateItemOnChain({
  //   restApi,
  //   collectionId,
  //   wallet: acc1,
  //   db,
  //   nft
  // });

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
  // await testMarketplaceDirectListing({
  //   restApi,
  //   db,
  //   nft,
  //   marketplace,
  //   collectionId,
  //   sellerWallet: acc1,
  //   buyerWallet: acc2,
  // })

  /// =========================================
  /// Test Create Auction Listing and Buy
  /// =========================================
  // await testMarketplacAuctionListing({
  //   restApi,
  //   db,
  //   web3Provider,
  //   nft,
  //   marketplace,
  //   collectionId,
  //   sellerWallet: acc1,
  //   bidderWallet1: acc2,
  //   bidderWallet2: acc3
  // });

  /// =========================================
  /// Test Create Offer and Accept
  /// =========================================
  // await offer({
  //   restApi,
  //   db,
  //   web3Provider,
  //   nft,
  //   offers,
  //   collectionId,
  //   minter: acc1,
  //   offeror: acc2,
  //   marketplace,
  //   wmatic
  // });

  /// ====================================
  /// Test Import ERC1155 Mint
  /// ====================================
  // await importERC1155Mint({
  //   restApi,
  //   db,
  //   web3Provider,
  //   erc1155,
  //   minter: deployer,
  //   receiver: acc1,
  // });


  /// ====================================
  /// Test Import ERC1155 Batch Mint
  /// ====================================
  // await importERC1155BatchMint({
  //   restApi,
  //   db,
  //   web3Provider,
  //   erc1155,
  //   minter: deployer,
  //   receiver: acc1,
  // });

  /// ====================================
  /// Test Import ERC721 Mint
  /// ====================================
  // await importERC721Mint({
  //   restApi,
  //   db,
  //   web3Provider,
  //   erc721,
  //   minter: deployer,
  //   receiver: acc1,
  // });

  /// ====================================
  /// Test Multi Quantity Listing
  /// ====================================
  // await itemMultiQuantityListings({
  //   restApi,
  //   db,
  //   web3Provider,
  //   marketplace,
  //   nft,
  //   minter: acc1,
  //   user1: acc2,
  //   user2: acc3,
  // })

  /// ====================================
  /// Test Voucher Redeemable Item
  /// ====================================
  // await voucherRedeemableItems({
  //   restApi,
  //   db,
  //   web3Provider,
  //   nft,
  //   creator: acc1,
  //   user1: acc2,
  //   user2: acc3
  // });

  /// ====================================
  /// Test Indexer Sync
  /// comment out indexer.init() above
  /// ganache.miner.blockTime = 1
  /// before running this test
  /// ====================================
  // await indexerSync({
  //   db,
  //   web3Provider,
  //   indexer,
  //   nft,
  //   marketplace,
  //   user1: acc1,
  //   user2: acc2,
  // });
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