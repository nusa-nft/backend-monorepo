import { task, types } from "hardhat/config";
import MerkleTree from "merkletreejs";
import { v4 as uuidv4 } from 'uuid';
import { NusaNFT } from "../typechain-types";

task('register-voucher')
  .addParam('qty', 'voucher quantity', 1, types.int)
  .addParam('tokenId', "tokenId", 0, types.int)
  .setAction(async (params, { ethers }) => {
    const { qty, tokenId } = params;
    const vouchers = [];
    for (let i = 0; i < qty; i++) {
      const v = uuidv4()
      vouchers.push(v);

      console.log(v);
    }

    const hashes = vouchers.map(v => {
      const hash = ethers.utils.solidityKeccak256(['string'], [v])
      console.log(hash);
      return hash;
    })

    const merkleTree = new MerkleTree(hashes, ethers.utils.keccak256, { sortPairs: true });

    const [signer] = await ethers.getSigners();
    const NusaNFT = await ethers.getContractFactory("NusaNFT");
    const nftContract = await NusaNFT.attach("0x460F0F5f2FdBBB7Fbe4BE24Db9EeeC0702CeFAe9") as NusaNFT;

    const merkleRoot = merkleTree.getHexRoot();
    console.log({ merkleRoot });

    const tx = await nftContract.registerVoucher(tokenId, merkleTree.getHexRoot());
    await tx.wait();

    const rootRegistered = await nftContract._rootHashVoucher(tokenId);
    console.log({ rootRegistered })

    const proof = merkleTree.getHexProof(hashes[0]);
    const testIsValid = await nftContract.isValidVoucher(vouchers[0], tokenId, proof);
    console.log({ testIsValid });
  })