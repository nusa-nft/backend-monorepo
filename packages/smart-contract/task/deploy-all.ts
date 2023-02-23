import { task, types } from "hardhat/config";

task("deploy-all", "Deploy all contracts")
  .addOptionalParam("platformFeeRecipient", "Marketplace platform fee recipient")
  .addOptionalParam("platformFeeBps", "Marketplace platform fee bps", 250, types.int)
  .addOptionalParam("nativeTokenWrapper", "Native Token Wrapper")
  .setAction(async (params, hre) => {
    const {
      platformFeeRecipient,
      platformFeeBps,
      nativeTokenWrapper
    } = params;

    await hre.run("deploy-marketplace", {
      platformFeeRecipient,
      platformFeeBps,
      nativeTokenWrapper
    });

    await hre.run("deploy-nft");
  });
