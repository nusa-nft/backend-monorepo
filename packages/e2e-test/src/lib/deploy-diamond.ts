import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
const { getSelectors, FacetCutAction } = require('@nusa-nft/smart-contract/scripts/libraries/diamond.js')
import { Diamond, MarketplaceFacet, OffersFacet } from "@nusa-nft/smart-contract/typechain-types";
import { abi as DiamondAbi, bytecode as DiamondBytecode } from "@nusa-nft/smart-contract/artifacts/contracts/Diamond.sol/Diamond.json";
import { abi as DiamondCutAbi, bytecode as DiamondCutBytecode } from "@nusa-nft/smart-contract/artifacts/contracts/facets/DiamondCutFacet.sol/DiamondCutFacet.json";
import { abi as DiamondInitAbi, bytecode as DiamondInitBytecode } from "@nusa-nft/smart-contract/artifacts/contracts/upgradeInitializers/DiamondInit.sol/DiamondInit.json";
import { abi as DiamondLoupeAbi, bytecode as DiamondLoupeBytecode } from "@nusa-nft/smart-contract/artifacts/contracts/facets/DiamondLoupeFacet.sol/DiamondLoupeFacet.json";
import { abi as OwnershipAbi, bytecode as OwnershipBytecode } from "@nusa-nft/smart-contract/artifacts/contracts/facets/OwnershipFacet.sol/OwnershipFacet.json";
import { abi as MarketplaceAbi, bytecode as MarketplaceBytecode } from "@nusa-nft/smart-contract/artifacts/contracts/facets/MarketplaceFacet.sol/MarketplaceFacet.json";
import { abi as OffersAbi, bytecode as OffersBytecode } from "@nusa-nft/smart-contract/artifacts/contracts/facets/OffersFacet.sol/OffersFacet.json";
import { abi as IDiamondCutAbi } from "@nusa-nft/smart-contract/artifacts/contracts/interfaces/IDiamondCut.sol/IDiamondCut.json";

interface DiamondInitArgs {
  platformFeeRecipient: string;
  platformFeeBps: number;
  nativeTokenWrapper: string;
}

export async function deployDiamond(contractOwner: ethers.Wallet, {
  platformFeeRecipient,
  platformFeeBps,
  nativeTokenWrapper
}: DiamondInitArgs): Promise<[Diamond, MarketplaceFacet, OffersFacet]> {
  // deploy DiamondCutFacet
  const DiamondCutFacet = new ethers.ContractFactory(DiamondCutAbi, DiamondCutBytecode, contractOwner);
  const diamondCutFacet = await DiamondCutFacet.deploy()
  await diamondCutFacet.deployed()
  // console.log('DiamondCutFacet deployed:', diamondCutFacet.address)

  // deploy Diamond
  const Diamond = new ethers.ContractFactory(DiamondAbi, DiamondBytecode, contractOwner);
  const diamond = await Diamond.deploy(contractOwner.address, diamondCutFacet.address)
  await diamond.deployed()
  // console.log('Diamond deployed:', diamond.address)

  // deploy DiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const DiamondInit = new ethers.ContractFactory(DiamondInitAbi, DiamondInitBytecode, contractOwner);
  const diamondInit = await DiamondInit.deploy()
  await diamondInit.deployed()
  // console.log('DiamondInit deployed:', diamondInit.address)

  // deploy facets
  // console.log('')
  // console.log('Deploying facets')
  const facets: Record<string, ethers.BaseContract> = {}
  const Facets = [
    {
      name: 'DiamondLoupeFacet',
      factory: new ethers.ContractFactory(DiamondLoupeAbi, DiamondLoupeBytecode, contractOwner)
    },
    {
      name: 'OwnershipFacet',
      factory: new ethers.ContractFactory(OwnershipAbi, OwnershipBytecode, contractOwner),
    },
    {
      name: 'MarketplaceFacet',
      factory: new ethers.ContractFactory(MarketplaceAbi, MarketplaceBytecode, contractOwner),
    },
    {
      name: 'OffersFacet',
      factory: new ethers.ContractFactory(OffersAbi, OffersBytecode, contractOwner)
    },
  ]
  const cut = []
  for (const Facet of Facets) {
    const facet = await Facet.factory.deploy()
    await facet.deployed()
    // console.log(`${FacetName} deployed: ${facet.address}`)
    cut.push({
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facet)
    })
    facets[facet.name] = facet;
  }

  // upgrade diamond with facets
  // console.log('')
  // console.log('Diamond Cut:', cut)
  const diamondCut = await new ethers.Contract(diamond.address, IDiamondCutAbi, contractOwner);
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
    diamond as unknown as Diamond,
    facets['MarketplaceFacet'] as unknown as MarketplaceFacet,
    facets['OffersFacet'] as unknown as OffersFacet,
  ];
}
