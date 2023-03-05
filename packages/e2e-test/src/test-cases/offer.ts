import { INestApplication } from "@nestjs/common";
import { NusaNFT, WETH9, MarketplaceFacet, OffersFacet } from "@nusa-nft/smart-contract/typechain-types";
import { ethers } from "ethers";
import { Item, MarketplaceOffer, OfferStatus, PrismaClient, RoyaltyPaid } from "@nusa-nft/database";
import { TransferSingleEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/NusaNFT";
import { assert, fmtFailed, fmtSuccess } from "../lib/assertions";
import { login, uploadMetadataToIpfs } from "../lib/rest-api";
import retry from "async-retry";
import { AcceptedOfferEvent, NewOfferEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/facets/OffersFacet";

export async function offer({
  restApi,
  db,
  web3Provider,
  collectionId,
  marketplace,
  offers,
  nft,
  wmatic,
  minter,
  offeror
}: {
  restApi: INestApplication,
  db: PrismaClient,
  web3Provider: ethers.providers.Web3Provider;
  collectionId: number;
  marketplace: MarketplaceFacet;
  offers: OffersFacet;
  nft: NusaNFT;
  wmatic: WETH9;
  minter: ethers.Wallet;
  offeror: ethers.Wallet;
}) {
  const creds = await login(restApi, minter);
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
    .connect(minter)
    .mintTo(minter.address, ethers.constants.MaxUint256, ipfsUri, quantity);
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
  console.log(fmtSuccess('Item minted recorded by indexer'));

  tx = await wmatic.connect(offeror).deposit({ value: ethers.utils.parseEther('1') });
  await tx.wait();

  tx = await wmatic.connect(offeror).approve(marketplace.address, ethers.utils.parseEther('1'));
  await tx.wait();

  // Create offer and wait for indexer to pickup
  tx = await offers.connect(offeror).offer({
    assetContract: nft.address,
    tokenId: id,
    quantity: 1,
    currency: wmatic.address,
    expirationTimestamp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    royaltyParams: {
      recipients: [minter.address],
      bpsPerRecipients: [500]
    },
    totalPrice: ethers.utils.parseEther('1'),
  });
  receipt = await tx.wait();
  let newOfferEvent = receipt.events.find(ev => ev.event == 'NewOffer') as NewOfferEvent;
  let { offerId, assetContract, offer } = newOfferEvent.args;

  let offerInDb: MarketplaceOffer;
  await retry(async () => {
    offerInDb = await db.marketplaceOffer.findFirstOrThrow({
      where: {
        id: offerId.toNumber(),
      }
    })
  }, { retries: 3 });
  assert(!!offerInDb, fmtFailed("offer not recorded by indexer"));
  assert(offerInDb.assetContract == assetContract, fmtFailed("offer not recorded by indexer"));
  assert(offerInDb.tokenId.toString() == id.toString(), fmtFailed("offer not recorded by indexer"));
  assert(offerInDb.quantity.toNumber() == offer.quantity.toNumber(), fmtFailed("offer not recorded by indexer"));
  assert(offerInDb.currency == offer.currency, fmtFailed("offer not recorded by indexer"));
  assert(offerInDb.expirationTimestamp.toNumber() == offer.expirationTimestamp.toNumber(), fmtFailed("offer not recorded by indexer"));
  assert(offerInDb.totalPrice.toString() == offer.totalPrice.toString(), fmtFailed("offer not recorded by indexer"));
  assert(offerInDb.status == OfferStatus.CREATED, fmtFailed("offer not recorded by indexer"));
  console.log(fmtSuccess('Offer recorded by indexer'));

  tx = await nft.connect(minter).setApprovalForAll(marketplace.address, true);
  await tx.wait();

  // Accept offer and wait for indexer to pickup
  tx = await offers.connect(minter).acceptOffer(offerId);
  receipt = await tx.wait();
  let acceptedOfferEvent = receipt.events.find(ev => ev.event == 'AcceptedOffer') as AcceptedOfferEvent;
  let { seller } = acceptedOfferEvent.args;

  // Wait for indexer to pickup offer accepted
  await new Promise(resolve => setTimeout(resolve, 3000));

  await retry(async () => {
    offerInDb = await db.marketplaceOffer.findFirstOrThrow({
      where: {
        id: offerId.toNumber(),
      }
    })
  }, { retries: 3 });
  assert(offerInDb.status == OfferStatus.COMPLETED, fmtFailed("offer accepted not recorded by indexer"));
  console.log(fmtSuccess('Offer accepted recorded by indexer'));

  // Wait for indexer to pickup token ownership change
  await new Promise(resolve => setTimeout(resolve, 3000));

  let tokenOwnershipOfferor = await nft.balanceOf(offeror.address, id);
  let tokenOwnershipAcceptor = await nft.balanceOf(minter.address, id);

  let tokenOwnerhipOfferor_inDb;
  await retry(async () => {
    tokenOwnerhipOfferor_inDb = await db.tokenOwnerships.findFirst({
      where: {
        contractAddress: nft.address,
        tokenId: id.toString(),
        ownerAddress: offeror.address
      }
    });
  }, { retries: 3 });
  let tokenOwnershipAcceptor_inDb;
  await retry(async () => {
    tokenOwnershipAcceptor_inDb = await db.tokenOwnerships.findFirst({
      where: {
        contractAddress: nft.address,
        tokenId: id.toString(),
        ownerAddress: minter.address
      }
    });
  }, { retries: 3 });
  assert(tokenOwnershipOfferor.toNumber() == tokenOwnerhipOfferor_inDb.quantity, fmtFailed("tokenOwnership Offeror incorrect"));
  assert(tokenOwnershipAcceptor.toNumber() == tokenOwnershipAcceptor_inDb.quantity, fmtFailed("tokenOwnership Acceptor incorrect"));
  console.log(fmtSuccess('Token ownership recorded correctly by indexer'));

  let notificationOfferDataLister_inDb;
  await retry(async () => {
    notificationOfferDataLister_inDb = await db.notificationDetailOffer.findFirst({
      where: {
        lister_wallet_address: minter.address
      }
    })
  }, {retries: 3})

  assert(notificationOfferDataLister_inDb, fmtFailed("notification not created"))
  console.log(fmtSuccess('notification offer data created'))

  
  let royaltyPaid: RoyaltyPaid;
  await retry(async () => {
    royaltyPaid = await db.royaltyPaid.findFirstOrThrow({
      where: {
        offerId: offerId.toNumber(),
        recipient: minter.address,
      }
    });
  }, { retries: 3 })
  assert(royaltyPaid.amount.toString() == ethers.utils.parseEther("1").mul(500).div(10000).toString(), fmtFailed("royalty paid amount not equal to db"));
  assert(royaltyPaid.currency == wmatic.address, fmtFailed("royalty paid currency not equal to db"));
  console.log(fmtSuccess("Royalty paid check passed"));

  // TODO: test offer notification
  // Need to modify NotificationOfferDetails to include offerId, remove listingId
}