import { INestApplication } from "@nestjs/common";
import { ListingStatus, PrismaClient } from "@nusa-nft/database";
import { NATIVE_CURRENCY } from "@nusa-nft/rest-api/src/item/web3/constants";
import { getTime, increaseTime } from "../lib/time";
import { MarketplaceFacet, NusaNFT } from "@nusa-nft/smart-contract/typechain-types";
import { ethers } from "ethers";
import { ListingAddedEvent, NewSaleEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/facets/MarketplaceFacet";
import { TransferSingleEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/NusaNFT";
import { assert, fmtSuccess } from "../lib/assertions";
import retry from 'async-retry';

export async function indexerSync({
  db,
  web3Provider,
  indexer,
  nft,
  marketplace,
  user1,
  user2,
}: {
  db: PrismaClient;
  web3Provider: ethers.providers.Web3Provider,
  indexer: INestApplication
  nft: NusaNFT,
  marketplace: MarketplaceFacet,
  user1: ethers.Wallet,
  user2: ethers.Wallet
}) {
  // User1 mints 1 item
  let tx = await nft.connect(user1)
    .mintTo(user1.address, ethers.constants.MaxUint256, 'ipfs://test', 1);
  let receipt = await tx.wait();
  let transferSingleEvent = await receipt.events.find(ev => ev.event == 'TransferSingle') as TransferSingleEvent;
  let { id } = transferSingleEvent.args;
  const tokenId1 = id;
  console.log("User1 minted item")

  // User1 transfers 1 item to user2
  tx = await nft.connect(user1).safeTransferFrom(user1.address, user2.address, tokenId1, 1, []);
  receipt = await tx.wait();
  console.log("User1 transfers 1 item to user2");

  let now = await getTime(web3Provider);

  // User2 sells 1 item
  tx = await nft.connect(user2).setApprovalForAll(marketplace.address, true);
  tx = await marketplace
    .connect(user2)
    .createListing({
      assetContract: nft.address,
      tokenId: tokenId1,
      buyoutPricePerToken: ethers.utils.parseEther("0.5"),
      currencyToAccept: NATIVE_CURRENCY,
      quantityToList: 1,
      reservePricePerToken: 0,
      startTime: now + 100,
      secondsUntilEndTime: 2147483647,
      listingType: 0,
      royaltyParams: {
        recipients: [user1.address],
        bpsPerRecipients: [500]
      }
    });
  receipt = await tx.wait();
  let listingAddedEvent = await receipt.events.find(ev => ev.event == 'ListingAdded') as ListingAddedEvent;
  let { listingId } = listingAddedEvent.args;
  const listingId1 = listingId;

  await increaseTime(web3Provider, 500);

  // User1 buys the item
  tx = await marketplace.connect(user1).buy(
    listingId1,
    user1.address,
    1,
    NATIVE_CURRENCY,
    ethers.utils.parseEther("0.5"),
    {
      value: ethers.utils.parseEther("0.5"),
    }
  );
  receipt = await tx.wait();
  let newSaleEvent = await receipt.events.find(ev => ev.event == 'NewSale') as NewSaleEvent;
  let { buyer } = newSaleEvent.args;

  /// ===================================
  /// INITIALIZING INDEXER
  console.log("initializing indexer...");
  await indexer.init();
  /// ===================================

  await new Promise(resolve => setTimeout(resolve, 5000));
  /// =============================================
  /// ASSERTIONS - Indexer should index past blocks
  /// =============================================
  // Item should be indexed
  await retry(async () => {
    const item = await db.item.findFirstOrThrow({
      where: {
        tokenId: tokenId1.toString(),
        contract_address: nft.address
      },
    })
    assert(item.tokenId.toString() === tokenId1.toString(), 'item 1 should be indexed')
  }, { retries: 10 });
  console.log(fmtSuccess("item 1 indexed"))
  // User 1 should have 1 token id 0
  await retry(async () => {
    const token1User1Ownership = await db.tokenOwnerships.findFirstOrThrow({
      where: {
        tokenId: tokenId1.toString(),
        ownerAddress: user1.address,
      }
    });
    assert(token1User1Ownership.quantity === 1, 'user1 should own 1 item 1');
  }, { retries: 10});
  console.log(fmtSuccess("user1 owns 1 item 1"))
  // User 2 should have 0 token id 0
  await retry(async () => {
    const token1User2Ownership = await db.tokenOwnerships.findFirstOrThrow({
      where: {
        tokenId: tokenId1.toString(),
        ownerAddress: user2.address,
      }
    });
    assert(token1User2Ownership.quantity === 0, 'user1 should own 1 item 1');
  }, { retries: 10});
  console.log(fmtSuccess("user2 owns 0 item 1"));
  // Marketplace Listing should be completed
  await retry(async () => {
    const listing = await db.marketplaceListing.findFirstOrThrow({
      where: { id: listingId1.toString() },
    })
    assert(listing.status === ListingStatus.COMPLETED, 'listing 1 should be created')
  }, { retries: 10 });
  console.log(fmtSuccess("listing 1 completed"));
  // Marketplace Sale should be indexed
  await retry(async () => {
    const sale = await db.marketplaceSale.findFirstOrThrow({
      where: { listingId: listingId1.toString() },
    });
    assert(sale.buyer === user1.address, 'sale 1 should be indexed')
  }, { retries: 10 });
  console.log(fmtSuccess("sale 1 indexed"));
  await retry(async () => {
    let royaltyPaidListing1 = await db.royaltyPaid.findFirst({
      where: {
        listingId: listingId1.toString(),
      }
    });
    assert(royaltyPaidListing1.recipient == user1.address, "Royalty should be paid to user1");
  }, { retries: 10 })
  console.log(fmtSuccess("royalty paid to user1 indexed"));


  /// =============================================
  /// Test & ASSERTIONS - Indexer should index future blocks
  /// =============================================
  // User 2 mints 1 item
  tx = await nft.connect(user2)
    .mintTo(user2.address, ethers.constants.MaxUint256, 'ipfs://test', 1);
  receipt = await tx.wait();
  transferSingleEvent = await receipt.events.find(ev => ev.event == 'TransferSingle') as TransferSingleEvent;
  ({ id } = transferSingleEvent.args);
  const tokenId2 = id;
  console.log("User2 minted item")

  await retry(async () => {
    const item = await db.item.findFirstOrThrow({
      where: {
        tokenId: tokenId2.toString(),
        contract_address: nft.address
      },
    })
    assert(item.tokenId.toString() === tokenId2.toString(), 'item 2 should be indexed')
  }, { retries: 5 });
  console.log(fmtSuccess("item 2 indexed"));
  await retry(async () => {
    let token2User2Ownership = await db.tokenOwnerships.findFirst({
      where: {
        contractAddress: nft.address,
        ownerAddress: user2.address,
        tokenId: tokenId2.toString(),
      }
    });
    assert(token2User2Ownership.quantity == 1, "User2 should have 1 item");
  }, { retries: 5 })
  console.log(fmtSuccess("user2 owns 1 item 2"));
  
  // User2 transfers 1 item to user1
  tx = await nft.connect(user2).safeTransferFrom(user2.address, user1.address, tokenId2, 1, []);
  receipt = await tx.wait();
  console.log("User2 transfers 1 item to user1");

  await retry(async () => {
    let token2User1Ownership = await db.tokenOwnerships.findFirst({
      where: {
        contractAddress: nft.address,
        ownerAddress: user1.address,
        tokenId: tokenId2.toString(),
      }
    });
    assert(token2User1Ownership.quantity == 1, "User1 should have 1 item");
    let token2User2Ownership = await db.tokenOwnerships.findFirst({
      where: {
        contractAddress: nft.address,
        ownerAddress: user2.address,
        tokenId: tokenId2.toString(),
      }
    });
    assert(token2User2Ownership.quantity == 0, "User2 should have 0 item");
  }, { retries: 5 })
  console.log(fmtSuccess("user2 transfers 1 item 2 to user1"));

  now = await getTime(web3Provider);

  // User1 sells 1 item
  tx = await nft.connect(user1).setApprovalForAll(marketplace.address, true);
  tx = await marketplace
    .connect(user1)
    .createListing({
      assetContract: nft.address,
      tokenId: tokenId2,
      buyoutPricePerToken: ethers.utils.parseEther("0.5"),
      currencyToAccept: NATIVE_CURRENCY,
      quantityToList: 1,
      reservePricePerToken: 0,
      startTime: now + 100,
      secondsUntilEndTime: 2147483647,
      listingType: 0,
      royaltyParams: {
        recipients: [user2.address],
        bpsPerRecipients: [500]
      }
    });
  receipt = await tx.wait();
  listingAddedEvent = await receipt.events.find(ev => ev.event == 'ListingAdded') as ListingAddedEvent;
  ({ listingId } = listingAddedEvent.args);
  const listingId2 = listingId;

  await retry(async () => {
    const listing = await db.marketplaceListing.findFirstOrThrow({
      where: { id: listingId2.toString() },
    })
    assert(listing.status === ListingStatus.CREATED, 'listing 2 should be created')
  }, { retries: 5 });
  console.log(fmtSuccess("listing 2 created"));

  await increaseTime(web3Provider, 500);
  for (let i = 0; i < 10; i++) {
    await web3Provider.send('evm_mine', []);
  }

  // User 2 buys the item
  tx = await marketplace.connect(user2).buy(
    listingId2,
    user2.address,
    1,
    NATIVE_CURRENCY,
    ethers.utils.parseEther("0.5"),
    {
      value: ethers.utils.parseEther("0.5"),
    }
  );
  receipt = await tx.wait();
  newSaleEvent = await receipt.events.find(ev => ev.event == 'NewSale') as NewSaleEvent;
  ({ buyer } = newSaleEvent.args);

  await retry(async () => {
    let listing2 = await db.marketplaceListing.findFirst({
      where: {
        id: listingId2.toString(),
      }
    });
    assert(listing2.status == ListingStatus.COMPLETED, "Listing should have status COMPLETED quantity");
  }, { retries: 5 })
  console.log(fmtSuccess("listing 2 completed"));
  await retry(async () => {
    let sale = await db.marketplaceSale.findFirst({
      where: {
        listingId: listingId2.toString()
      }
    });
    assert(sale.buyer == user2.address, "Sale should be completed");
  }, { retries: 5 });
  console.log(fmtSuccess("sale 2 indexed"));
  await retry(async () => {
    let royaltyPaidListing2 = await db.royaltyPaid.findFirst({
      where: {
        listingId: listingId2.toString(),
      }
    });
    assert(royaltyPaidListing2.recipient == user2.address, "Royalty should be paid to user2");
  }, { retries: 5 })
  console.log(fmtSuccess("listing 2 royalty paid to user2 indexed"));
}