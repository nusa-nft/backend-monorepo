import { ethers } from "ethers";
import { task } from "hardhat/config";
import { HardhatArguments, HardhatEthersHelpers } from "hardhat/types";
import { getContractAddressByNetworkName } from "../scripts/utils";
import { MarketplaceFacet, NusaNFT, OffersFacet, WETH9 } from "../typechain-types";
import { PromiseOrValue } from "../typechain-types/common";
import { ListingAddedEventObject, ListingParamsStruct } from "../typechain-types/contracts/facets/MarketplaceFacet";
import { NewOfferEventObject, OfferParamsStruct } from "../typechain-types/contracts/facets/OffersFacet";
import { TransferSingleEventObject } from "../typechain-types/contracts/NusaNFT";

const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const MAX_EPOCH = 2147483647;
enum ListingType {
Direct = 0,
Auction = 1
}

// TODO: 
// NFT Minting
// - [x] Mint NFTs to users
// Direct Listings
// - [x] Make Direct Listings
// - [x] Buy from Direct Listings
// - [x] Cancel Direct Listing
// - [x] Make Auction Listings
// Auction Listings
// - [x] Make Auction Listings
// - [x] Make bids
// - [x] Close Auction by Seller
// - [x] Close Auction by bidder
// Offers
// - [x] Make Offers
// - [x] Cancel Offers
// - [x] Accept Offer

async function getTimestamp(ethers: HardhatEthersHelpers) {
  const blockNum = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNum);
  return block.timestamp;
}

async function increaseTime(ethers: HardhatEthersHelpers, seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

task("marketplace-simulation", "Simulate marketplace activities")
  .setAction(async (params, { ethers }) => {
    const network = await ethers.provider.getNetwork();
    if (network.chainId != 1337) {
      throw new Error("This script is only for localhost testing");
    }

    const [contractOwner, seller, buyer1, buyer2, buyer3] = await ethers.getSigners();
    console.log({ seller, buyer1, buyer2 })

    const diamondAddress = await getContractAddressByNetworkName(
      "Diamond",
      network.name
    );
    const wmaticAddress = await getContractAddressByNetworkName(
      "WMATIC",
      network.name
    );
    const nftAddress = await getContractAddressByNetworkName(
      "NusaNFT",
      network.name
    );

    const marketplace = await ethers.getContractAt("MarketplaceFacet", diamondAddress) as MarketplaceFacet;
    const offers = await ethers.getContractAt("OffersFacet", diamondAddress) as OffersFacet;
    const nft = await ethers.getContractAt("NusaNFT", nftAddress) as NusaNFT;
    const wmatic = await ethers.getContractAt("WETH9", wmaticAddress) as WETH9;

    const defaultListingParams = {
      assetContract: nft.address,
      royaltyParams: {
        recipients: [seller.address],
        bpsPerRecipients: [500]
      }
    }

    const nativeTokenWrapper = await marketplace.getNativeTokenWrapper(); 
    const platformFeeInfo = await marketplace.getPlatformFeeInfo();
    console.log({ nativeTokenWrapper, platformFeeInfo })

    // Mint NFT to Seller
    // ---------
    console.log("minting NFT")
    const NUM_NFT = 4
    const nftIds = [];
    for (let i = 0; i < NUM_NFT; i++) {
      let tx = await nft.connect(seller).mintTo(seller.address, ethers.constants.MaxUint256, "URI", i + 1);
      const receipt = await tx.wait();
      let eventTransferSingle = receipt.events?.find(event => event.event == "TransferSingle");
      let { _id, _value } = eventTransferSingle?.args as unknown as TransferSingleEventObject;
      nftIds.push(_id);
    }
    (await nft.connect(seller).setApprovalForAll(diamondAddress, true)).wait();

    // Direct Sale
    // ----------
    // - Create 1 supply sale
    let tx = await marketplace.connect(seller).createListing({
      ...defaultListingParams,
      buyoutPricePerToken: ethers.utils.parseEther("0.5"),
      reservePricePerToken: 0,
      currencyToAccept: NATIVE_TOKEN,
      listingType: ListingType.Direct,
      quantityToList: 1,
      tokenId: nftIds[0],
      startTime: await getTimestamp(ethers),
      secondsUntilEndTime: 3600
    });
    let receipt = await tx.wait();
    const directSale_1_TxHash = receipt.transactionHash;
    console.log({ directSale_1_TxHash });
    let eventListingAdded = receipt.events?.find(event => event.event == "ListingAdded");
    let { listingId } = eventListingAdded?.args as unknown as ListingAddedEventObject;

    await increaseTime(ethers, 100);

    // - Buy 1 supply sale
    tx = await marketplace.connect(buyer1).buy(
      listingId,
      buyer1.address,
      1,
      NATIVE_TOKEN,
      ethers.utils.parseEther("0.5"),
      { value: ethers.utils.parseEther("0.5") }
    );
    receipt = await tx.wait();
    const directSale_1_buy_TxHash = receipt.transactionHash;
    console.log({ directSale_1_buy_TxHash });

    // - Create 3 supply sale
    tx = await marketplace.connect(seller).createListing({
      ...defaultListingParams,
      buyoutPricePerToken: ethers.utils.parseEther("0.5"),
      reservePricePerToken: 0,
      currencyToAccept: NATIVE_TOKEN,
      listingType: ListingType.Direct,
      quantityToList: 3,
      tokenId: nftIds[2],
      startTime: await getTimestamp(ethers),
      secondsUntilEndTime: 3600
    });
    receipt = await tx.wait();
    const directSale_2_TxHash = receipt.transactionHash;
    console.log({ directSale_2_TxHash });
    eventListingAdded = receipt.events?.find(event => event.event == "ListingAdded");
    ({ listingId } = eventListingAdded?.args as unknown as ListingAddedEventObject);

    await increaseTime(ethers, 100);

    // - Buy 2
    tx = await marketplace.connect(buyer2).buy(
      listingId,
      buyer2.address,
      2,
      NATIVE_TOKEN,
      ethers.utils.parseEther("0.5").mul(2),
      { value: ethers.utils.parseEther("0.5").mul(2) }
    );
    receipt = await tx.wait();
    const directSale_2_buy1_TxHash = receipt.transactionHash;
    console.log({ directSale_2_buy1_TxHash });
    // - Buy 1
    tx = await marketplace.connect(buyer3).buy(
      listingId,
      buyer2.address,
      1,
      NATIVE_TOKEN,
      ethers.utils.parseEther("0.5"),
      { value: ethers.utils.parseEther("0.5") }
    );
    receipt = await tx.wait();
    const directSale_2_buy2_TxHash = receipt.transactionHash;
    console.log({ directSale_2_buy2_TxHash });

    // Auction Sale
    // ------------
    // - Create Auction
    tx = await marketplace.connect(seller).createListing({
      ...defaultListingParams,
      buyoutPricePerToken: 0,
      reservePricePerToken: ethers.utils.parseEther("0.1"),
      currencyToAccept: NATIVE_TOKEN,
      listingType: ListingType.Auction,
      quantityToList: 2,
      tokenId: nftIds[1],
      startTime: await getTimestamp(ethers),
      secondsUntilEndTime: 3600
    })
    receipt = await tx.wait();
    const auctionSale_TxHash = receipt.transactionHash;
    console.log({ auctionSale_TxHash });
    eventListingAdded = receipt.events?.find(event => event.event == "ListingAdded");
    ({ listingId } = eventListingAdded?.args as unknown as ListingAddedEventObject);

    await increaseTime(ethers, 100);

    // - Bid
    tx = await marketplace.connect(buyer1).bid(
      listingId,
      2,
      NATIVE_TOKEN,
      ethers.utils.parseEther("0.2"),
      { value: ethers.utils.parseEther("0.2").mul(2) }
    );
    receipt = await tx.wait();
    const auctionSale_bid1_txHash = receipt.transactionHash;
    console.log({ auctionSale_bid1_txHash });
    // - Bid
    tx = await marketplace.connect(buyer2).bid(
      listingId,
      2,
      NATIVE_TOKEN,
      ethers.utils.parseEther("0.3"),
      { value: ethers.utils.parseEther("0.3").mul(2) }
    );
    receipt = await tx.wait();
    const auctionSale_bid2_txHash = receipt.transactionHash;
    console.log({ auctionSale_bid2_txHash });
    // - Bid
    tx = await marketplace.connect(buyer3).bid(
      listingId,
      2,
      NATIVE_TOKEN,
      ethers.utils.parseEther("0.4"),
      { value: ethers.utils.parseEther("0.4").mul(2) }
    );
    await tx.wait();
    receipt = await tx.wait();
    const auctionSale_bid3_txHash = receipt.transactionHash;
    console.log({ auctionSale_bid3_txHash });

    const listing = await marketplace.getListing(listingId);
    let time = await getTimestamp(ethers);
    const timeDiff = listing.endTime.sub(time);

    await increaseTime(ethers, timeDiff.toNumber() + 500);
    time = await getTimestamp(ethers);
    // - Close by seller
    tx = await marketplace.connect(seller).closeAuction(
      listingId,
      seller.address,
    );
    receipt = await tx.wait();
    const auctionSale_close_seller_txHash = receipt.transactionHash;
    console.log({ auctionSale_close_seller_txHash });

    // - Close by winning bidder
    await increaseTime(ethers, 100); // need to increase time, because endTime is updated on previous close
    tx = await marketplace.connect(buyer3).closeAuction(
      listingId,
      buyer3.address,
    );
    await tx.wait();
    receipt = await tx.wait();
    const auctionSale_close_bidder_txHash = receipt.transactionHash;
    console.log({ auctionSale_close_bidder_txHash });


    // - Create Auction
    tx = await marketplace.connect(seller).createListing({
      ...defaultListingParams,
      buyoutPricePerToken: 0,
      reservePricePerToken: ethers.utils.parseEther("0.1"),
      currencyToAccept: NATIVE_TOKEN,
      listingType: ListingType.Direct,
      quantityToList: 4,
      tokenId: nftIds[3],
      startTime: await getTimestamp(ethers),
      secondsUntilEndTime: 3600
    })
    receipt = await tx.wait();
    const auctionSale_2_TxHash = receipt.transactionHash;
    console.log({ auctionSale_2_TxHash });
    eventListingAdded = receipt.events?.find(event => event.event == "ListingAdded");
    ({ listingId } = eventListingAdded?.args as unknown as ListingAddedEventObject);
    // - Cancel Auction
    tx = await marketplace.connect(seller).cancelListing(listingId);
    receipt = await tx.wait();
    const auctionSale_2_cancel_TxHash = receipt.transactionHash;
    console.log({ auctionSale_2_cancel_TxHash });

    // Offer
    // -----
    // wrap token
    tx = await wmatic.connect(buyer2).deposit({ value: ethers.utils.parseEther("5") });
    receipt = await tx.wait();
    const wmaticDeposit_TxHash = receipt.transactionHash;
    console.log({ wmaticDeposit_TxHash });
    // approve wrapped token
    tx = await wmatic.connect(buyer2).approve(diamondAddress, ethers.utils.parseEther("5"));
    receipt = await tx.wait();
    const wmaticApprove_TxHash = receipt.transactionHash;
    console.log({ wmaticApprove_TxHash });
    // - Make Offer
    tx = await offers.connect(buyer2).offer({
      ...defaultListingParams,
      currency: wmaticAddress,
      expirationTimestamp: ethers.constants.MaxUint256.sub(10000),
      quantity: 2,
      tokenId: nftIds[3],
      totalPrice: ethers.utils.parseEther("1"),
    })
    receipt = await tx.wait();
    const offer_txHash = receipt.transactionHash;
    console.log({ offer_txHash });
    let eventNewOffer = receipt.events?.find(event => event.event == "NewOffer");
    let { offerId } = eventNewOffer?.args as unknown as NewOfferEventObject;
    // - Accept Offer
    tx = await offers.connect(seller).acceptOffer(offerId);
    receipt = await tx.wait();
    const offer_accept_txHash = receipt.transactionHash;
    console.log({ offer_accept_txHash });

    // - Make Offer
    tx = await offers.connect(buyer2).offer({
      ...defaultListingParams,
      currency: wmaticAddress,
      expirationTimestamp: ethers.constants.MaxUint256.sub(10000),
      quantity: 2,
      tokenId: nftIds[3],
      totalPrice: ethers.utils.parseEther("1"),
    })
    receipt = await tx.wait();
    const offer_2_txHash = receipt.transactionHash;
    console.log({ offer_2_txHash });
    eventNewOffer = receipt.events?.find(event => event.event == "NewOffer");
    ({ offerId } = eventNewOffer?.args as unknown as NewOfferEventObject);
    // - Cancel Offer
    tx = await offers.connect(buyer2).cancelOffer(offerId);
    receipt = await tx.wait();
    const offer_2_cancel_txHash = receipt.transactionHash;
    console.log({ offer_2_cancel_txHash });
  })
