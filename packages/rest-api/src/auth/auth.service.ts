import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ValidateDto } from './dto/validate.dto';
import { ethers } from 'ethers';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  private provider: ethers.providers.Provider;
  private nftContractOwner: ethers.Wallet;

  async onModuleInit(): Promise<void> {
    this.provider = new ethers.providers.JsonRpcProvider(
      this.configService.get<string>('RPC_URL'),
    );
    this.nftContractOwner = new ethers.Wallet(
      this.configService.get<string>('NFT_CONTRACT_OWNER_PRIVATE_KEY'),
      this.provider,
    );
  }

  async validate(payload: ValidateDto): Promise<any> {
    const { walletAddress, signature, message } = payload;
    const dateString = message.substring(19);
    const date = new Date(dateString);
    const timestamp = date.getTime();
    if (Date.now() - timestamp > 60000) {
      throw new HttpException(
        {
          status: HttpStatus.UNAUTHORIZED,
          message: 'BAD REQUEST',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
    const address = ethers.utils.verifyMessage(message, signature);

    if (walletAddress != address) {
      throw new HttpException(
        {
          status: HttpStatus.UNAUTHORIZED,
          message: 'BAD REQUEST',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    let user = await this.usersService.findWalletOne(walletAddress);
    if (!user) {
      user = await this.usersService.create({
        wallet_address: walletAddress,
        collections: null,
        first_name: null,
        last_name: null,
        username: null,
        cover_picture: null,
        email: null,
        twitter_link: null,
        instagram_link: null,
        website_link: null,
        profile_picture: null,
      });
    }

    return {
      jwt: this.jwtService.sign({
        sub: user.id,
        wallet_address: walletAddress,
      }),
      data: user,
    };
  }

  async getPublicMintSignature(walletAddress: string) {
    const blockNumber = await this.provider.getBlockNumber();
    const timestamp = (await this.provider.getBlock(blockNumber)).timestamp;
    const messageHash = ethers.utils.solidityKeccak256(
      ['address', 'uint256'],
      [walletAddress, timestamp],
    );
    // 32 bytes of data in Uint8Array
    const messageHashBinary = ethers.utils.arrayify(messageHash);
    const signature = await this.nftContractOwner.signMessage(
      messageHashBinary,
    );
    const no0x = signature.slice(2);
    const r = '0x' + no0x.slice(0, 64);
    const s = '0x' + no0x.slice(64, 128);
    const v = '0x' + no0x.slice(128);

    // Example output
    // timestamp: 1653321910
    // r: "0x2d9d44261ffd5f6ca177cb23f6105fbaf1b847847017f1c650edda6647184073"
    // s: "0x588cbdb3a6f0600df058463ba80cccd46253329c25fe1db32e82f5e92c254619"
    // v: "0x1b"
    return {
      timestamp,
      walletAddress,
      v,
      r,
      s,
    };
  }
}
