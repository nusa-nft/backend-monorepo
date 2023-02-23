require("dotenv").config();
const { task } = require("hardhat/config");

const { MerkleTree } = require('merkletreejs')
const SHA256 = require('crypto-js/sha256')
const keccak256 = require("keccak256");

const abiNusaNFT = require('../artifacts/contracts/NusaNFT.sol/NusaNFT.json').abi

const {  ACCOUNT1_PK, ACCOUNT2_PK } = process.env;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

task("deploy-token-and-voucher", "deploy token and voucher")
.setAction(async (taskArgs, { ethers, run }) => {
    const NusaNFT = await ethers.getContractFactory("NusaNFT");
    const nusaNFT = await NusaNFT.deploy();
    await nusaNFT.deployed();
    await nusaNFT.initialize("NusaNFT", "NNFT");
    console.log(`contract addrerss ${nusaNFT.address}\n`, `owner ${await nusaNFT.owner()}\n`, `deployer ${nusaNFT.signer.address}`);

    

    const defaultWallet = ethers.getSigner();
    const acc1 = new ethers.Wallet(process.env.ACCOUNT1_PK, ethers.provider);
    const acc2 = new ethers.Wallet(process.env.ACCOUNT2_PK, ethers.provider);
    


    let res = await nusaNFT.create(acc1.address, 'http://localhost:3000/apiexplorer#/1');
    res = await nusaNFT.create(acc2.address, 'http://localhost:3000/apiexplorer#/2');
    res = await nusaNFT.mintTo(acc1.address, ethers.constants.MaxUint256,  'http://localhost:3000/apiexplorer#/3', 1);
    res = await nusaNFT.mintTo(acc1.address, 1,  'http://localhost:3000/apiexplorer#/4', 1);
    
    for(let i = 1 ; i < (await nusaNFT.nextTokenIdToMint()).toNumber(); i++ ){
        console.log(`tokenID ${i}`, await nusaNFT.creator(i), await nusaNFT.uri(i))
    }


    // console.log(await nusaNFT.nextTokenIdToMint())

    const vouchers = []
    const leaves =[]

    const blockTimestamp = await nusaNFT.getTimestamp()

    // console.log(new Date(), new Date(blockTimestamp * 1000))

    for(let i = 0; i < 10; i++){
        const strRnd = getRandomChar(10)
        // leaves.push(keccak256(strRnd))
        leaves.push(ethers.utils.solidityKeccak256(
            [ "string" ], 
            [ strRnd]) )
        vouchers.push(strRnd)
    }

     // const leaves = hashVouchers.map(x => SHA256(x))
     const tree = new MerkleTree(leaves, keccak256, {sortPairs: true})
     const root = tree.getRoot().toString()
     console.log('getHexRoot', tree.getHexRoot())
 
     res = await nusaNFT.registerVoucher(1, tree.getHexRoot())
    console.log('_rootHashVoucher', await nusaNFT._rootHashVoucher(1), tree.getHexRoot() )

    await claimVoucher(
        nusaNFT, 
        vouchers[0], 
        1, 
        acc1,  
        tree.getHexProof(leaves[0]))

    console.log('acc 1 - 2', (await nusaNFT.balanceOf(acc1.address, 1)).toString())

    await delay(7000)
    await claimVoucher(
        nusaNFT, 
        vouchers[1], 
        1, 
        acc1,  
        tree.getHexProof(leaves[1]))
    console.log('acc 1 - 2', (await nusaNFT.balanceOf(acc1.address, 1)).toString())

    await delay(7000)
    await claimVoucher(
        nusaNFT, 
        vouchers[2], 
        1,  
        acc1,  
        tree.getHexProof(leaves[2]))
    console.log('acc 1 - 2', (await nusaNFT.balanceOf(acc1.address, 1)).toString())

    await delay(7000)
    await claimVoucher(
        nusaNFT, 
        vouchers[3], 
        1, 
        acc1,  
        tree.getHexProof(leaves[3]))
    console.log('acc 1 - 2', (await nusaNFT.balanceOf(acc1.address, 1)).toString())
    
})


async function claimVoucher(nusaNFT, voucher, tokenId, signer, proof){
    const hash = ethers.utils.solidityKeccak256(
        [ "string", "address" ], 
        [ voucher, signer.address]
    );
    const sig = await  signer.signMessage(ethers.utils.arrayify(hash))
    res = await nusaNFT.claimVoucher(voucher, tokenId, signer.address, proof)
}

function getRandomChar(charNum){
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const num = charset.length - 1
    let res = ""
    for(let i = 0; i < charNum; i++){
        const index = Math.floor(Math.random() * num);
        res += charset.charAt(index);
    }
    return res;
}
