import { ethers } from "ethers";
import { task, types } from "hardhat/config";
const { getSelectors, FacetCutAction } = require('../scripts/libraries/diamond.js')

task("upgrade-marketplace")
  .addParam("diamondAddress", "Diamond address")
  .addOptionalParam("platformFeeRecipient", "Marketplace platform fee recipient")
  .addOptionalParam("platformFeeBps", "Marketplace platform fee bps", 250, types.int)
  .addOptionalParam("nativeTokenWrapper", "Native Token Wrapper")
  .setAction(async (taskArgs, hre) => {
    let {
      diamondAddress,
      nativeTokenWrapper,
      platformFeeRecipient,
      platformFeeBps
    } = taskArgs;
    const deployer = (await hre.ethers.getSigners())[0];

    if (!platformFeeRecipient) {
      platformFeeRecipient = deployer.address;
    }

    // deploy DiamondCutFacet
    const DiamondCutFacet = await hre.ethers.getContractFactory('DiamondCutFacet')
    const diamondCutFacet = await DiamondCutFacet.deploy()
    await diamondCutFacet.deployed()

    const DiamondInit = await hre.ethers.getContractFactory('DiamondInit')
    const diamondInit = await DiamondInit.deploy()
    await diamondInit.deployed()

    const diamond = await hre.ethers.getContractAt("Diamond", diamondAddress);

    const facets: Record<string, ethers.BaseContract> = {}
    const FacetNames = [
      'DiamondLoupeFacet',
      'OwnershipFacet',
      'MarketplaceFacet',
      'OffersFacet'
    ]
    const cut = []
    for (const FacetName of FacetNames) {
      const Facet = await hre.ethers.getContractFactory(FacetName)
      const facet = await Facet.deploy()
      await facet.deployed()
      // console.log(`${FacetName} deployed: ${facet.address}`)
      cut.push({
        facetAddress: facet.address,
        action: FacetCutAction.Replace,
        functionSelectors: getSelectors(facet)
      })
      facets[FacetName] = facet;
    }

    // upgrade diamond with facets
    // console.log('')
    // console.log('Diamond Cut:', cut)
    const diamondCut = await hre.ethers.getContractAt('IDiamondCut', diamond.address)
    let tx
    let receipt
    // call to init function
    const initArgs = {
      platformFeeRecipient,
      platformFeeBps,
      nativeTokenWrapper 
    }
    let functionCall = diamondInit.interface.encodeFunctionData('init', [initArgs])
    tx = await diamondCut.diamondCut(cut, diamondInit.address, functionCall)
    // console.log('Diamond cut tx: ', tx.hash)
    receipt = await tx.wait()
    if (!receipt.status) {
      throw Error(`Diamond upgrade failed: ${tx.hash}`)
    }
  });