import { ethers } from "ethers";

export async function getTime(provider: ethers.providers.Web3Provider) {
  const blockNum = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNum);

  return block.timestamp;
}

export async function increaseTime(provider: ethers.providers.Web3Provider, seconds: number) {
  const now = await getTime(provider);
  await provider.send("evm_mine", [now + seconds]);
}

export async function setTime(provider: ethers.providers.Web3Provider, seconds: number) {
  await provider.send("evm_mine", [seconds]);
}