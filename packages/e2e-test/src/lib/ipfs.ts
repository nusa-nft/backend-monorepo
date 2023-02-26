import axios from "axios";

export async function getIpfsData(ipfsHash: string) {
  const resp = await axios.get('http://127.0.0.1:8080/ipfs/' + ipfsHash.replace('ipfs://', ''));
  return resp.data;
}