
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
import { Collection, Item, ListingType, TokenType } from "@nusa-nft/database";
import _ from "lodash";
import { TokensMintedWithSignatureEvent, TransferSingleEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/NusaNFT";
import retry from 'async-retry';
import { NATIVE_CURRENCY } from "@nusa-nft/rest-api/src/item/web3/constants";

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
  const [deployer, acc1, acc2] = testAccounts(blockchain);

  // set contract address to env variables
  // this should be picked up by rest-api and indexer services
  process.env.NFT_CONTRACT_ADDRESS = nft.address;
  process.env.MARKETPLACE_CONTRACT_ADDRESS = diamond.address;
  process.env.NFT_CONTRACT_OWNER_PRIVATE_KEY = deployer.privateKey;


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
  // FIXME: set collection params, so can check if its correctly uploaded to IPFS
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
  // Create Item On Chain
  // =======================
  // - REST API should upload metadata to IPFS
  let resp =  await uploadMetadataToIpfs(restApi, jwt, {
    name: 'test-item',
    description: 'test-description',
    collectionId,
    attributes: [
      {
        trait_type: 'eyes',
        nusa_attribute_type: 'PROPERTIES',
        value: 'blue',
      }
    ],
    external_link: 'test-link',
    image: `${__dirname}/test-data/image1.png`,
    supply: 1,
    unlockable: false,
    explicit_sensitive: false
  });
  const { ipfsUri } = resp;
  const ipfsData = await getIpfsData(ipfsUri);
  assert(ipfsData.name == 'test-item')
  assert(ipfsData.description == 'test-description')
  assert(ipfsData.nusa_collection.name == 'My Collection')
  assert(ipfsData.nusa_collection.slug == 'my-collection')
  assert(_.isEqual(ipfsData.attributes, [
    {
      trait_type: 'eyes',
      // nusa_attribute_type: 'PROPERTIES',
      value: 'blue',
    }
  ]))
  // - Client should mint item to blockchain
  let tx = await nft
    .connect(acc1)
    .mintTo(acc1.address, ethers.constants.MaxUint256, ipfsUri, 1);
  let receipt = await tx.wait();
  let transferSingleEvent = await receipt.events.find(ev => ev.event == 'TransferSingle') as TransferSingleEvent;
  let { id } = transferSingleEvent.args;

  // - Indexer should pickup minted item, read the metadata, and create item on DB
  let minted: Item;
  await retry(async () => {
    minted = await db.item.findFirstOrThrow({
      where: {
        contract_address: nft.address,
        tokenId: id.toString()
      }
    });
  }, { forever: true });
  assert(minted.uuid == ipfsData.nusa_item_id, 'assert minted.uuid failed');
  assert(minted.name == ipfsData.name, 'assert minted.name failed');
  assert(minted.description == ipfsData.description, 'assert minted.description failed');
  assert(minted.image == ipfsData.image, 'assert minted.image failed');
  assert(minted.metadata == ipfsUri, 'assert minted.metadata failed');
  assert(minted.quantity_minted == 1);
  
  let tokenOwnership = await db.tokenOwnerships.findFirst({
    where: {
      contractAddress: nft.address,
      tokenId: minted.tokenId
    }
  });
  assert(tokenOwnership.ownerAddress.toLowerCase() == acc1.address.toLowerCase(), 'assert tokenOwnership.ownerAddress failed');
  assert(tokenOwnership.quantity == 1, 'assert tokenOwnership.quantity failed');
  

  /// =======================================
  /// Create Lazy Mint Item (Metadata Frozen)
  /// =======================================
  // Create Item
  resp = await createItem(restApi, jwt, {
    collectionId,
    lazyMint: true,
    freezeMetadata: true,
    name: 'Item 2',
    description: 'item ke 2',
    image: `${__dirname}/test-data/image1.png`,
    supply: 1,
    external_link: 'external-link',
    explicit_sensitive: false,
    attributes: [
      {
        trait_type: 'eyes',
        nusa_attribute_type: 'PROPERTIES',
        value: 'red',
      },
    ],
    chainId: 1337,
  });
  const lazyMintedItem: Item = resp.data;
  assert(lazyMintedItem.quantity_minted == 0, 'assert lazyMintedItem.quantity_minted failed');
  assert(Number(lazyMintedItem.tokenId) < 0, 'assert lazyMintedItem.tokenId failed');
  assert(lazyMintedItem.name == 'Item 2', 'assert lazyMintedItem.name failed');
  assert(lazyMintedItem.description == 'item ke 2', 'assert lazyMintedItem.description failed');

  // Create Lazy Mint Sale
  resp = await createLazyMintListing(restApi, jwt, {
    itemId: lazyMintedItem.id,
    listingData: {
      buyoutPricePerToken: ethers.utils.parseEther("1").toString(),
      currency: NATIVE_CURRENCY,
      endTime: Number.MAX_SAFE_INTEGER,
      listingType: ListingType.Direct,
      quantity: 1,
      reservePricePerToken: "0",
      startTime: Math.floor(Date.now() / 1000),
      tokenType: TokenType.ERC1155
    }
  })
  const listingId = resp.id;
  
  const acc2Creds = await login(restApi, acc2);
  resp = await getLazyMintListingSignature(restApi, acc2Creds.jwt, { listingId });
  const { mintRequest, signature } = resp;

  tx = await nft.connect(acc2).mintWithSignature(mintRequest, signature, {
    value: ethers.utils.parseEther("1")
  });
  receipt = await tx.wait();
  transferSingleEvent = await receipt.events.find(ev => ev.event == 'TransferSingle') as TransferSingleEvent;
  ({ id } = transferSingleEvent.args);

  // Wait for indexer to pickup
  await new Promise(res => setTimeout(res, 10000));

  let lazyMintSoldItem: Item;
  await retry(async () => {
    lazyMintSoldItem = await db.item.findFirstOrThrow({
      where: {
        id: lazyMintedItem.id
      }
    })
  }, { forever: true, retries: 5 });
  assert(Number(lazyMintSoldItem.tokenId) == id.toNumber(), 'assert lazyMintSoldItem.tokenId failed');
  assert(lazyMintSoldItem.quantity_minted == 1, 'assert lazyMintSoldItem.quantity_minted failed');
  
  tokenOwnership = await db.tokenOwnerships.findFirst({
    where: {
      contractAddress: lazyMintSoldItem.contract_address,
      tokenId: lazyMintSoldItem.tokenId,
      ownerAddress: acc2.address
    }
  });
  assert(!!tokenOwnership, 'assert tokenOwnership exists failed');
  assert(tokenOwnership.ownerAddress.toLowerCase() == acc2.address.toLowerCase(), 'assert tokenOwnership.ownerAddress failed');
  assert(tokenOwnership.quantity == 1, 'assert tokenOwnership.quantity failed');
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