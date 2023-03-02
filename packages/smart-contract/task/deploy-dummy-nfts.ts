import { task } from "hardhat/config";

task("deploy-dummy-nfts", "Deploy dummy NFTs")
  .setAction(async (params, hre) => {
    const erc1155_dummy = await hre.ethers.getContractFactory("ERC1155_dummy");
    const erc1155 = await erc1155_dummy.deploy();

    const erc721_dummy = await hre.ethers.getContractFactory("ERC721_dummy");
    const erc721 = await erc721_dummy.deploy();

    console.log("ERC1155Dummy deployed to:", erc1155.address);
    console.log("ERC721Dummy deployed to:", erc721.address);
  });