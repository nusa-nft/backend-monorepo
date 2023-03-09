
import { HardhatUserConfig } from "hardhat/config";
// import * as hardhatToolbox  from  "@nomicfoundation/hardhat-toolbox" 
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-contract-sizer";
import "@nomicfoundation/hardhat-chai-matchers";
import "hardhat-dependency-compiler";
import "@nomiclabs/hardhat-ethers";
require("@nomiclabs/hardhat-etherscan");
import "./task";
// import * as dotenv from 'dotenv';
require("dotenv").config({ path: '../../.env' });

const { NFT_CONTRACT_OWNER_PRIVATE_KEY } = process.env;

const config: HardhatUserConfig = {
  networks: {
    localhost: {
      url: "http://localhost:8545",
      chainId: 1337,
    },
    ganache: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
      accounts: [
        "0x511bdcdfd69b432df1cbdc64fa6e8283cd7e73500a511d810f035e870b17b514",
        "0x0c418aa4fe6cdd32f7d57d1018e086036934309539dfa1106afc1ebc0627ac4b",
        "0xc70be3bc5e2f8f7331114ebeadf9afedba8651bb2a6092cb51459cf7ffcf9bdd",
        "0xaf0e088e48c8cc1954fa83b0286ab8dce0842a801df804ed102a387db2e85c8d",
        "0x4f682f10f8e65dadb9d87993fcecd566aaff9ada7f07636e4fd89419650be9e2",
        "0x924cc9c35c70e442cc8efa23f502c9246c89853951f2c99198034b08ddbcc1a2",
        "0x53d8f5e3ee72c06e36f36c21221cf3ec0ca9f95efd0364bfc9eb9559c5d5387e"
      ]
    },
    development: {
      url: "HTTP://127.0.0.1:8545",
      chainId: 1337,
      accounts: [NFT_CONTRACT_OWNER_PRIVATE_KEY as string],
    },
    mumbai: {
      url: "https://polygon-mumbai.g.alchemy.com/v2/mRDbns-g5u46FGGXz5XpEwj4fBxG8K8i",
      chainId: 80001,
      accounts: [NFT_CONTRACT_OWNER_PRIVATE_KEY as string],
    },
    polygon: {
      url: "https://rpc-mainnet.matic.quiknode.pro",
      chainId: 137,
      accounts: [NFT_CONTRACT_OWNER_PRIVATE_KEY as string],
    },
  },
  solidity: {
    version: '0.8.11',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
    },
  },
  contractSizer: {},
  dependencyCompiler: {
    paths: [
      '@openzeppelin/contracts/token/ERC20/ERC20.sol',
      './contracts/facets'
    ],
  },
  etherscan: {
    apiKey: {
      // ethereum
      mainnet: process.env.ETHERSCAN_API_KEY as string,
      ropsten: process.env.ETHERSCAN_API_KEY as string,
      rinkeby: process.env.ETHERSCAN_API_KEY as string,
      goerli: process.env.ETHERSCAN_API_KEY as string,
      kovan: process.env.ETHERSCAN_API_KEY as string,
      sepolia: process.env.ETHERSCAN_API_KEY as string,
      // polygon
      polygon: process.env.POLYGONSCAN_API_KEY as string,
      polygonMumbai: process.env.POLYGONSCAN_API_KEY as string,
    },
  }
};

export default config;
