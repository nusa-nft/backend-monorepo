import { task } from "hardhat/config";
import ObjectsToCsv from "objects-to-csv";
import { readFromCsv } from "../scripts/utils";

task("deploy-nft")
  .setAction(async (args, { ethers, upgrades }) => {
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
    );
    await nft.deployed();

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