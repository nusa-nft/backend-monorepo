import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "ethers";
import { task } from "hardhat/config";
import { getContractAddressByNetworkName } from "../scripts/utils";
import { MarketplaceFacet, NusaNFT, OffersFacet } from "../typechain-types";

task("marketplace-simulation", "Simulate marketplace activities")
  .setAction(async (params, { ethers }) => {
    const network = await ethers.provider.getNetwork();
    if (network.chainId != 1337) {
      throw new Error("This script is only for localhost testing");
    }

    const [contractOwner, user1, user2, user3] = await ethers.getSigners();

    const diamondAddress = await getContractAddressByNetworkName(
      "Diamond",
      network.name
    );
    const nftAddress = await getContractAddressByNetworkName(
      "NusaNFT",
      network.name
    );

    const marketplace = await ethers.getContractAt("MarketplaceFacet", diamondAddress) as MarketplaceFacet;
    const offers = await ethers.getContractAt("OffersFacet", diamondAddress) as OffersFacet;
    const nft = await ethers.getContractAt("NusaNFT", nftAddress) as NusaNFT;

    // TODO: 
    // NFT Minting
    // - [ ] Mint NFTs to users
    // Direct Listings
    // - [ ] Make Direct Listings
    // - [ ] Buy from Direct Listings
    // - [ ] Cancel Direct Listing
    // - [ ] Make Auction Listings
    // Auction Listings
    // - [ ] Make Auction Listings
    // - [ ] Make bids
    // - [ ] Close Auction by Seller
    // - [ ] Close Auction by bidder
    // Offers
    // - [ ] Make Offers
    // - [ ] Cancel Offers
    // - [ ] Accept Offer
  })

async function mintNft(
  nft: NusaNFT,
  {
    signer,
    to,
    tokenURI,
    qty
  }: {
    signer: ethers.Signer,
    to: string,
    tokenURI: string,
    qty: number
  }
) {
  const tx = await nft.connect(signer).mintTo(
    to,
    ethers.constants.MaxUint256,
    tokenURI,
    qty
  );
  const receipt = await tx.wait();
  return receipt;
}

async function createListing(
  marketplace: MarketplaceFacet,
  {

  }
) {

}

async function buy() {}

async function bid() {}

async function closeAuction() {}

async function makeOffer() {}

async function cancelOffer() {}

async function acceptOffer() {}