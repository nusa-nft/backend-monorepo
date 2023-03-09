import { task } from "hardhat/config";
import { NusaNFT, NusaNFT_V2 } from "../typechain-types";

task("nft-set-nusa-marketplace")
  .addParam("nftAddress", "Address of nft contract")
  .addParam("marketplaceAddress", "Address of marketplace contract")
  .setAction(async (args, { ethers }) => {
    const { nftAddress, marketplaceAddress } = args;

    const nft = await ethers.getContractAt("NusaNFT", nftAddress) as NusaNFT_V2;
    const tx = await nft.setNusaMarketplace(marketplaceAddress);
    const receipt = await tx.wait();
    console.log({ receipt });

    const _marketplaceAddress = await nft.nusaMarketplace();
    console.log("NFT Marketplace Address: set to: ", _marketplaceAddress);
  });