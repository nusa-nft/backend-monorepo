import { task } from "hardhat/config";
import ObjectsToCsv from "objects-to-csv";
import { readFromCsv } from "../scripts/utils";
import { NusaNFT } from "../typechain-types";

task("deploy-nft")
  .addParam("marketplaceAddress", "Address of marketplace contract")
  .setAction(async (args, { ethers, upgrades }) => {
    const { marketplaceAddress } = args;
    const deployedContracts = await readFromCsv("./deployed-contract.csv") as any[];

    const NusaNFT = await ethers.getContractFactory("NusaNFT");
    const nft = await upgrades.deployProxy(
      NusaNFT,
      ["NusaNFT", "NNFT"],
      {
        initializer: "initialize",
        kind: "uups",
        unsafeAllow: ["constructor", "delegatecall", "state-variable-immutable"]
      }
    ) as NusaNFT;
    await nft.deployed();

    const tx = await nft.setNusaMarketplace(marketplaceAddress);
    await tx.wait();

    const network = await ethers.provider.getNetwork();
    const csv = new ObjectsToCsv([
      ...deployedContracts,
      {
        contractName: "NusaNFT",
        network: network.name,
        chainId: network.chainId,
        address: nft.address,
        deployedAt: Math.floor(Date.now() / 1000),
      }
    ]);
    await csv.toDisk("./deployed-contract.csv");
  })