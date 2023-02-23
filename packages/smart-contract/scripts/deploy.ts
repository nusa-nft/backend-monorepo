import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
const { getSelectors, FacetCutAction } = require('./libraries/diamond.js')
import { Diamond, MarketplaceFacet, OffersFacet } from "../typechain-types";

interface DiamondInitArgs {
  platformFeeRecipient: string;
  platformFeeBps: number;
  nativeTokenWrapper: string;
}

export async function deployDiamond(hre: HardhatRuntimeEnvironment, {
  platformFeeRecipient,
  platformFeeBps,
  nativeTokenWrapper
}: DiamondInitArgs): Promise<[Diamond, MarketplaceFacet, OffersFacet]> {
  const accounts = await hre.ethers.getSigners()
  const contractOwner = accounts[0]

  // deploy DiamondCutFacet
  const DiamondCutFacet = await hre.ethers.getContractFactory('DiamondCutFacet')
  const diamondCutFacet = await DiamondCutFacet.deploy()
  await diamondCutFacet.deployed()
  // console.log('DiamondCutFacet deployed:', diamondCutFacet.address)

  // deploy Diamond
  const Diamond = await hre.ethers.getContractFactory('Diamond')
  const diamond = await Diamond.deploy(contractOwner.address, diamondCutFacet.address)
  await diamond.deployed()
  // console.log('Diamond deployed:', diamond.address)

  // deploy DiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const DiamondInit = await hre.ethers.getContractFactory('DiamondInit')
  const diamondInit = await DiamondInit.deploy()
  await diamondInit.deployed()
  // console.log('DiamondInit deployed:', diamondInit.address)

  // deploy facets
  // console.log('')
  // console.log('Deploying facets')
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
      action: FacetCutAction.Add,
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
  // console.log('Completed diamond cut')
  return [
    diamond,
    facets['MarketplaceFacet'] as MarketplaceFacet,
    facets['OffersFacet'] as OffersFacet,
  ];
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
// if (require.main === module) {
//   deployDiamond({

//   })
//     .then(() => process.exit(0))
//     .catch(error => {
//       console.error(error)
//       process.exit(1)
//     })
// }

// exports.deployDiamond = deployDiamond
