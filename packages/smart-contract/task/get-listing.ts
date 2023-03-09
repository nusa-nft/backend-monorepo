import { task } from "hardhat/config";

task("get-listing")
  .addParam("listingId")
  .addParam("address")
  .setAction(async (taskArgs, hre) => {
    const { listingId, address } = taskArgs;
    const marketplace = await hre.ethers.getContractAt("MarketplaceFacet", address);

    const listing = await marketplace.getListing(listingId);

    console.log({ listing })
  });