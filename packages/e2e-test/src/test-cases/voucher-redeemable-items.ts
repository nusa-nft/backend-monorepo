import { INestApplication } from "@nestjs/common";
import { Collection, Item, PrismaClient, TokenOwnerships, Voucher } from "@nusa-nft/database";
import { NusaNFT } from "@nusa-nft/smart-contract/typechain-types";
import { ethers } from "ethers";
import request from 'supertest';
import { createCollection, createItem, login, uploadMetadataToIpfs } from "../lib/rest-api";
import { v4 as uuidv4 } from 'uuid';
import retry from 'async-retry';
import { assert, fmtSuccess } from "../lib/assertions";


async function createVoucherNft({
  restApi,
  db,
  creator,
  jwt,
  collectionId,
  voucherCount,
  index,
}: {
  restApi: INestApplication,
  db: PrismaClient,
  creator: ethers.Wallet,
  jwt: string,
  collectionId: number,
  voucherCount: number,
  index: number
}) {
  await new Promise(resolve => setTimeout(resolve, 500));
  const resp = await createItem(restApi, jwt, {
    collectionId,
    lazyMint: true,
    freezeMetadata: true,
    name: 'Item ' + index,
    description: 'item ke ' + index,
    image: `${__dirname}/../test-data/image1.png`,
    supply: 1,
    external_link: 'external-link',
    explicit_sensitive: false,
    attributes: [
      {
        trait_type: 'eyes',
        nusa_attribute_type: 'PROPERTIES',
        value: 'red',
      },
    ],
    chainId: 1337,
  });
  const item: Item = resp.data;
  console.log("Created item ", { item })

  const vouchersRaw = [];
  for (let i = 0; i < voucherCount; i++) {
    const v = uuidv4();
    vouchersRaw.push(v);
  }

  await new Promise(resolve => setTimeout(resolve, 500));
  const resp2 = await request(restApi.getHttpServer())
    .post('/voucher/create-voucher')
    .send({ voucher: vouchersRaw })
  const { vouchers, leaves, rootHash } = resp2.body;
  console.log("Created and Hashed vouchers", { vouchers, leaves, rootHash });

  await new Promise(resolve => setTimeout(resolve, 500));
  const resp3 = await request(restApi.getHttpServer())
    .post("/voucher/create-nft-queue")
    .send({
      toAddress: creator.address,
      tokenURI: item.metadata,
      voucherHashes: leaves,
      voucherRootHash: rootHash,
      itemUuid: item.uuid,
    })
  console.log("Created NFT Queue", { resp3: resp3.body });

  return {
    item,
    vouchers,
    leaves,
    rootHash,
  }
}

export async function voucherRedeemableItems({
  restApi,
  db,
  web3Provider,
  nft,
  creator,
  user1,
  user2
}: {
  restApi: INestApplication,
  db: PrismaClient,
  web3Provider: ethers.providers.Web3Provider
  nft: NusaNFT,
  creator: ethers.Wallet,
  user1: ethers.Wallet,
  user2: ethers.Wallet,
}) {
  const creds = await login(restApi, creator);
  const { jwt } = creds;
  console.log("Logged in. received jwt: ", { jwt })

  const NUM_NFTS = 5;
  const NUM_VOUCHERS = 5;

  const { data } = await createCollection(restApi, creator, jwt, {
    name: 'My Collection',
    description: 'This is my collection',
    contract_address: nft.address,
    category_id: 1,
    logo_image: `${__dirname}/../test-data/image2.png`,
    chainId: 1337,
    royalty: [
      {
        wallet_address: creator.address,
        percentage: 0.05
      }
    ]
  });
  const collection: Collection = data;
  const collectionId = data.id;
  console.log("Created collection ", { collectionId })

  const resolvedVoucherNFTs = [];
  for (let i = 0; i < NUM_NFTS; i++) {
    const resolved = await createVoucherNft({
      restApi,
      jwt,
      db,
      collectionId: collectionId,
      creator,
      index: i,
      voucherCount: NUM_VOUCHERS,
    })
    resolvedVoucherNFTs.push(resolved);
  }
  // const resolvedVoucherNFTs = await Promise.all(createdVoucherNFTs);

  // Wait until the queue is processed
  // await new Promise(resolve => setTimeout(resolve, 10000));
  await retry(async () => {
    let vouchers = await db.voucher.findMany();
    if (vouchers.length < NUM_NFTS) {
      throw new Error('Not all vouchers are created');
    }
  }, { retries: 100, minTimeout: 1000, maxTimeout: 1000 });

  for (let [i, voucherNFT] of resolvedVoucherNFTs.entries()) {
    console.log({ voucherNFT });
    const { rootHash } = voucherNFT;
    let voucher: Voucher;
    await retry(async () => {
      voucher = await db.voucher.findFirst({
        where: {
          rootHash: rootHash
        }
      });
      if (!voucher) {
        throw new Error('Voucher not found');
      }
    }, { retries: 100, minTimeout: 1000, maxTimeout: 1000 });
    assert(voucher, 'voucher assertion failed');
    assert(voucher.rootHash == rootHash, 'voucher.rootHash assertion failed');
  }
  console.log(fmtSuccess("Create Voucher Redeemable Items Test Passed"));

  // Redeem
  for (let [i, voucherNFT] of resolvedVoucherNFTs.entries()) {
    const { item, vouchers, rootHash, leaves } = voucherNFT;
    for (let v of vouchers) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const voucherRedeem = await request(restApi.getHttpServer())
        .post('/voucher/claim-nft-queue')
        .send({
          voucher: v,
          toAddress: user1.address,
        })
      console.log("Redeemed Voucher", { voucherRedeem: voucherRedeem.body });
      // assert(voucherRedeem.body.success == true, 'voucherRedeem.body.success assertion failed');
    }
    // Wait until the queues are processed
    await new Promise(resolve => setTimeout(resolve, 10000));
    const _item = await db.item.findFirst({
      where: {
        uuid: item.uuid,
      }
    });
    let tokenOwnerships: TokenOwnerships;
    await retry(async () => {
      tokenOwnerships = await db.tokenOwnerships.findFirst({
        where: {
          ownerAddress: user1.address,
          tokenId: _item.tokenId,
        }
      });
      if (tokenOwnerships.quantity != NUM_NFTS) {
        console.log('tokenOwnerships.quantity assertion failed. Retrying...');
        throw new Error('tokenOwnerships.quantity assertion failed');
      }
    }, { retries: 100, minTimeout: 1000, maxTimeout: 1000 })
    assert(tokenOwnerships.quantity == NUM_NFTS, `tokenOwnerships assertion failed. expected quantity 10, got ${tokenOwnerships.quantity}`);
  }
  console.log(fmtSuccess("Redeem Voucher Redeemable Items Test Passed"));
}