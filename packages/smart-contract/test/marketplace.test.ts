import hre from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Diamond, LibRoyalty__factory, MarketplaceFacet, NusaNFT, NusaNFT__factory, OffersFacet, WETH9 } from "../typechain-types";
import { ListingAddedEventObject, ListingUpdatedEventObject } from "../typechain-types/contracts/interfaces/INusaMarketplace";
import { ethers } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { NewOfferEventObject } from "../typechain-types/contracts/interfaces/INusaOffers";
import { deployDiamond } from "../scripts/deploy";

enum OfferStatus {
  UNSET = 0,
  CREATED = 1,
  COMPLETED = 2,
  CANCELLED = 3
};

enum ListingStatus {
  UNSET = 0,
  CREATED = 1,
  COMPLETED = 2,
  CANCELLED = 3
}

describe("Marketplace Test", async () => {
  const NAME = 'NusaNFT';
  const SYMBOL = 'NNFT';

  const PLATFORM_FEE_BPS = 250 // 2.5%
  const MAX_EPOCH = 2147483647;
  const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const MAX_BPS = 10_000;

  const NFT_PRICE = ethers.utils.parseEther("0.001");
  const NFT_PRICE_UPDATED = NFT_PRICE.add(ethers.utils.parseEther("0.001"));
  const AUCTION_RESERVE_PRICE = ethers.utils.parseEther("0.0001");
  const BID_PRICE = hre.ethers.utils.parseEther("0.0005");
  const ROYALTY_BPS_1 = 500;
  const ROYALTY_BPS_2 = 500;

  let nftContract: NusaNFT;
  let diamond: Diamond;
  let marketplace: MarketplaceFacet;
  let offers: OffersFacet;
  let wrappedTokenContract: WETH9;

  let facets: Record<string, ethers.BaseContract> = {};

  let contractOwner: SignerWithAddress;
  let nftMinter: SignerWithAddress;
  let nftBuyer: SignerWithAddress;
  let nftRoyaltyRecipient1: SignerWithAddress;
  let nftRoyaltyRecipient2: SignerWithAddress;
  let nftRoyaltyRecipient1__StartBalance: ethers.BigNumberish;
  let nftRoyaltyRecipient2__StartBalance: ethers.BigNumberish;
  let contractOwner__StartBalance: ethers.BigNumberish;

  let createdListingId_0: ethers.BigNumberish;
  let createdListingId_1: ethers.BigNumberish;

  let createdOfferId_0: ethers.BigNumberish;

  before(async () => {
    [
      contractOwner,
      nftMinter,
      nftBuyer,
      nftRoyaltyRecipient1,
      nftRoyaltyRecipient2
    ] = await hre.ethers.getSigners();

    // Deploy NFT Contract Logic
    const NusaNFT = await hre.ethers.getContractFactory("NusaNFT");
    const nftContractLogic = await NusaNFT.deploy();
    // encode initialize data
    const nusaNFTInitializeData = nftContractLogic.interface.encodeFunctionData("initialize", [
      NAME,
      SYMBOL
    ]);
    // Deploy proxy and pass in logic initialize data
    const ProxyNusaNFT = await hre.ethers.getContractFactory("ProxyNusaNFT");
    const proxy = await ProxyNusaNFT.deploy(nftContractLogic.address, nusaNFTInitializeData) as NusaNFT;
    nftContract = NusaNFT__factory.connect(proxy.address, contractOwner);

    // Deploy Wrap Token
    const WrappedToken = await hre.ethers.getContractFactory("WETH9");
    wrappedTokenContract = await WrappedToken.deploy();

    [diamond, marketplace, offers] = await deployDiamond(hre, {
      platformFeeRecipient: contractOwner.address,
      platformFeeBps: PLATFORM_FEE_BPS,
      nativeTokenWrapper: wrappedTokenContract.address
    });

    // Mint an NFT
    (await nftContract.connect(nftMinter).mintTo(
      nftMinter.address,
      hre.ethers.constants.MaxUint256,
      "tokenURI",
      10,
    )).wait();
    // Set approval to Marketplace 
    (await nftContract.connect(nftMinter).setApprovalForAll(diamond.address, true)).wait();

    // Mint some wrappedToken to nftBuyer
    (await (wrappedTokenContract
      .connect(nftBuyer)
      .deposit({
        value: ethers.utils.parseEther("1")
      })
    )).wait();
    // Approve to diamond address for making offers
    (await (wrappedTokenContract
      .connect(nftBuyer)
      .approve(diamond.address, ethers.utils.parseEther("1"))
    )).wait();
  });

  it("deploys correctly", async () => {
    expect(nftContract.address).to.not.be.undefined;
    expect(marketplace.address).to.not.be.undefined;

    const [recipient, bps] = await marketplace.attach(diamond.address).getPlatformFeeInfo();
    const nativeTokenWrapper = await marketplace.attach(diamond.address).getNativeTokenWrapper();

    expect(recipient).to.equal(contractOwner.address);
    expect(bps).to.equal(PLATFORM_FEE_BPS);
    expect(nativeTokenWrapper).to.equal(wrappedTokenContract.address);
  });

  describe("Direct Listing", async () => {
    it("Create direct listing", async () => {
      const startTime = (await time.latest() + 500);
      const listingParams = {
        assetContract: nftContract.address,
        tokenId: 0,
        listingType: 0, // Direct Listing
        buyoutPricePerToken: NFT_PRICE,
        reservePricePerToken: 0,
        quantityToList: 1,
        currencyToAccept: NATIVE_TOKEN,
        secondsUntilEndTime: MAX_EPOCH,
        startTime: startTime,
        royaltyParams: {
          recipients: [
            nftRoyaltyRecipient1.address,
            nftRoyaltyRecipient2.address
          ],
          bpsPerRecipients: [
            ROYALTY_BPS_1,
            ROYALTY_BPS_2
          ]
        },
      }
      let tx = await marketplace
        .attach(diamond.address)
        .connect(nftMinter)
        .createListing(listingParams);

      const receipt = await tx.wait();
      const eventListingAdded = receipt.events?.find(event => event.event == "ListingAdded");
      const { listingId } = eventListingAdded?.args as unknown as ListingAddedEventObject;
      createdListingId_0 = listingId;

      const listing = await marketplace.attach(diamond.address).getListing(listingId);
      expect(listing.assetContract).to.equal(listingParams.assetContract);
      expect(listing.tokenId).to.equal(listingParams.tokenId);
      expect(listing.buyoutPricePerToken).to.equal(listingParams.buyoutPricePerToken);
      expect(listing.reservePricePerToken).to.equal(listingParams.reservePricePerToken);
      expect(listing.quantity).to.equal(listingParams.quantityToList);
      expect(listing.currency).to.equal(listingParams.currencyToAccept);
      expect(listing.startTime).to.equal(listingParams.startTime);
      expect(listing.endTime).to.equal(listing.startTime.add(listingParams.secondsUntilEndTime));
    })

    it("Update direct listing", async () => {
      const startTime = (await time.latest() + 500);
      const listingParams = {
        assetContract: nftContract.address,
        tokenId: 0,
        listingType: 0, // Direct Listing
        buyoutPricePerToken: NFT_PRICE_UPDATED,
        reservePricePerToken: 0,
        quantityToList: 2,
        currencyToAccept: NATIVE_TOKEN,
        secondsUntilEndTime: MAX_EPOCH,
        startTime: startTime,
        royaltyParams: {
          recipients: [
            nftRoyaltyRecipient1.address,
            nftRoyaltyRecipient2.address
          ],
          bpsPerRecipients: [
            ROYALTY_BPS_1,
            ROYALTY_BPS_2
          ]
        },
      }
      let tx = await marketplace
        .attach(diamond.address)
        .connect(nftMinter)
        .updateListing(createdListingId_0, listingParams);

      const receipt = await tx.wait();
      const eventListingAdded = receipt.events?.find(event => event.event == "ListingUpdated");
      const { listingId } = eventListingAdded?.args as unknown as ListingUpdatedEventObject;

      const listing = await marketplace.attach(diamond.address).getListing(listingId);
      expect(listing.assetContract).to.equal(listingParams.assetContract);
      expect(listing.tokenId).to.equal(listingParams.tokenId);
      expect(listing.buyoutPricePerToken).to.equal(listingParams.buyoutPricePerToken);
      expect(listing.reservePricePerToken).to.equal(listingParams.reservePricePerToken);
      expect(listing.quantity).to.equal(listingParams.quantityToList);
      expect(listing.currency).to.equal(listingParams.currencyToAccept);
      expect(listing.startTime).to.equal(listingParams.startTime);
      expect(listing.endTime).to.equal(listing.startTime.add(listingParams.secondsUntilEndTime));
    })

    it("Buys direct listing, tokens are transferred to buyer from seller", async () => {
      await time.increase(1000);
      nftRoyaltyRecipient1__StartBalance = await hre.ethers.provider.getBalance(nftRoyaltyRecipient1.address);
      nftRoyaltyRecipient2__StartBalance = await hre.ethers.provider.getBalance(nftRoyaltyRecipient2.address);
      contractOwner__StartBalance = await hre.ethers.provider.getBalance(contractOwner.address);

      let tx = await marketplace
        .attach(diamond.address)
        .connect(nftBuyer)
        .buy(
          createdListingId_0,
          nftBuyer.address,
          2, // quantity
          NATIVE_TOKEN,
          NFT_PRICE_UPDATED.mul(2), // totalPrice
          {
            value: NFT_PRICE_UPDATED.mul(2)
          }
        )
      const receipt = await tx.wait();
      const events = receipt.events?.find(event => event.address == diamond.address);
      // console.log({ events })
      const royalty = await hre.ethers.getContractAt("LibRoyalty", diamond.address);
      receipt.events?.forEach(e => {
        try {
          const decoded = royalty.interface.decodeEventLog(
            'RoyaltyPaid',
            e.data,
            e.topics
          )
          console.log({ decoded })
        } catch (err) { }
      })


      const nftBalanceOfSeller = await nftContract.balanceOf(nftMinter.address, 0);
      const nftBalanceOfBuyer = await nftContract.balanceOf(nftBuyer.address, 0);

      expect(nftBalanceOfSeller).to.equal(ethers.BigNumber.from(10 - 2))
      expect(nftBalanceOfBuyer).to.equal(ethers.BigNumber.from(2))

      const listing = await marketplace.attach(diamond.address).getListing(createdListingId_0);
      expect(listing.status).to.equal(ListingStatus.COMPLETED);
    })

    it("Fees are distributed correctly", async () => {
      const nftBoughtFor = NFT_PRICE_UPDATED.mul(2); 

      const royaltyExpected1 = nftBoughtFor.mul(ROYALTY_BPS_1).div(MAX_BPS);
      const royaltyExpected2 = nftBoughtFor.mul(ROYALTY_BPS_2).div(MAX_BPS);
      const platformFeeExpected = nftBoughtFor.mul(PLATFORM_FEE_BPS).div(MAX_BPS);

      const nftRoyaltyRecipient1__Balance = await hre.ethers.provider.getBalance(nftRoyaltyRecipient1.address);
      const nftRoyaltyRecipient2__Balance = await hre.ethers.provider.getBalance(nftRoyaltyRecipient2.address);
      const contractOwner__Balance = await hre.ethers.provider.getBalance(contractOwner.address);

      expect(nftRoyaltyRecipient1__Balance.sub(nftRoyaltyRecipient1__StartBalance)).to.equal(royaltyExpected1);
      expect(nftRoyaltyRecipient2__Balance.sub(nftRoyaltyRecipient2__StartBalance)).to.equal(royaltyExpected2);
      expect(contractOwner__Balance.sub(contractOwner__StartBalance)).to.equal(platformFeeExpected);
    })

    it("Cancel direct listing", async () => {
      const startTime = (await time.latest() + 500);
      const listingParams = {
        assetContract: nftContract.address,
        tokenId: 0,
        listingType: 0, // Direct Listing
        buyoutPricePerToken: NFT_PRICE,
        reservePricePerToken: 0,
        quantityToList: 1,
        currencyToAccept: NATIVE_TOKEN,
        secondsUntilEndTime: MAX_EPOCH,
        startTime: startTime,
        royaltyParams: {
          recipients: [
            nftRoyaltyRecipient1.address,
            nftRoyaltyRecipient2.address
          ],
          bpsPerRecipients: [
            ROYALTY_BPS_1,
            ROYALTY_BPS_2
          ]
        },
      }
      let tx = await marketplace
        .attach(diamond.address)
        .connect(nftMinter)
        .createListing(listingParams);

      const receipt = await tx.wait();
      const eventListingAdded = receipt.events?.find(event => event.event == "ListingAdded");
      const { listingId } = eventListingAdded?.args as unknown as ListingAddedEventObject;

      tx = await marketplace
        .attach(diamond.address)
        .connect(nftMinter)
        .cancelListing(listingId);
      await tx.wait();
      const listing = await marketplace.attach(diamond.address).getListing(listingId);
      
      expect(listing.status).to.equal(ListingStatus.CANCELLED);
    })
  })


  describe("Auction listing", async () => {
    it("Create auction listing", async () => {
      const startTime = (await time.latest() + 500);
      const listingParams = {
        assetContract: nftContract.address,
        tokenId: 0,
        listingType: 1, // Auction Listing
        // buyoutPricePerToken: hre.ethers.constants.MaxUint256,
        buyoutPricePerToken: 0,
        reservePricePerToken: AUCTION_RESERVE_PRICE,
        quantityToList: 2,
        currencyToAccept: NATIVE_TOKEN,
        secondsUntilEndTime: 2000,
        startTime: startTime,
        royaltyParams: {
          recipients: [
            nftRoyaltyRecipient1.address,
            nftRoyaltyRecipient2.address
          ],
          bpsPerRecipients: [
            ROYALTY_BPS_1,
            ROYALTY_BPS_2
          ]
        },
      }
      let tx = await marketplace
        .attach(diamond.address)
        .connect(nftMinter)
        .createListing(listingParams);

      const receipt = await tx.wait();
      const eventListingAdded = receipt.events?.find(event => event.event == "ListingAdded");
      const { listingId } = eventListingAdded?.args as unknown as ListingAddedEventObject;
      createdListingId_1 = listingId;

      const listing = await marketplace.attach(diamond.address).getListing(listingId);
      expect(listing.assetContract).to.equal(listingParams.assetContract);
      expect(listing.tokenId).to.equal(listingParams.tokenId);
      expect(listing.buyoutPricePerToken).to.equal(listingParams.buyoutPricePerToken);
      expect(listing.reservePricePerToken).to.equal(listingParams.reservePricePerToken);
      expect(listing.quantity).to.equal(listingParams.quantityToList);
      expect(listing.currency).to.equal(listingParams.currencyToAccept);
      expect(listing.startTime).to.equal(listingParams.startTime);
      // expect(listing.endTime).to.equal(listing.startTime.add(listingParams.secondsUntilEndTime));
    })

    it("Bid", async () => {
      await time.increase(1000);
      let tx = await marketplace
        .attach(diamond.address)
        .connect(nftBuyer)
        .bid(
          createdListingId_1,
          2,
          NATIVE_TOKEN,
          BID_PRICE,
          {
            value: BID_PRICE.mul(2)
          }
        );
        await tx.wait();
    })

    it("Fees distributed properly on close by seller", async () => {
      await time.increase(3000);
      // Close auction by Seller
      const sellerBalanceBeforeClose = await hre.ethers.provider.getBalance(nftMinter.address);
      const contractOwnerBalanceBeforeClose = await hre.ethers.provider.getBalance(contractOwner.address);
      const royaltyRecipient1BalanceBeforeClose = await hre.ethers.provider.getBalance(nftRoyaltyRecipient1.address);
      const royaltyRecipient2BalanceBeforeClose = await hre.ethers.provider.getBalance(nftRoyaltyRecipient2.address);
      let tx = await marketplace
        .attach(diamond.address)
        .connect(nftMinter)
        .closeAuction(createdListingId_1, nftMinter.address);
      let receipt = await tx.wait();
      const gasUsedBySeller = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      const sellerBalanceAfterClose = await hre.ethers.provider.getBalance(nftMinter.address);
      const contractOwnerBalanceAfterClose = await hre.ethers.provider.getBalance(contractOwner.address);
      const royaltyRecipient1BalanceAfterClose = await hre.ethers.provider.getBalance(nftRoyaltyRecipient1.address);
      const royaltyRecipient2BalanceAfterClose = await hre.ethers.provider.getBalance(nftRoyaltyRecipient2.address);

      const nftBoughtFor = BID_PRICE.mul(2); 
      const royaltyExpected1 = nftBoughtFor.mul(ROYALTY_BPS_1).div(MAX_BPS);
      const royaltyExpected2 = nftBoughtFor.mul(ROYALTY_BPS_2).div(MAX_BPS);
      const platformFeeExpected = nftBoughtFor.mul(PLATFORM_FEE_BPS).div(MAX_BPS);
      const totalFees = royaltyExpected1.add(royaltyExpected2).add(platformFeeExpected);

      const expectedSellerBalance = sellerBalanceBeforeClose
        .add(nftBoughtFor)
        .sub(totalFees)
        .sub(gasUsedBySeller);
      const expectedContractOwnerBalance = contractOwnerBalanceBeforeClose
        .add(platformFeeExpected);
      const expectedRoyaltyRecipient1Balance = royaltyRecipient1BalanceBeforeClose
        .add(royaltyExpected1);
      const expectedRoyaltyRecipient2Balance = royaltyRecipient2BalanceBeforeClose
        .add(royaltyExpected2);

      expect(sellerBalanceAfterClose).to.equal(expectedSellerBalance, "Seller receives incorrect amount");
      expect(contractOwnerBalanceAfterClose).to.equal(expectedContractOwnerBalance, "Contract owner receives incorrect platform fee");
      expect(royaltyRecipient1BalanceAfterClose).to.equal(expectedRoyaltyRecipient1Balance, "Royalty recipient 1 received incorrect amount");
      expect(royaltyRecipient2BalanceAfterClose).to.equal(expectedRoyaltyRecipient2Balance, "Royalty recipient 2 received incorrect amount");
    })

    it("NFT transferred correctly on close by winning bidder", async () => {
      // Close auction by Winning Bidder
      const nftBalanceBeforeClose = await nftContract.balanceOf(nftBuyer.address, 0);
      let tx = await marketplace
        .attach(diamond.address)
        .connect(nftBuyer)
        .closeAuction(createdListingId_1, nftBuyer.address);
      await tx.wait();
      const nftBalanceAfterClose = await nftContract.balanceOf(nftBuyer.address, 0);

      expect(nftBalanceAfterClose).to.equal(nftBalanceBeforeClose.add(2), "Incorrect NFT transferred to winning bidder");
    })
  })

  describe("Offers", async () => {
    let nftBuyerNftBalanceBeforeOfferAccepted: ethers.BigNumber;

    it("Create an offer", async () => {
      nftBuyerNftBalanceBeforeOfferAccepted = await nftContract.balanceOf(nftBuyer.address, 0);

      const offerParam = {
        assetContract: nftContract.address,
        tokenId: 0,
        quantity: 3,
        currency: wrappedTokenContract.address, // Offers have to use ERC20 tokens
        totalPrice: NFT_PRICE.mul(3),
        expirationTimestamp: ethers.constants.MaxUint256.sub(3600),
        royaltyParams: {
          recipients: [
            nftRoyaltyRecipient1.address,
            nftRoyaltyRecipient2.address
          ],
          bpsPerRecipients: [
            ROYALTY_BPS_1,
            ROYALTY_BPS_2
          ]
        }
      }
      let tx = await offers
        .attach(diamond.address)
        .connect(nftBuyer)
        .offer(offerParam);
      const receipt = await tx.wait();
      const eventNewOffer = receipt.events?.find(event => event.event == "NewOffer");
      const { offerId } = eventNewOffer?.args as unknown as NewOfferEventObject;
      createdOfferId_0 = offerId;

      const offer = await offers.attach(diamond.address).getOffer(createdOfferId_0);
      expect(offer.assetContract).to.equal(offerParam.assetContract);
      expect(offer.tokenId).to.equal(offerParam.tokenId);
      expect(offer.quantity).to.equal(offerParam.quantity);
      expect(offer.totalPrice).to.equal(offerParam.totalPrice);
      expect(offer.expirationTimestamp).to.equal(offerParam.expirationTimestamp);
    })

    it("Fees distributed properly on Accept Offer", async () => {
      await time.increase(3000);
      const sellerBalanceBeforeAccept = await wrappedTokenContract.balanceOf(nftMinter.address);
      const contractOwnerBalanceBeforeAccept = await wrappedTokenContract.balanceOf(contractOwner.address);
      const royaltyRecipient1BalanceBeforeAccept = await wrappedTokenContract.balanceOf(nftRoyaltyRecipient1.address);
      const royaltyRecipient2BalanceBeforeAccept = await wrappedTokenContract.balanceOf(nftRoyaltyRecipient2.address);

      let tx = await offers
        .attach(diamond.address)
        .connect(nftMinter)
        .acceptOffer(createdOfferId_0);
      const receipt = await tx.wait();
      // const gasUsedBySeller = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      const sellerBalanceAfterAccept = await wrappedTokenContract.balanceOf(nftMinter.address);
      const contractOwnerBalanceAfterAccept = await wrappedTokenContract.balanceOf(contractOwner.address);
      const royaltyRecipient1BalanceAfterAccept = await wrappedTokenContract.balanceOf(nftRoyaltyRecipient1.address);
      const royaltyRecipient2BalanceAfterAccept = await wrappedTokenContract.balanceOf(nftRoyaltyRecipient2.address);

      const nftBoughtFor = NFT_PRICE.mul(3); 
      const royaltyExpected1 = nftBoughtFor.mul(ROYALTY_BPS_1).div(MAX_BPS);
      const royaltyExpected2 = nftBoughtFor.mul(ROYALTY_BPS_2).div(MAX_BPS);
      const platformFeeExpected = nftBoughtFor.mul(PLATFORM_FEE_BPS).div(MAX_BPS);
      const totalFees = royaltyExpected1.add(royaltyExpected2).add(platformFeeExpected);

      const expectedSellerBalance = sellerBalanceBeforeAccept
        .add(nftBoughtFor)
        .sub(totalFees)
      const expectedContractOwnerBalance = contractOwnerBalanceBeforeAccept
        .add(platformFeeExpected);
      const expectedRoyaltyRecipient1Balance = royaltyRecipient1BalanceBeforeAccept
        .add(royaltyExpected1);
      const expectedRoyaltyRecipient2Balance = royaltyRecipient2BalanceBeforeAccept
        .add(royaltyExpected2);

      expect(sellerBalanceAfterAccept).to.equal(expectedSellerBalance, "Seller receives incorrect amount");
      expect(contractOwnerBalanceAfterAccept).to.equal(expectedContractOwnerBalance, "Contract owner receives incorrect platform fee");
      expect(royaltyRecipient1BalanceAfterAccept).to.equal(expectedRoyaltyRecipient1Balance, "Royalty recipient 1 received incorrect amount");
      expect(royaltyRecipient2BalanceAfterAccept).to.equal(expectedRoyaltyRecipient2Balance, "Royalty recipient 2 received incorrect amount");
    })

    it("NFT transferred correctly on Offer Accepted", async () => {
      const nftBuyerBalanceAfterOfferAccepted = await nftContract.balanceOf(nftBuyer.address, 0);
      expect(nftBuyerBalanceAfterOfferAccepted).to.equal(nftBuyerNftBalanceBeforeOfferAccepted.add(3));
    })

    it("Cancel an offer", async () => {
      const offerParam = {
        assetContract: nftContract.address,
        tokenId: 0,
        quantity: 3,
        currency: wrappedTokenContract.address, // Offers have to use ERC20 tokens
        totalPrice: NFT_PRICE.mul(3),
        expirationTimestamp: ethers.constants.MaxUint256.sub(3600),
        royaltyParams: {
          recipients: [
            nftRoyaltyRecipient1.address,
            nftRoyaltyRecipient2.address
          ],
          bpsPerRecipients: [
            ROYALTY_BPS_1,
            ROYALTY_BPS_2
          ]
        }
      }
      let tx = await offers
        .attach(diamond.address)
        .connect(nftBuyer)
        .offer(offerParam);
      const receipt = await tx.wait();
      const eventNewOffer = receipt.events?.find(event => event.event == "NewOffer");
      const { offerId } = eventNewOffer?.args as unknown as NewOfferEventObject;

      tx = await offers
        .attach(diamond.address)
        .connect(nftBuyer)
        .cancelOffer(offerId);
      await tx.wait();

      const offer = await offers.attach(diamond.address).getOffer(offerId);
      expect(offer.status).to.equal(OfferStatus.CANCELLED);
    })
  })


  // it("Create direct listing, create an offer, accept the offer, and distributes Royalties correctly", async () => {
  //   // Mint an NFT
  //   (await nftContract.connect(nftMinter).mintTo(
  //     nftMinter.address,
  //     hre.ethers.constants.MaxUint256,
  //     "tokenURI",
  //     1,
  //   )).wait();

  //   const blockNumber = await hre.ethers.provider.getBlockNumber();
  //   const block = await hre.ethers.provider.getBlock(blockNumber);

  //   // Create Listing
  //   let tx = await marketplaceContract.connect(nftMinter).createListing({
  //     assetContract: nftContract.address,
  //     tokenId: 2,
  //     listingType: 0, // Direct Listing
  //     buyoutPricePerToken: NFT_PRICE,
  //     reservePricePerToken: 0,
  //     quantityToList: 1,
  //     currencyToAccept: NATIVE_TOKEN,
  //     secondsUntilEndTime: MAX_EPOCH,
  //     startTime: block.timestamp,
  //     listingRoyalty: {
  //       recipients: [
  //         nftRoyaltyRecipient1.address,
  //         nftRoyaltyRecipient2.address
  //       ],
  //       bpsPerRecipients: [
  //         ROYALTY_BPS_1,
  //         ROYALTY_BPS_2
  //       ]
  //     },
  //   });
  //   let receipt = await tx.wait();
  //   const eventListingAdded = receipt.events?.find(event => event.event == "ListingAdded");
  //   const { listingId } = eventListingAdded?.args as unknown as ListingAddedEventObject;

  //   // Creating a direct listing offer requires user to wrap the native token to erc20
  //   tx = await wrappedTokenContract.connect(nftBuyer).deposit({ value: NFT_PRICE });
  //   await tx.wait();
  //   tx = await wrappedTokenContract.connect(nftBuyer).approve(marketplaceContract.address, NFT_PRICE);
  //   await tx.wait()

  //   tx = await marketplaceContract.connect(nftBuyer).offer(
  //     listingId,
  //     1,
  //     wrappedTokenContract.address,
  //     // NATIVE_TOKEN,
  //     NFT_PRICE,
  //     block.timestamp + 1000,
  //   );
  //   await tx.wait();

  //   tx = await marketplaceContract.connect(nftMinter).acceptOffer(
  //     listingId,
  //     nftBuyer.address,
  //     wrappedTokenContract.address,
  //     NFT_PRICE
  //   )
  //   await tx.wait();
  // })

  // it("Can make offer on items not listed", async () => {

  // })
})