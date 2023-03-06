import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import FormData from 'form-data';
import fs from 'fs';

const projectId = process.env.INFURA_IPFS_PROJECT_ID;
const projectSecret = process.env.INFURA_API_KEY_SECRET;
const auth = `Basic ${Buffer.from(`${projectId}:${projectSecret}`).toString(
  'base64',
)}`;

@Injectable()
export class IpfsService {
  constructor(private readonly httpService: HttpService) {}

  async uploadImage(filePath: string) {
    const formData = new FormData();
    const file = await new Promise((resolve, reject) => {
      fs.readFile(filePath, (err, file) => {
        if (err) reject(err);
        resolve(file);
      });
    });
    formData.append('file', file);
    try {
      const result = await this.httpService.axiosRef.post(
        // 'https://ipfs.infura.io:5001/api/v0/add',
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
    } catch (err) {
      Logger.error('#IpfsService.uploadImage', err);
      throw err;
    }
  }

  async uploadMetadata({
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
  }) {
    const data = {
      name,
      description,
      image,
      attributes,
      nusa_collection,
      external_link,
      explicit_sensitive,
      nusa_item_id,
    };
    const bufferData = Buffer.from(JSON.stringify(data));
    const formData = new FormData();
    formData.append('file', bufferData);
    try {
      const result = await this.httpService.axiosRef.post(
        // 'https://ipfs.infura.io:5001/api/v0/add',
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
    } catch (err) {
      Logger.error('#IpfsService.uploadMetadata', err);
      throw err;
    }
  }
}
