import { MarketplaceFacet, NusaNFT } from "@nusa-nft/smart-contract/typechain-types";
import { ethers } from "ethers";
import { NATIVE_CURRENCY } from "@nusa-nft/rest-api/src/item/web3/constants";
import { getTime, increaseTime } from "../lib/time";
import { INestApplication } from "@nestjs/common";
import { Item, MarketplaceListing, MarketplaceSale, PrismaClient, RoyaltyPaid } from "@nusa-nft/database";
import { TransferSingleEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/ERC1155_dummy";
import { ListingAddedEvent, NewSaleEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/facets/MarketplaceFacet";
import retry from "async-retry";
import { assert, fmtFailed, fmtSuccess } from "../lib/assertions";
import request from 'supertest';

export async function itemMultiQuantityListings({
  restApi,
  db,
  marketplace,
  nft,
  minter,
  web3Provider,
  user1,
  user2
}: {
  restApi: INestApplication,
  db: PrismaClient,
  marketplace: MarketplaceFacet,
  nft: NusaNFT,
  minter: ethers.Wallet,
  user1: ethers.Wallet,
  user2: ethers.Wallet,
  web3Provider: ethers.providers.Web3Provider
}) {
  const quantity = 20;
  let tx = await nft
    .connect(minter)
    .mintTo(minter.address, ethers.constants.MaxUint256, 'test-uri', quantity);
    let receipt = await tx.wait();
  let transferSingleEvent = await receipt.events.find(ev => ev.event == 'TransferSingle') as TransferSingleEvent;
  let { id } = transferSingleEvent.args;

  tx = await nft.connect(minter).setApprovalForAll(marketplace.address, true);
  await tx.wait();

  // Wait for indexer to pickup minted item
  let item: Item;
  await retry(async () => {
    item = await db.item.findFirstOrThrow({
      where: {
        contract_address: nft.address,
        tokenId: id.toString()
      }
    })
  }, { retries: 3 });

  let now = await getTime(web3Provider);

  // List 10 items
  tx = await marketplace.connect(
    minter,
  ).createListing({
    assetContract: nft.address,
    tokenId: id,
    buyoutPricePerToken: ethers.utils.parseEther("0.5"),
    currencyToAccept: NATIVE_CURRENCY,
    quantityToList: 10,
    reservePricePerToken: 0,
    startTime: now + 100,
    secondsUntilEndTime: 2147483647,
    listingType: 0,
    royaltyParams: {
      recipients: [minter.address],
      bpsPerRecipients: [500]
    }
  });
  receipt = await tx.wait();
  let listingAddedEvent = await receipt.events.find(ev => ev.event == 'ListingAdded') as ListingAddedEvent;
  let { listingId } = listingAddedEvent.args;
  const listingId1 = listingId;

  let listing: MarketplaceListing;
  await retry(async () => {
    listing = await db.marketplaceListing.findFirstOrThrow({
      where: { id: listingId1.toNumber() }
    })
  }, { retries: 3 });
  console.log("minter listing", listing);

  await increaseTime(web3Provider, 200);

  // ===================
  // User 1 Buy 3 items
  // ===================
  tx = await marketplace.connect(user1).buy(
    listingId,
    user1.address,
    3,
    NATIVE_CURRENCY,
    ethers.utils.parseEther("0.5").mul(3),
    {
      value: ethers.utils.parseEther("0.5").mul(3),
    }
  );
  receipt = await tx.wait();
  let newSaleEvent = await receipt.events.find(ev => ev.event == 'NewSale') as NewSaleEvent;
  let { buyer } = newSaleEvent.args;

  let sale: MarketplaceSale;
  await retry(async () => {
    sale = await db.marketplaceSale.findFirstOrThrow({
      where: {
        listingId: listingId.toNumber(),
        buyer: buyer
      }
    })
  }, { retries: 3 });
  assert(sale.buyer == user1.address, fmtFailed("sale buyer address not equal to user1 address"));
  console.log("user1 buy nft", sale);

  await new Promise(resolve => setTimeout(resolve, 5000));

  let tokenOwnershipSeller_onchain = await nft.balanceOf(minter.address, id);
  let tokenOwnershipBuyer_onchain = await nft.balanceOf(user1.address, id);

  let tokenOwnershipSeller_db
  await retry(async () => {
    tokenOwnershipSeller_db = await db.tokenOwnerships.findFirstOrThrow({
      where: {
        contractAddress: nft.address,
        tokenId: id.toString(),
        ownerAddress: minter.address
      }
    });
  }, { retries: 3 })

  let tokenOwnershipBuyer_db
  await retry(async () => {
    tokenOwnershipBuyer_db = await db.tokenOwnerships.findFirstOrThrow({
      where: {
        contractAddress: nft.address,
        tokenId: id.toString(),
        ownerAddress: user1.address
      }
    });
  }, { retries: 3 })
  assert(tokenOwnershipSeller_onchain.toString() == tokenOwnershipSeller_db?.quantity.toString(), fmtFailed("token ownership seller onchain not equal to db"));
  assert(tokenOwnershipBuyer_onchain.toString() == tokenOwnershipBuyer_db?.quantity.toString(), fmtFailed("token ownership buyer onchain not equal to db"));
  console.log(fmtSuccess("Item multi quantity listing 1 check passed"));

  // ===================
  // User 2 Buy 3 items
  // ===================
  tx = await marketplace.connect(user2).buy(
    listingId,
    user2.address,
    3,
    NATIVE_CURRENCY,
    ethers.utils.parseEther("0.5").mul(3),
    {
      value: ethers.utils.parseEther("0.5").mul(3),
    }
  );
  receipt = await tx.wait();
  newSaleEvent = await receipt.events.find(ev => ev.event == 'NewSale') as NewSaleEvent;
  ({ buyer } = newSaleEvent.args);

  // sale: MarketplaceSale;
  await retry(async () => {
    sale = await db.marketplaceSale.findFirstOrThrow({
      where: {
        listingId: listingId.toNumber(),
        buyer: buyer
      }
    })
  }, { retries: 3 });
  console.log("user2 buy nft", sale);

  await new Promise(resolve => setTimeout(resolve, 5000));

  tokenOwnershipSeller_onchain = await nft.balanceOf(minter.address, id);
  tokenOwnershipBuyer_onchain = await nft.balanceOf(user1.address, id);

  // let tokenOwnershipSeller_db
  await retry(async () => {
    tokenOwnershipSeller_db = await db.tokenOwnerships.findFirstOrThrow({
      where: {
        contractAddress: nft.address,
        tokenId: id.toString(),
        ownerAddress: minter.address
      }
    });
  }, { retries: 3 })

  // let tokenOwnershipBuyer_db
  await retry(async () => {
    tokenOwnershipBuyer_db = await db.tokenOwnerships.findFirstOrThrow({
      where: {
        contractAddress: nft.address,
        tokenId: id.toString(),
        ownerAddress: user2.address
      }
    });
  }, { retries: 3 })
  assert(tokenOwnershipSeller_onchain.toString() == tokenOwnershipSeller_db?.quantity.toString(), fmtFailed("token ownership seller onchain not equal to db"));
  assert(tokenOwnershipBuyer_onchain.toString() == tokenOwnershipBuyer_db?.quantity.toString(), fmtFailed("token ownership buyer onchain not equal to db"));
  console.log(fmtSuccess("Item multi quantity listing 2 check passed"));

  now = await getTime(web3Provider);

  /// User 1 List 3 items
  tx = await nft.connect(user1).setApprovalForAll(marketplace.address, true);
  tx = await marketplace.connect(
    user1,
  ).createListing({
    assetContract: nft.address,
    tokenId: id,
    buyoutPricePerToken: ethers.utils.parseEther("0.4"),
    currencyToAccept: NATIVE_CURRENCY,
    quantityToList: 3,
    reservePricePerToken: 0,
    startTime: now + 100,
    secondsUntilEndTime: 2147483647,
    listingType: 0,
    royaltyParams: {
      recipients: [minter.address],
      bpsPerRecipients: [500]
    }
  });
  receipt = await tx.wait();
  listingAddedEvent = await receipt.events.find(ev => ev.event == 'ListingAdded') as ListingAddedEvent;
  ({ listingId } = listingAddedEvent.args);
  const listingId2 = listingAddedEvent.args.listingId;

  await retry(async () => {
    listing = await db.marketplaceListing.findFirstOrThrow({
      where: {
        id: listingId2.toNumber(),
      }
    })
  }, { retries: 3 });
  console.log("user1 listing", listing);

  now = await getTime(web3Provider);
  /// User 2 list 3 items
  tx = await nft.connect(user2).setApprovalForAll(marketplace.address, true);
  tx = await marketplace.connect(
    user2,
  ).createListing({
    assetContract: nft.address,
    tokenId: id,
    buyoutPricePerToken: ethers.utils.parseEther("0.3"),
    currencyToAccept: NATIVE_CURRENCY,
    quantityToList: 3,
    reservePricePerToken: 0,
    startTime: now + 100,
    secondsUntilEndTime: 2147483647,
    listingType: 0,
    royaltyParams: {
      recipients: [minter.address],
      bpsPerRecipients: [500]
    }
  });
  receipt = await tx.wait();
  listingAddedEvent = await receipt.events.find(ev => ev.event == 'ListingAdded') as ListingAddedEvent;
  // ({ listingId } = listingAddedEvent.args);
  const listingId3 = listingAddedEvent.args.listingId;

  await retry(async () => {
    listing = await db.marketplaceListing.findFirstOrThrow({
      where: {
        id: listingId3.toNumber()
      }
    });
  }, { retries: 3 });
  console.log("user2 listing", listing);

  item = await db.item.findFirst({
    where: {
      tokenId: id.toString(),
    }
  });

  const resp = await request(restApi.getHttpServer())
    .get(`/item/${item.id}`)
  const _item = resp.body;
  const listing1Price = _item.listings[0].buyoutPricePerToken.toString();
  const listing2Price = _item.listings[1].buyoutPricePerToken.toString();
  const listing3Price = _item.listings[2].buyoutPricePerToken.toString();
  assert(listing1Price == ethers.utils.parseEther("0.3").toString(), fmtFailed("Item multi quantity listings are ordered by price ascending check failed"));
  assert(listing2Price == ethers.utils.parseEther("0.4").toString(), fmtFailed("Item multi quantity listings are ordered by price ascending check failed"));
  assert(listing3Price == ethers.utils.parseEther("0.5").toString(), fmtFailed("Item multi quantity listings are ordered by price ascending check failed"));
  console.log(fmtSuccess("Item multi quantity listings are ordered by price ascending check passed"));

  await increaseTime(web3Provider, 200);

  tx = await marketplace.connect(user2).buy(
    listingId2,
    user2.address,
    3,
    NATIVE_CURRENCY,
    ethers.utils.parseEther("0.4").mul(3),
    {
      value: ethers.utils.parseEther("0.4").mul(3),
    }
  );
  receipt = await tx.wait();
  newSaleEvent = await receipt.events.find(ev => ev.event == 'NewSale') as NewSaleEvent;
  ({ buyer } = newSaleEvent.args);

  await new Promise(resolve => setTimeout(resolve, 5000));

  tokenOwnershipSeller_onchain = await nft.balanceOf(user1.address, id);
  tokenOwnershipBuyer_onchain = await nft.balanceOf(user2.address, id);

  // let tokenOwnershipSeller_db
  await retry(async () => {
    tokenOwnershipSeller_db = await db.tokenOwnerships.findFirstOrThrow({
      where: {
        contractAddress: nft.address,
        tokenId: id.toString(),
        ownerAddress: user1.address
      }
    });
  }, { retries: 3 })

  // let tokenOwnershipBuyer_db
  await retry(async () => {
    tokenOwnershipBuyer_db = await db.tokenOwnerships.findFirstOrThrow({
      where: {
        contractAddress: nft.address,
        tokenId: id.toString(),
        ownerAddress: user2.address
      }
    });
  }, { retries: 3 })
  assert(tokenOwnershipSeller_onchain.toString() == tokenOwnershipSeller_db?.quantity.toString(), fmtFailed("token ownership seller onchain not equal to db"));
  assert(tokenOwnershipBuyer_onchain.toString() == tokenOwnershipBuyer_db?.quantity.toString(), fmtFailed("token ownership buyer onchain not equal to db"));
  console.log(fmtSuccess("Item multi quantity listing 2 check passed"));

  let royaltyPaid: RoyaltyPaid;
  await retry(async () => {
    royaltyPaid = await db.royaltyPaid.findFirstOrThrow({
      where: {
        listingId: listingId.toNumber(),
        recipient: minter.address,
      }
    });
  }, { retries: 3 })
  assert(royaltyPaid.amount.toString() == ethers.utils.parseEther("0.4").mul(3).mul(500).div(10000).toString(), fmtFailed("royalty paid amount not equal to db"));
  console.log(fmtSuccess("Royalty paid check passed"));
}