import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import * as FormData from 'form-data';
import * as fs from 'fs';

const projectId = process.env.IPFS_PROJECT_ID;
const projectSecret = process.env.API_KEY_SECRET;
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
    const result = await this.httpService.axiosRef.post(
      'https://ipfs.infura.io:5001/api/v0/add',
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
  async uploadMetadata({
    name,
    description,
    image,
    attributes,
  }: {
    name: string;
    description: string;
    image: string;
    attributes: any[];
  }) {
    const data = { name, description, image, attributes };
    const bufferData = Buffer.from(JSON.stringify(data));
    const formData = new FormData();
    formData.append('file', bufferData);
    const result = await this.httpService.axiosRef.post(
      'https://ipfs.infura.io:5001/api/v0/add',
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
}
