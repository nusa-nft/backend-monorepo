const { task } = require("hardhat/config");

task("verify-contract", "Verify Certificate Token Contract")
  .addParam("address", "The contract address")
  .setAction(async (taskArgs, { run }) => {
    console.log(taskArgs)
    await run("verify:verify", {
        address: taskArgs.address,
        contract: "contracts/TadPole.sol:TadPole", // <path-to-contract>:<contract-name>
        constructorArguments: [
          "Nusa NFT",
          "NNFT",
          process.env.PROXY_ADDRESS,
          process.env.BASE_URL
        ],
      });
  })

  