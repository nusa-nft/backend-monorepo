import { ethers } from "ethers"
import NusaNFTAbi from '../../abi/nusa-nft.json';

const testWalletPrivateKeys = {
  [process.env.TEST_WALLET_ADDRESS]: process.env.TEST_WALLET_PRIVATE_KEY,
  [process.env.TEST_WALLET_ADDRESS_2]: process.env.TEST_WALLET_PRIVATE_KEY_2,
  [process.env.TEST_WALLET_ADDRESS_3]: process.env.TEST_WALLET_PRIVATE_KEY_3,
}

export const mintItem = async (
  toAddress: string,
  metadata: string,
  qty: number,
) => {
  const provider = new ethers.providers.JsonRpcBatchProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(testWalletPrivateKeys[toAddress] as string, provider);

  const contract = new ethers.Contract(
    process.env.NFT_CONTRACT_ADDRESS as string,
    NusaNFTAbi,
    wallet,
  )

  const tx = await contract.mintTo(
    toAddress,
    ethers.constants.MaxUint256,
    metadata,
    qty
  )

  const receipt = await tx.wait();
  const data = receipt.events.find((item: any) => item.event === 'TransferSingle');

  return data.args?.id?.toNumber();
}