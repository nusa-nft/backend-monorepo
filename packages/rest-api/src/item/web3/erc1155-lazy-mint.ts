import type { BigNumberish, BytesLike, ethers } from 'ethers';

export type PromiseOrValue<T> = T | Promise<T>;

export type MintRequestStruct = {
  to: PromiseOrValue<string>;
  royaltyRecipient: PromiseOrValue<string>;
  royaltyBps: PromiseOrValue<BigNumberish>;
  primarySaleRecipient: PromiseOrValue<string>;
  tokenId: PromiseOrValue<BigNumberish>;
  uri: PromiseOrValue<string>;
  quantity: PromiseOrValue<BigNumberish>;
  pricePerToken: PromiseOrValue<BigNumberish>;
  currency: PromiseOrValue<string>;
  validityStartTimestamp: PromiseOrValue<BigNumberish>;
  validityEndTimestamp: PromiseOrValue<BigNumberish>;
  uid: PromiseOrValue<BytesLike>;
};

const MintRequest1155 = [
  { name: 'to', type: 'address' },
  { name: 'royaltyRecipient', type: 'address' },
  { name: 'royaltyBps', type: 'uint256' },
  { name: 'primarySaleRecipient', type: 'address' },
  { name: 'tokenId', type: 'uint256' },
  { name: 'uri', type: 'string' },
  { name: 'quantity', type: 'uint256' },
  { name: 'pricePerToken', type: 'uint256' },
  { name: 'currency', type: 'address' },
  { name: 'validityStartTimestamp', type: 'uint128' },
  { name: 'validityEndTimestamp', type: 'uint128' },
  { name: 'uid', type: 'bytes32' },
];

/**
 * signMintRequest
 * Refer to: https://github.dev/thirdweb-dev/js/blob/4cdd0bd6348494a256d7c6a2bdf8f7b5c20f6877/packages/sdk/src/evm/core/classes/erc-1155-signature-mintable.ts#L347
 *
 * @param req
 * @param signer
 * @param chainId
 * @param contractAddress
 * @returns
 */
export const signMintRequest = async (
  req: MintRequestStruct,
  signer: ethers.Wallet,
  chainId: number,
  contractAddress: string,
) => {
  const domain = {
    name: 'SignatureMintERC1155',
    version: '1',
    chainId,
    verifyingContract: contractAddress,
  };
  const types = { MintRequest: MintRequest1155 }; // TYPEHASH
  const message = req;
  const signature = await signer._signTypedData(domain, types, message);
  return signature;
};
