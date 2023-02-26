import { abi as NftAbi, bytecode as NftBytecode } from "@nusa-nft/smart-contract/artifacts/contracts/NusaNFT.sol/NusaNFT.json";
import { abi as WmaticAbi, bytecode as WmaticBytecode } from "@nusa-nft/smart-contract/artifacts/contracts/WETH.sol/WETH9.json";
import { ethers } from "ethers";
import { NusaNFT } from "@nusa-nft/smart-contract/typechain-types/index"
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
  const wmatic = await wmaticFactory.deploy();

  // TODO: Should deploy with proxy
  const nftFactory = new ethers.ContractFactory(NftAbi, NftBytecode, deployer);
  const nft = await nftFactory.deploy() as unknown as NusaNFT;
  (await nft.initialize("NusaNFT", "NNFT")).wait(); 

  const [diamond, marketplace, offers] = await deployDiamond(deployer, {
    platformFeeRecipient: deployer.address,
    platformFeeBps: 250,
    nativeTokenWrapper: wmatic.address
  })

  return {
    wmatic,
    nft,
    diamond,
    marketplace,
    offers
  }
}