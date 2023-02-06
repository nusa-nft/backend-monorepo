# Backend Nft

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo_text.svg" width="320" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description
This Repository is build using NEST JS Framwork.
For details information you can visit [Nest](https://github.com/nestjs/nest).

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov

# migrating db model
$ npx prisma migrate dev --name <name>

# seeding test user and category data
$ npx prisma db seed
```

## Tech Refference
```
RPC to testnet polygon:
https://rpc-mainnet.matic.network
network id: 137

```


## Enviroment Variables
To start the project, we need to provice environment variables.
Here is an example
```
DATABASE_URL="postgresql://username:Passowird@Host:5432/tadpole?schema=public"
JWT_SECRET_KEY="IniRahasiaDong"


# Enviroment Variables for End to End Variables
TEST_WALLET_PRIVATE_KEY="8b8b0b51a795abb2f18d8f49a9a404a2eea009febdd7e136f9c247c79d55075d"
TEST_WALLET_ADDRESS="0x1BE3769B9E6EC80e230D26D66266d6428eB826c6"
TEST_WALLET_ADDRESS_2="0x795aE9223FBb6a12a6c71391755Be1707E52EB72"
TEST_WALLET_ADDRESS_3="0x795aE9223FBb6a12a6c71391755Be1707E52EB72"

# Environment Variables for Infura IPFS API
IPFS_PROJECT_ID="2HqE2JPhFXldZ21jGyQUi1XdkwS"
API_KEY_SECRET="74961635784b0ed8e43d43c13f608050"

# Environment Variables for Smart Contract Purposes
RPC_URL=mumbai:https://polygon-mumbai.infura.io/v3/7ed81ca6bc6b41b6b0df6d32b900d58e
NFT_CONTRACT_ADDRESS=0x42ae3Cf8994D87913269bA06522f7b3916Fdd0d9
# NFT Contract Owner Address 0xFd5cb0E95D9420B170eA886B373E0ed1eAbE36bB
NFT_CONTRACT_OWNER_PRIVATE_KEY=f4e8f329ea902379cf00712862e86ef9df828434c5b01e28d6eda71c17439a21

# Google Recaptcha
RECAPTCHA_SECRET_KEY=6LcaYTwjAAAAAI51uO3N6ACoTzpZyXcFlTAm4SlL

IMAGE_SERVE_URL=https://nft.nusa.finance/uploads
API_BASE_URL=https://nft.nusa.finance/api/v1
```


## Endpoint with JWT credential

Import the Guard passport in Controller
```
import { JwtAuthGuard } from '@nestjs/passport';
```
How to protect Endpoint using JWT credentials and add Bearer auth in Swagger
```
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Get('profile')
async getProfile(@Request() req) {
  //code.....
}
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## License

Nest is [MIT licensed](LICENSE).
