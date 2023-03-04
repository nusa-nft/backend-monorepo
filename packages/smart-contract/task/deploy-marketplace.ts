import { task, types } from "hardhat/config";
import ObjectsToCsv from "objects-to-csv";
import { deployDiamond } from "../scripts/deploy";
import { readFromCsv } from "../scripts/utils";

task("deploy-marketplace")
  .addOptionalParam("platformFeeRecipient", "Marketplace platform fee recipient")
  .addOptionalParam("platformFeeBps", "Marketplace platform fee bps", 250, types.int)
  .addOptionalParam("nativeTokenWrapper", "Native Token Wrapper")
  .setAction(async (params, hre) => {
    let {
      nativeTokenWrapper,
      platformFeeRecipient,
      platformFeeBps
    } = params
    const { ethers } = hre;
    console.log({ ethers });
    console.log(ethers.provider)
    const { chainId, name } = await ethers.provider.getNetwork();
    const deployedContracts = await readFromCsv("./deployed-contract.csv") as any[];
    const deployer = (await ethers.getSigners())[0];

    // Deploy 
    if (chainId == 1337) {
      console.log({ deployerAddress: deployer.address })
      // Deploy Wrapped Token
      const WrappedToken = await ethers.getContractFactory("WETH9");
      const wrappedTokenContract = await WrappedToken.deploy();
      nativeTokenWrapper = wrappedTokenContract.address;
      platformFeeRecipient = deployer.address;
    }

    // Default nativeTokenWrapper for mumbai (WMATIC)
    if (chainId == 80001) {
      nativeTokenWrapper = "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889";
    }

    // Default nativeTokenWrapper for polygon (WMATIC)
    if (chainId == 137) {
      nativeTokenWrapper = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
    }

    if (!platformFeeRecipient) {
      platformFeeRecipient = deployer.address;
    }

    const [diamond, marketplace, offers] = await deployDiamond(hre, {
      platformFeeRecipient,
      platformFeeBps,
      nativeTokenWrapper
    });

    const deployedContractInfo = [
      ...deployedContracts,
      {
        contractName: "Diamond",
        network: name,
        chainId: chainId,
        address: diamond.address,
        deployedAt: Math.floor(Date.now() / 1000),
      },
      {
        contractName: "MarketplaceFacet",
        network: name,
        chainId: chainId,
        address: marketplace.address,
        deployedAt: Math.floor(Date.now() / 1000),
      },
      {
        contractName: "OffersFacet",
        network: name,
        chainId: chainId,
        address: offers.address,
        deployedAt: Math.floor(Date.now() / 1000),
      }
    ];

    if (chainId == 1337) {
      deployedContractInfo.push({
        contractName: "WMATIC",
        network: name,
        chainId: chainId,
        address: nativeTokenWrapper,
        deployedAt: Math.floor(Date.now() / 1000),
      })
    }

    const csv = new ObjectsToCsv(deployedContractInfo);
    await csv.toDisk("./deployed-contract.csv");
  })