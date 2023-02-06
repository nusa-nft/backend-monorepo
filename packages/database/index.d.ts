export * from '.prisma/client'

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      TEST_WALLET_ADDRESS: string;
      TEST_WALLET_ADDRESS_2: string;
      TEST_WALLET_ADDRESS_3: string;
      NFT_CONTRACT_ADDRESS: string;
      RPC_URL: string;
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {}