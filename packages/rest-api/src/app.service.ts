import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

interface retSignature {
  walletAddress: string;
  signature: string;
  message: string;
}
@Injectable()
export class AppService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.RECAPTCHA_SECRET_KEY = this.configService.get<string>(
      'API_RECAPTCHA_SECRET_KEY',
    );
  }

  private RECAPTCHA_SECRET_KEY: string;

  getHello(): string {
    return 'Hello World!';
  }

  async sign(privateKey: string): Promise<retSignature> {
    const wallet = new ethers.Wallet(privateKey);
    const date = new Date().toUTCString();
    const message = `I want to login at ${date}`;
    const signature = await wallet.signMessage(message);
    return {
      walletAddress: wallet.address,
      signature,
      message,
    };
  }

  async recaptcha(captchaToken: string): Promise<boolean> {
    const res = await this.httpService.axiosRef.post(
      `https://www.google.com/recaptcha/api/siteverify?secret=${this.RECAPTCHA_SECRET_KEY}&response=${captchaToken}`,
    );
    console.log({ res });
    if (res.data.success) {
      return true;
    }
    return false;
  }
}
