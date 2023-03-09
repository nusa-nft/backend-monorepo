import { INestApplication } from "@nestjs/common";
import { Item, ListingStatus, MarketplaceListing, PrismaClient } from "@nusa-nft/database";
import { NATIVE_CURRENCY } from "@nusa-nft/rest-api/src/item/web3/constants";
import { MarketplaceFacet, NusaNFT } from "@nusa-nft/smart-contract/typechain-types";
import { ListingAddedEvent, ListingRemovedEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/facets/MarketplaceFacet";
import { TransferSingleEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/NusaNFT";
import { ethers } from "ethers";
import { login, uploadMetadataToIpfs } from "../lib/rest-api";
import retry from 'async-retry';
import { fmtFailed, assert, fmtSuccess } from "../lib/assertions";
import request from "supertest";

export async function testMarketplaceDirectListing({
  restApi,
  db,
  collectionId,
  sellerWallet,
  buyerWallet,
  nft,
  marketplace
}: {
  restApi: INestApplication,
  db: PrismaClient,
  collectionId: number,
  sellerWallet: ethers.Wallet,
  buyerWallet: ethers.Wallet,
  nft: NusaNFT,
  marketplace: MarketplaceFacet
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

  let tx = await nft
    .connect(sellerWallet)
    .mintTo(sellerWallet.address, ethers.constants.MaxUint256, ipfsUri, quantity);
  let receipt = await tx.wait();
  let transferSingleEvent = await receipt.events.find(ev => ev.event == 'TransferSingle') as TransferSingleEvent;
  let { id } = transferSingleEvent.args;
  console.log({ marketplaceAddress: marketplace.address })

  tx = await nft.connect(sellerWallet).setApprovalForAll(marketplace.address, true);
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

  tx = await marketplace.connect(sellerWallet).createListing({
    assetContract: nft.address,
    buyoutPricePerToken: ethers.utils.parseEther("0.5"),
    reservePricePerToken: 0,
    currencyToAccept: NATIVE_CURRENCY,
    listingType: 0,
    quantityToList: quantity,
    royaltyParams: {
      recipients: [sellerWallet.address],
      bpsPerRecipients: [500]
    },
    secondsUntilEndTime: 2147483647,
    startTime: Math.floor(Date.now() / 1000) + 500,
    tokenId: id,
  })
  receipt = await tx.wait();
  let listingAddedEvent = await receipt.events.find(ev => ev.event == 'ListingAdded') as ListingAddedEvent;
  const { listingId } = listingAddedEvent.args;

  let listing: MarketplaceListing;
  await retry(async () => {
    listing = await db.marketplaceListing.findFirstOrThrow({
      where: { id: listingId.toNumber() }
    })
    assert(listing.status == ListingStatus.CREATED, fmtFailed('Listing status should be active'));
  }, { retries: 3 });
  console.log(fmtSuccess('Listing created successfully indexed'));

  resp = await request(restApi.getHttpServer())
    .get(`/item/${item.id}`)
  let getItem = resp.body;
  assert(getItem.listings.length == 1, fmtFailed('Item should have 1 listing'));
  console.log(fmtSuccess('Item listing returned by API successfully'));

  tx = await marketplace.connect(sellerWallet)
    .cancelListing(listingId);
  await tx.wait();
  let listingRemovedEvent = await receipt.events.find(ev => ev.event == 'ListingRemoved') as ListingRemovedEvent;

  await retry(async () => {
    listing = await db.marketplaceListing.findFirstOrThrow({
      where: { id: listingId.toNumber() }
    })
    assert(listing.status == ListingStatus.CANCELLED, fmtFailed('Listing status should be cancelled'));
  }, { retries: 5 });
  console.log(fmtSuccess('Listing cancelled successfully indexed'))

  resp = await request(restApi.getHttpServer())
    .get(`/item/${item.id}`)
  getItem = resp.body;
  assert(getItem.listings.length == 0, fmtFailed('Item should have 0 listing'));
  console.log(fmtSuccess('Item cancelled listing is not shown by API'));
}