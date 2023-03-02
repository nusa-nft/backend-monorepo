
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
    development: {
      url: "HTTP://127.0.0.1:8545",
      chainId: 1337,
      accounts: [NFT_CONTRACT_OWNER_PRIVATE_KEY as string],
    },
    mumbai: {
      url: "https://rpc-mumbai.maticvigil.com/",
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
};

export default config;
