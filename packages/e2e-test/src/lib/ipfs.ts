import axios from "axios";
import fs from "fs";
import FormData from 'form-data';

export async function getIpfsData(ipfsHash: string) {
  const resp = await axios.get('http://127.0.0.1:8080/ipfs/' + ipfsHash.replace('ipfs://', ''));
  return resp.data;
}

export async function uploadToFileToIpfs(filePath: string) {
  const file = await new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, file) => {
      if (err) reject(err);
      resolve(file);
    });
  });
  const formData = new FormData();
  formData.append('file', file);
  try {
    const resp = await axios.post(
      `${process.env.IPFS_RPC}/api/v0/add`,
      formData,
      {
        headers: {
          // authorization: auth,
          'Content-Type': 'multipart/form-data',
        },
      },
    );
    return resp.data;
  } catch (err) {
    console.error('uploadToFileToIpfs', err);
    throw err;
  }
}

export async function uploadMetadataToIpfs(metadataObject: any) {
  const bufferData = Buffer.from(JSON.stringify(metadataObject));
  const formData = new FormData();
  formData.append('file', bufferData);
  try {
    const resp = await axios.post(
      `${process.env.IPFS_RPC}/api/v0/add`,
      formData,
      {
        headers: {
          // authorization: auth,
          'Content-Type': 'multipart/form-data',
        },
      },
    );
    return resp.data;
  } catch (err) {
    console.error('uploadMetadataToIpfs', err);
    throw err;
  }
}