import FormData from 'form-data';
import axios from 'axios';
import * as fs from 'fs';

const projectId = process.env.INFURA_IPFS_PROJECT_ID;
const projectSecret = process.env.INFURA_API_KEY_SECRET;
const auth = `Basic ${Buffer.from(`${projectId}:${projectSecret}`).toString(
  'base64',
)}`;

export const uploadToIpfs = async (data: ArrayBufferLike) => {
  const formData = new FormData();
  formData.append('file', data);
  const result = await axios.post(
    `${process.env.IPFS_RPC}/api/v0/add`,
    formData,
    {
      headers: {
        authorization: auth,
        'Content-Type': 'multipart/form-data',
      },
    },
  );
  return result.data;
}

export const uploadImageToIpfs = async (filePath) => {
  const file = fs.readFileSync(filePath);
  return await uploadToIpfs(file)
}

export const uploadMetadataToIpfs = async ({
  name,
  description,
  image,
  attributes,
  nusa_collection,
  external_link,
  explicit_sensitive,
  nusa_item_id,
}: {
  name: string;
  description: string;
  image: string;
  attributes: any[];
  nusa_collection: {
    name: string;
    slug: string;
  };
  external_link: string;
  explicit_sensitive: boolean;
  nusa_item_id: string;
}) => {
  const data = {
    name,
    description,
    image,
    attributes,
    nusa_collection,
    external_link,
    explicit_sensitive,
    nusa_item_id
  };
  const bufferData = Buffer.from(JSON.stringify(data));
  return await uploadToIpfs(bufferData);
}