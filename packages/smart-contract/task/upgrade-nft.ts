import { ethers } from "ethers";
import { task, types } from "hardhat/config";

task("upgrade-nft")
  .addParam("proxyAddress", "Address of proxy contract", undefined, types.string)
  .setAction(async (taskArgs, hre) => {
    const { proxyAddress } = taskArgs;

    const NusaNFT_V2 = await hre.ethers.getContractFactory('NusaNFT');
    const v2Impl = await NusaNFT_V2.deploy();
    await v2Impl.deployed();

    const NusaNFTProxy = await hre.ethers.getContractAt('NusaNFT', proxyAddress);
    const tx = await NusaNFTProxy.upgradeTo(v2Impl.address);
    const receipt = await tx.wait();

    console.log({ receipt });


    // console.log('Upgrading NusaNFT...');
    // const upgraded = await hre.upgrades.upgradeProxy(
    //   proxyAddress,
    //   NusaNFT,
    //   {
    //     call: { fn: "reinitialize", args: ["NusaNFT_V3", "NNFT_V3", 3] },
    //     unsafeAllow: ["constructor", "delegatecall", "state-variable-immutable"]
    //   }
    // );
    // console.log('NusaNFT upgraded');
    // console.log({ upgraded });

    // =======
    // If theres a problem with the upgrade, you can force import the contract
    // Openzeppelin requires a history of previous imports
    // =======
    // const upgraded = await hre.upgrades.forceImport(
    //   proxyAddress,
    //   NusaNFT
    // )
    // console.log({ upgraded });
  });