import fs from "fs"; 
import { parse } from "csv-parse";

interface Config {
  delimiter?: string; // "; / ,"
  fromLine?: number;
}

export const readFromCsv = function (csvPath: string, config?: Config) {
  let delimiter = ",";
  let fromLine = 1;
  if (config) {
    delimiter = config.delimiter ? config.delimiter : ",";
    fromLine = config.fromLine ? config.fromLine : 1;
  }
  return new Promise((resolve) => {
    const inputs: any = [];
    fs.createReadStream(csvPath)
      .pipe(parse({ delimiter: delimiter, from_line: fromLine, columns: true }, (err, records) => {
        resolve(records);
      }))
  });
};

export async function getGasPrice(ethers: any, mul: any) {
  const price = await ethers.provider.getGasPrice()
  const str = ethers.utils.formatEther(price)
  const eth = Number(str) * mul
  return ethers.utils.parseEther(eth.toFixed(18))
}

export const getContractAddressByNetworkName = async (contractName: string, network: string) => {
  console.log({ network })
  const deployedContracts = await readFromCsv('./deployed-contract.csv') as any[];
  const contractInfoByNetwork = deployedContracts.find(x =>
    x["network"] == network && x["contractName"] == contractName
  );
  const contractAddress = contractInfoByNetwork["address"];

  return contractAddress;
}