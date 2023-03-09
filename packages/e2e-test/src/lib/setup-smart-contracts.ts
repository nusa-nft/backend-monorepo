import { abi as NftAbi, bytecode as NftBytecode } from "@nusa-nft/smart-contract/artifacts/contracts/NusaNFT.sol/NusaNFT.json";
import { abi as WmaticAbi, bytecode as WmaticBytecode } from "@nusa-nft/smart-contract/artifacts/contracts/WETH.sol/WETH9.json";
import { abi as ERC1155_dummyAbi, bytecode as ERC1155_dummyBytecode } from "@nusa-nft/smart-contract/artifacts/contracts/ERC1155_dummy.sol/ERC1155_dummy.json";
import { abi as ERC721_dummyAbi, bytecode as ERC721_dummyBytecode } from "@nusa-nft/smart-contract/artifacts/contracts/ERC721_dummy.sol/ERC721_dummy.json";
import { ethers } from "ethers";
import { ERC1155_dummy, ERC721_dummy, NusaNFT, WETH9 } from "@nusa-nft/smart-contract/typechain-types/index"
import { deployDiamond } from "./deploy-diamond";
import { Server } from "ganache";

export async function deployContracts(
  blockchain: Server<"ethereum">
) {
  const provider = blockchain.provider;
  const accounts = provider.getInitialAccounts();
  const web3Provider = new ethers.providers.Web3Provider(provider);
  const deployer = new ethers.Wallet(accounts[Object.keys(accounts)[0]].secretKey, web3Provider);

  const wmaticFactory = new ethers.ContractFactory(WmaticAbi, WmaticBytecode, deployer);
  const wmatic = await wmaticFactory.deploy() as WETH9;

  // TODO: Should deploy with proxy
  const nftFactory = new ethers.ContractFactory(NftAbi, NftBytecode, deployer);
  const nft = await nftFactory.deploy() as unknown as NusaNFT;
  (await nft.initialize("NusaNFT", "NNFT")).wait();

  // Dummy contract to test import feature
  const erc1155Factory = new ethers.ContractFactory(ERC1155_dummyAbi, ERC1155_dummyBytecode, deployer);
  const erc1155 = await erc1155Factory.deploy() as unknown as ERC1155_dummy;

  // Dummy contract to test import feature
  const erc721Factory = new ethers.ContractFactory(ERC721_dummyAbi, ERC721_dummyBytecode, deployer);
  const erc721 = await erc721Factory.deploy() as unknown as ERC721_dummy;

  const [diamond, marketplace, offers] = await deployDiamond(deployer, {
    platformFeeRecipient: deployer.address,
    platformFeeBps: 250,
    nativeTokenWrapper: wmatic.address
  })

  await nft.setNusaMarketplace(diamond.address);

  return {
    wmatic,
    nft,
    erc1155,
    erc721,
    diamond,
    marketplace: marketplace.attach(diamond.address),
    offers: offers.attach(diamond.address)
  }
}