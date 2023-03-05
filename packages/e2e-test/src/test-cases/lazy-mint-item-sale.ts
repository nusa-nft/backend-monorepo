import { INestApplication } from "@nestjs/common";
import { PrismaClient, Item, ListingType, TokenType } from "@nusa-nft/database";
import { NATIVE_CURRENCY } from "@nusa-nft/rest-api/src/item/web3/constants";
import { NusaNFT } from "@nusa-nft/smart-contract/typechain-types";
import { TransferSingleEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/NusaNFT";
import { ethers } from "ethers";
import { assert, fmtFailed, fmtSuccess } from "../lib/assertions";
import { createItem, createLazyMintListing, login, getLazyMintListingSignature } from "../lib/rest-api";
import retry from 'async-retry';

export async function testLazyMintItemSale({
  restApi,
  sellerWallet,
  buyerWallet,
  collectionId,
  db,
  nft
}: {
  restApi: INestApplication,
  collectionId: number,
  sellerWallet: ethers.Wallet,
  buyerWallet: ethers.Wallet,
  db: PrismaClient,
  nft: NusaNFT
}) {
  // Create Item
  const sellerCreds = await login(restApi, sellerWallet);
  let resp = await createItem(restApi, sellerCreds.jwt, {
    collectionId,
    lazyMint: true,
    freezeMetadata: true,
    name: 'Item 2',
    description: 'item ke 2',
    image: `${__dirname}/../test-data/image1.png`,
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
  resp = await createLazyMintListing(restApi, sellerCreds.jwt, {
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
  
  const buyerCreds = await login(restApi, buyerWallet);
  resp = await getLazyMintListingSignature(restApi, buyerCreds.jwt, { listingId });
  const { mintRequest, signature } = resp;

  let tx = await nft.connect(buyerWallet).mintWithSignature(mintRequest, signature, {
    value: ethers.utils.parseEther("1")
  });
  let receipt = await tx.wait();
  let transferSingleEvent = await receipt.events.find(ev => ev.event == 'TransferSingle') as TransferSingleEvent;
  let { id } = transferSingleEvent.args;

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
  
  let tokenOwnership = await db.tokenOwnerships.findFirst({
    where: {
      contractAddress: lazyMintSoldItem.contract_address,
      tokenId: lazyMintSoldItem.tokenId,
      ownerAddress: buyerWallet.address
    }
  });
  assert(!!tokenOwnership, 'assert tokenOwnership exists failed');
  assert(tokenOwnership.ownerAddress.toLowerCase() == buyerWallet.address.toLowerCase(), 'assert tokenOwnership.ownerAddress failed');
  assert(tokenOwnership.quantity == 1, 'assert tokenOwnership.quantity failed');

  let notificationSaleData_inDb;
  await retry(async () => {
    notificationSaleData_inDb = await db.notificationDetailSale.findFirst({
      where: {
        buyer_wallet_address: buyerWallet.address
      }
    })
  }, {retries: 3})

  assert(!notificationSaleData_inDb, fmtFailed("notification not created"))
  console.log(fmtSuccess('notification offer data created'))
  console.log('Lazy Mint Item Sale test passed');

  // TODO: Assert if marketplace receives platform fee
}