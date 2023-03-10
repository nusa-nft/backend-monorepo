import { INestApplication } from "@nestjs/common"
import request from "supertest";
import { Bid, Item, ListingStatus, MarketplaceListing, PrismaClient } from "@nusa-nft/database"
import { NusaNFT, MarketplaceFacet } from "@nusa-nft/smart-contract/typechain-types"
import { TransferSingleEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/NusaNFT";
import { ethers } from "ethers";
import { getItemActivities, login, uploadMetadataToIpfs } from "../lib/rest-api";
import retry from "async-retry";
import { NATIVE_CURRENCY } from "@nusa-nft/rest-api/src/item/web3/constants";
import { getTime, increaseTime, setTime } from "../lib/time";
import { assert, fmtFailed, fmtSuccess } from "../lib/assertions";
import { ListingAddedEvent, NewBidEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/facets/MarketplaceFacet";

// - [ ] check token owner ship
// - [ ] check if royalty paid
export async function testMarketplacAuctionListing({
  restApi,
  db,
  web3Provider,
  collectionId,
  nft,
  marketplace,
  sellerWallet,
  bidderWallet1,
  bidderWallet2
}: {
  restApi: INestApplication,
  db: PrismaClient,
  web3Provider: ethers.providers.Web3Provider,
  collectionId: number,
  nft: NusaNFT,
  marketplace: MarketplaceFacet
  sellerWallet: ethers.Wallet,
  bidderWallet1: ethers.Wallet,
  bidderWallet2: ethers.Wallet
}) {
  const creds = await login(restApi, sellerWallet);
  const quantity = 1;
  let resp =  await uploadMetadataToIpfs(restApi, creds.jwt, {
    name: 'test-item-2',
    description: 'test-description-2',
    collectionId,
    attributes: [
      {
        trait_type: 'eyes',
        nusa_attribute_type: 'PROPERTIES',
        value: 'blue',
      }
    ],
    external_link: 'test-link',
    image: `${__dirname}/../test-data/image1.png`,
    supply: quantity,
    unlockable: false,
    explicit_sensitive: false
  });
  const { ipfsUri } = resp;

  /// --------
  /// MINT NFT
  /// -------
  let tx = await nft
    .connect(sellerWallet)
    .mintTo(sellerWallet.address, ethers.constants.MaxUint256, ipfsUri, quantity);
  let receipt = await tx.wait();
  let transferSingleEvent = await receipt.events.find(ev => ev.event == 'TransferSingle') as TransferSingleEvent;
  let { id } = transferSingleEvent.args;

  await new Promise(resolve => setTimeout(resolve, 3000));

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
  assert(!!item && item.tokenId.toString() == id.toString(), fmtFailed("item minted not recorded by indexer"));
  console.log(fmtSuccess('Item minted recorded by indexer'))

  tx = await nft.connect(sellerWallet).setApprovalForAll(marketplace.address, true);
  await tx.wait();
  console.log(fmtSuccess('Set approval success'))

  let now = await getTime(web3Provider);

  const buyoutPricePerToken = 0;
  const reservePricePerToken = ethers.utils.parseEther("0.1");
  tx = await marketplace
    .connect(sellerWallet)
    .createListing({
      assetContract: nft.address,
      buyoutPricePerToken,
      reservePricePerToken,
      currencyToAccept: NATIVE_CURRENCY,
      listingType: 1,
      quantityToList: quantity,
      royaltyParams: {
        recipients: [sellerWallet.address],
        bpsPerRecipients: [500]
      },
      secondsUntilEndTime: 3600,
      startTime: now + 500,
      tokenId: id,
    })
  receipt = await tx.wait();
  let listingAddedEvent = receipt.events.find(ev => ev.event == 'ListingAdded') as ListingAddedEvent;
  let { listingId } = listingAddedEvent.args;

  let listing: MarketplaceListing;
  await retry(async () => {
    listing = await db.marketplaceListing.findFirstOrThrow({
      where: {
        id: listingId.toNumber(),
      }
    });
  }, { retries: 3 });
  assert(!!listing && listing.id.toNumber() == listingId.toNumber(), fmtFailed("listing created not recorded by indexer"));
  console.log(fmtSuccess('Listing Created and listing recorded by indexer'));

  await setTime(web3Provider, listing.startTime + 100);

  // Create bid 1
  const bid1Price = reservePricePerToken.add(ethers.utils.parseEther("0.1"));
  tx = await marketplace
    .connect(bidderWallet1)
    .bid(listingId, 1, NATIVE_CURRENCY, bid1Price, { value: bid1Price });
  receipt = await tx.wait();
  let newBidEvent = receipt.events.find(ev => ev.event == 'NewBid') as NewBidEvent;
  let { bidder, quantityWanted, currency, pricePerToken, totalPrice } = newBidEvent.args;

  let bid: Bid;
  await retry(async () => {
    bid = await db.bid.findFirstOrThrow({
      where: {
        listingId: listingId.toString(),
        bidder
      }
    })
  }, { retries: 3 });

  let notificationBidDataLister_inDb;
  await retry(async () => {
    notificationBidDataLister_inDb = await db.notificationDetailBid.findFirst({
      where: {
        lister_wallet_address: sellerWallet.toString(),
        listingId: +listingId,
      }
    })
  }, {retries: 3})

  let notificationBidDataBidder_inDb;
  await retry(async () => {
    notificationBidDataBidder_inDb = await db.notificationDetailBid.findFirst({
      where: {
        lister_wallet_address: bidder,
        listingId: +listingId,
      }
    })
  }, {retries: 3})

  assert(notificationBidDataLister_inDb != sellerWallet.toString(), fmtFailed("lister wallet address not equal"))
  assert(notificationBidDataBidder_inDb != bidder, fmtFailed("bidder wallet address not equal"))
  console.log(fmtSuccess('notification bid 1 data created'))

  assert(!!bid, fmtFailed("bid not recorded by indexer"))
  assert(bid.bidder.toLowerCase() == bidder.toLowerCase(), fmtFailed("bidder not equal"))
  assert(bid.quantityWanted.toString() == quantityWanted.toString(), fmtFailed("quantityWanted not equal"))
  assert(bid.currency.toLowerCase() == currency.toLowerCase(), fmtFailed("currency not equal"));
  assert(bid.pricePerToken.toString() == pricePerToken.toString(), fmtFailed("pricePerToken not equal"));
  assert(bid.totalPrice.toString() == totalPrice.toString(), fmtFailed("totalPrice not equal"));
  console.log(fmtSuccess('Bid 1 recorded by indexer'));

  // Create bid 2
  const bid2Price = reservePricePerToken.add(ethers.utils.parseEther("0.2"));
  tx = await marketplace
    .connect(bidderWallet2)
    .bid(listingId, 1, NATIVE_CURRENCY, bid2Price, { value: bid2Price });
  receipt = await tx.wait();
  newBidEvent = receipt.events.find(ev => ev.event == 'NewBid') as NewBidEvent;
  ({ bidder, quantityWanted, currency, pricePerToken, totalPrice } = newBidEvent.args);

  await retry(async () => {
    bid = await db.bid.findFirstOrThrow({
      where: {
        listingId: listingId.toString(),
        bidder
      }
    })
  }, { retries: 3 });
  console.log({ bid })
  assert(!!bid, fmtFailed("bid 2 not recorded by indexer"))
  assert(bid.bidder.toLowerCase() == bidder.toLowerCase(), fmtFailed("bidder 2 not equal"))
  assert(bid.quantityWanted.toString() == quantityWanted.toString(), fmtFailed("quantityWanted 2 not equal"))
  assert(bid.currency.toLowerCase() == currency.toLowerCase(), fmtFailed("currency 2 not equal"));
  assert(bid.pricePerToken.toString() == pricePerToken.toString(), fmtFailed("pricePerToken 2 not equal"));
  assert(bid.totalPrice.toString() == totalPrice.toString(), fmtFailed("totalPrice 2 not equal"));
  console.log(fmtSuccess('Bid 2 recorded by indexer'));

  notificationBidDataLister_inDb;
  await retry(async () => {
    notificationBidDataLister_inDb = await db.notificationDetailBid.findFirst({
      where: {
        lister_wallet_address: sellerWallet.toString(),
        listingId: +listingId,
      }
    })
  }, {retries: 3})

  notificationBidDataBidder_inDb;
  await retry(async () => {
    notificationBidDataBidder_inDb = await db.notificationDetailBid.findFirst({
      where: {
        lister_wallet_address: bidder,
        listingId: +listingId,
      }
    })
  }, {retries: 3})

  assert(notificationBidDataLister_inDb != sellerWallet.toString(), fmtFailed("lister wallet address not equal"))
  assert(notificationBidDataBidder_inDb != bidder, fmtFailed("bidder wallet address not equal"))
  console.log(fmtSuccess('notification bid 2 data created'))
  assert(!!bid, fmtFailed("bid not recorded by indexer"))
  assert(bid.bidder.toLowerCase() == bidder.toLowerCase(), fmtFailed("bidder not equal"))
  assert(bid.quantityWanted.toString() == quantityWanted.toString(), fmtFailed("quantityWanted not equal"))
  assert(bid.currency.toLowerCase() == currency.toLowerCase(), fmtFailed("currency not equal"));
  assert(bid.pricePerToken.toString() == pricePerToken.toString(), fmtFailed("pricePerToken not equal"));
  assert(bid.totalPrice.toString() == totalPrice.toString(), fmtFailed("totalPrice not equal"));
  console.log(fmtSuccess('Bid 2 recorded by indexer'));

  // check item activity for offer activity
  const offerParam = {page: 1, event: 'bid'}
  console.log(item)
  let itemActivities;
  itemActivities = await getItemActivities(restApi, item.id, offerParam)

  assert(itemActivities.records[0].from !== bidder, fmtFailed("bid 2 bidder in item activity different from offeror"))
  assert(itemActivities.records[1].from !== bidder, fmtFailed("bid 1 bidder in item activity different from offeror"))

  console.log(fmtSuccess('bid item activity succesfully queried'));

  // Check if item detail and item list APIs return listing and bids correctly
  // Should return highest bid
  // Bids should be ordered from highest to lowest price
  resp = await request(restApi.getHttpServer())
    .get(`/item/${item.id}`)
  let listings = resp.body.listings;
  let bids = listings[0].bids;
  assert(bids[0].pricePerToken.toString() == bid2Price.toString(), fmtFailed("pricePerToken not equal"));
  assert(bids[1].pricePerToken.toString() == bid1Price.toString(), fmtFailed("pricePerToken not equal"));
  console.log(fmtSuccess('Item detail API returns listing and bids correctly'));

  resp = await request(restApi.getHttpServer())
    .get(`/item/bids/${listing.id.toString()}`)
  assert(resp.body.records[0].pricePerToken.toString() == `${ethers.utils.formatEther(bid2Price)} MATIC`, fmtFailed("pricePerToken not equal"));
  assert(resp.body.records[1].pricePerToken.toString() == `${ethers.utils.formatEther(bid1Price)} MATIC`, fmtFailed("pricePerToken not equal"));
  console.log(fmtSuccess('Item bids API returns listing and bids correctly'));

  await setTime(web3Provider, listing.startTime + 4000);
  

  const onchainListing = await marketplace.getListing(listingId);
  now = await getTime(web3Provider);
  console.log({
    now,
    dbListing__endTime: listing.endTime,
    onchainListing__endTime: onchainListing.endTime.toNumber()
  })
  
  tx = await marketplace
    .connect(sellerWallet)
    .closeAuction(listingId, sellerWallet.address);
  receipt = await tx.wait();

  now = await getTime(web3Provider);
  await setTime(web3Provider, now + 100);

  tx = await marketplace
    .connect(bidderWallet2)
    .closeAuction(listingId, bidderWallet2.address);
  await tx.wait();
  receipt = await tx.wait();
  
  await retry(async () => {
    listing = await db.marketplaceListing.findFirstOrThrow({
      where: {
        id: listingId.toNumber(),
      }
    });
  }, { retries: 3 });
  assert(listing.status == ListingStatus.COMPLETED, fmtFailed("listing status not completed"));

  let tokenOwnershipSeller_onchain = await nft.balanceOf(sellerWallet.address, id);
  let tokenOwnershipBuyer_onchain = await nft.balanceOf(bidderWallet2.address, id);

  let tokenOwnershipSeller_db
  await retry(async () => {
    tokenOwnershipSeller_db = await db.tokenOwnerships.findFirstOrThrow({
      where: {
        contractAddress: nft.address,
        tokenId: id.toString(),
        ownerAddress: sellerWallet.address
      }
    });
  }, { retries: 3 })

  let tokenOwnershipBuyer_db
  await retry(async () => {
    tokenOwnershipBuyer_db = await db.tokenOwnerships.findFirstOrThrow({
      where: {
        contractAddress: nft.address,
        tokenId: id.toString(),
        ownerAddress: bidderWallet2.address
      }
    });
  }, { retries: 3 })
  assert(tokenOwnershipSeller_onchain.toString() == tokenOwnershipSeller_db?.quantity.toString(), fmtFailed("token ownership seller onchain not equal to db"));
  assert(tokenOwnershipBuyer_onchain.toString() == tokenOwnershipBuyer_db?.quantity.toString(), fmtFailed("token ownership buyer onchain not equal to db"));
  console.log(fmtSuccess("Auction tokenownership checks passed"));
}


