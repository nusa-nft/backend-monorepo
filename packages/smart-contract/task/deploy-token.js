require("dotenv").config();
const { task } = require("hardhat/config");

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

task("deploy-token", "deploy token")
.setAction(async (taskArgs, { ethers, run }) => {
    const NusaNFT = await ethers.getContractFactory("NusaNFT");
    const nusaNFT = await NusaNFT.deploy();
    await nusaNFT.deployed();
    await nusaNFT.initialize("NusaNFT", "NNFT");
    console.log(`contract addrerss ${nusaNFT.address}\n`, `owner ${await nusaNFT.owner()}\n`, `deployer ${nusaNFT.signer.address}`); 
    
    await delay(30000);

    await run("verify:verify", {
        address: nusaNFT.address,
        contract: "contracts/NusaNFT.sol:NusaNFT", // <path-to-contract>:<contract-name>
        constructorArguments: [],
      });

})


