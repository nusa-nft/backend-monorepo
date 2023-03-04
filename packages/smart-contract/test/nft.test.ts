import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "ethers";
import hre from "hardhat";
import keccak256 from "keccak256";
import MerkleTree from "merkletreejs";
import { NusaNFT_V2_Test_Only, NusaNFT__factory } from "../typechain-types";
import { ISignatureMintERC1155 } from "../typechain-types/contracts/interfaces/ISignatureMintERC1155";
import { NusaNFT } from "../typechain-types/contracts/NusaNFT";
import { v4 as uuidv4 } from "uuid";
import { TransferSingleEvent } from "../typechain-types/contracts/ERC1155_dummy";

const MintRequest1155 = [
  { name: "to", type: "address" },
  { name: "royaltyRecipient", type: "address" },
  { name: "royaltyBps", type: "uint256" },
  { name: "primarySaleRecipient", type: "address" },
  { name: "tokenId", type: "uint256" },
  { name: "uri", type: "string" },
  { name: "quantity", type: "uint256" },
  { name: "pricePerToken", type: "uint256" },
  { name: "currency", type: "address" },
  { name: "validityStartTimestamp", type: "uint128" },
  { name: "validityEndTimestamp", type: "uint128" },
  { name: "uid", type: "bytes32" },
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
const signMintRequest = async (
  req: ISignatureMintERC1155.MintRequestStruct,
  signer: SignerWithAddress,
  chainId: number,
  contractAddress: string,
) => {
  const domain = {
    name: "SignatureMintERC1155",
    version: "1",
    chainId,
    verifyingContract: contractAddress,
  };
  const types = { MintRequest: MintRequest1155 }; // TYPEHASH
  const message = req;
  const signature = await signer._signTypedData(
    domain,
    types,
    message
  );
  return signature;
}

describe("NusaNFT Mint With Signature", async () => {
  const NAME = 'NusaNFT';
  const SYMBOL = 'NNFT';
  const NAME_V2 = 'NusaNFT_V2';
  const SYMBOL_V2 = 'NNFT_V2';
  let nftContract: NusaNFT;
  let upgradedNftContract: NusaNFT_V2_Test_Only;
  let contractOwner: SignerWithAddress;
  let nftCreator: SignerWithAddress;
  let nftMinter: SignerWithAddress;
  let adminMinter1: SignerWithAddress;
  let adminMinter2: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let vouchers: string[] = [];
  let leaves: string[] = [];
  let voucherExpTime: ethers.BigNumberish;
  let voucherMerkleTree: MerkleTree;

  let chainId: number;

  const MAX_UINT_128 = "170141183460469231731687303715884105727";

  before(async () => {

    [
      contractOwner,
      nftCreator,
      nftMinter,
      adminMinter1,
      adminMinter2,
      user1,
      user2
    ] = await hre.ethers.getSigners();

    chainId = hre.network.config.chainId as number;

    // Deploy NFT Contract Logic
    const NusaNFT = await hre.ethers.getContractFactory("NusaNFT");
    const nftContractLogic = await NusaNFT.deploy();

    // encode initialize data (used for thirdweb deployment)
    // https://blog.thirdweb.com/guides/how-to-upgrade-smart-contracts-upgradeable-smart-contracts/
    const nusaNFTInitializeData = nftContractLogic.interface.encodeFunctionData("initialize", [
      NAME,
      SYMBOL
    ]);
    // const nusaNFTInitializeData = ethers.utils.solidityPack(["string", "string"], [NAME, SYMBOL])
    console.log({ nusaNFTInitializeData });

    nftContract = await hre.upgrades.deployProxy(
      NusaNFT,
      [NAME, SYMBOL],
      {
        initializer: "initialize",
        kind: "uups",
        unsafeAllow: ["constructor", "delegatecall", "state-variable-immutable"]
      }
    ) as NusaNFT;

    await nftContract.deployed();

    // Deploy proxy and pass in logic initialize data
    // const ProxyNusaNFT = await hre.ethers.getContractFactory("ProxyNusaNFT");
    // const proxy = await ProxyNusaNFT.deploy(nftContractLogic.address, nusaNFTInitializeData) as NusaNFT;

    // nftContract = NusaNFT__factory.connect(proxy.address, contractOwner);

    // console.log({ nftLogicAddres: nftContractLogic.address });
    // console.log({ nftContractAddress: nftContract.address });
  })

  it("deploys correctly", async () => {
    expect(nftContract.address).to.not.be.undefined;
  })

  it("Mint with signature", async () => {
    const pricePerToken = ethers.utils.parseEther('1');
    const quantity = 100;

    // TODO: Should add marketplace fee
    const mintRequest: ISignatureMintERC1155.MintRequestStruct = {
      to: nftMinter.address,
      royaltyRecipient: contractOwner.address,
      royaltyBps: 10,
      primarySaleRecipient: nftCreator.address,
      tokenId: ethers.constants.MaxUint256,
      uri: "ipfs://",
      quantity,
      pricePerToken,
      currency: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      validityStartTimestamp: 0,
      validityEndTimestamp: MAX_UINT_128,
      uid: ethers.utils.formatBytes32String("uid-1"),
    };

    const signature = await signMintRequest(mintRequest, contractOwner, chainId, nftContract.address);

    let tx = await nftContract.mintWithSignature(mintRequest, signature, { value: pricePerToken.mul(quantity) });
    await tx.wait();

    const balance = await nftContract.balanceOf(nftMinter.address, 0);
    expect(balance.toString()).to.equal(quantity.toString());
  })

  it("Mint previously minted token. quantity should increase", async () => {
    const pricePerToken = ethers.utils.parseEther('1');
    const quantity = 100;

    const balance = await nftContract.balanceOf(nftMinter.address, 0);

    const mintRequest: ISignatureMintERC1155.MintRequestStruct = {
      to: nftMinter.address,
      royaltyRecipient: contractOwner.address,
      royaltyBps: 10,
      primarySaleRecipient: nftCreator.address,
      tokenId: 0,
      uri: "ipfs://",
      quantity,
      pricePerToken,
      currency: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      validityStartTimestamp: 0,
      validityEndTimestamp: MAX_UINT_128,
      uid: ethers.utils.formatBytes32String("uid-2"),
    };

    const signature = await signMintRequest(mintRequest, contractOwner, chainId, nftContract.address);

    let tx = await nftContract.mintWithSignature(mintRequest, signature, { value: pricePerToken.mul(quantity) });
    await tx.wait();

    const newBalance = await nftContract.balanceOf(nftMinter.address, 0);
    expect(newBalance.toString()).to.equal(balance.add(quantity).toString());
  })

  it("Upgrade contract, previous states should still exist", async () => {
    const balanceBeforeUpgrade = await nftContract.balanceOf(nftMinter.address, 0);
    // Deploy NFT Contract Logic
    const NusaNFT_V2 = await hre.ethers.getContractFactory("NusaNFT_V2_Test_Only");

    upgradedNftContract = await hre.upgrades.upgradeProxy(
      nftContract,
      NusaNFT_V2,
      {
        call: { fn: "reinitialize", args: [NAME_V2, SYMBOL_V2, 2] },
        unsafeAllow: ["constructor", "delegatecall", "state-variable-immutable"]
      }
    ) as NusaNFT_V2_Test_Only;
    
    const name = await upgradedNftContract.name();
    const symbol = await upgradedNftContract.symbol();
    expect(name).to.equal(NAME_V2);
    expect(symbol).to.equal(SYMBOL_V2);

    const upgradedFunctionResult = await upgradedNftContract.testV2Function();

    expect(upgradedFunctionResult).to.equal("from contract v2");

    const balanceAfterUpgrade = await upgradedNftContract.balanceOf(nftMinter.address, 0);
    expect(balanceAfterUpgrade).to.equal(balanceBeforeUpgrade);

    nftContract = upgradedNftContract;
  })

  // TODO:
  // Test all other functionalities after contract is upgraded

  it("Assign multiple wallets as ADMIN_MINTER_ROLE", async () => {
    const roleBytes = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("ADMIN_MINTER_ROLE")
    );

    let tx = await nftContract.grantRole(roleBytes, adminMinter1.address);
    await tx.wait();
    let hasRole = await nftContract.hasRole(roleBytes, adminMinter1.address);
    expect(hasRole).to.be.true;

    tx = await nftContract.grantRole(roleBytes, adminMinter2.address);
    await tx.wait();
    hasRole = await nftContract.hasRole(roleBytes, adminMinter2.address);
    expect(hasRole).to.be.true;
  })

  it("Create an NFT, not mint it (For future minting by way of claim voucher)", async () => {
    let tx = await nftContract.connect(adminMinter1).create(nftMinter.address, "token_uri");
    await tx.wait();

    const createdTokenId = (await nftContract.nextTokenIdToMint()).sub(1);
    const creator = await nftContract.creator(createdTokenId);

    expect(creator).to.equal(nftMinter.address);
  })

  it("Register Voucher", async () => {
    for(let i = 0; i < 10; i++){
      const strRnd = uuidv4();
      leaves.push(ethers.utils.solidityKeccak256(
        ["string"], 
        [strRnd]
      ))
      vouchers.push(strRnd)
    }

    voucherMerkleTree = new MerkleTree(leaves, ethers.utils.keccak256, {sortPairs: true});
    const root = voucherMerkleTree.getHexRoot();

    const tx = await nftContract.registerVoucher(1, root);
    const recpt = await tx.wait();

    const rootHashVoucherRegistered = await nftContract._rootHashVoucher(1);
    expect(rootHashVoucherRegistered).to.equal(root);
  })

  it("Claim Voucher", async () => {
    const voucher = vouchers[0];
    const leaf = leaves[0];
    const tokenId = 1;
    const signer = nftMinter;

    const hash = ethers.utils.solidityKeccak256(
      [ "string" ], 
      [ voucher ]
    );
    // const sig = await signer.signMessage(ethers.utils.arrayify(hash));
    const proof = voucherMerkleTree.getHexProof(leaf);

    const isValidVoucher = await nftContract.isValidVoucher(voucher, tokenId, proof);
    console.log({ isValidVoucher });

    let tx = await nftContract
      .connect(adminMinter1)
      .claimVoucher(voucher, tokenId, signer.address, proof)
    let receipt = await tx.wait();

    let balanceOfSigner = await nftContract.balanceOf(signer.address, tokenId);
    expect(balanceOfSigner).to.equal("1");

    /**
     * Can not use the same voucher twice
     */
    await expect(nftContract
      .connect(adminMinter1)
      .claimVoucher(voucher, tokenId, signer.address, proof)).to.be.reverted;

    /**
     * Can use a different voucher to mint more
     */
    const voucher2 = vouchers[1];
    const leaf2 = leaves[1];
    const proof2 = voucherMerkleTree.getHexProof(leaf2);

    tx = await nftContract
      .connect(adminMinter1)
      .claimVoucher(voucher2, tokenId, signer.address, proof2)
    receipt = await tx.wait();

    balanceOfSigner = await nftContract.balanceOf(signer.address, tokenId);
    expect(balanceOfSigner).to.equal("2");
  })

  it("Freeze Metadata", async () => {
    let tx = await nftContract.mintTo(
      nftMinter.address,
      ethers.constants.MaxUint256,
      "https://metadata-uri",
      1,
    );
    const receipt = await tx.wait();
    const data = receipt.events?.find((item: any) => item.event === 'TransferSingle');
    const tokenId = data?.args?.[3].toNumber(); // tokenId;

    const ipfsUri = "ipfs://abcdefg";
    tx = await nftContract.setTokenURI(tokenId, "ipfs://abcdefg");

    const uri = await nftContract.uri(tokenId);
    expect(uri).to.equal(ipfsUri);
  })

  it("Only nft creator can mint", async () => {
    let tx = await nftContract.connect(user1).mintTo(
      nftMinter.address,
      ethers.constants.MaxUint256,
      "https://metadata-uri",
      1,
    );
    let receipt = await tx.wait();
    let tfSingleEvent = receipt.events?.find((item: any) => item.event === 'TransferSingle') as TransferSingleEvent;
    let { to, id } = tfSingleEvent?.args;

    // mint tokenId of id using user2 
    // expect to be reverted
    await expect(
      nftContract.connect(user2).mintTo(
        nftMinter.address,
        id,
        "https://metadata-uri",
        1,
      )
    ).to.be.revertedWith("Not authorized to mint.");
  })
});
