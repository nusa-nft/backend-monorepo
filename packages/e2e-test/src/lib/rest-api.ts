import request from 'supertest';
import { INestApplication, VersioningType } from '@nestjs/common';
import { ethers } from "ethers";
import { ActivitiesParams, LazyMintListingDto, LazyMintSale } from '@nusa-nft/rest-api/src/item/dto/item.dto';

export async function login(restApi: INestApplication, user: ethers.Wallet) {
  const date = new Date().toUTCString();
  const CONNECT_WALLET_MSG = `I want to login at ${date}`;
  const signature = await user.signMessage(CONNECT_WALLET_MSG);
  const resp = await request(restApi.getHttpServer())
    .post('/auth/login')
    .send({
      walletAddress: user.address,
      signature: signature,
      message: CONNECT_WALLET_MSG,
    })
  return resp.body;
}

export async function createCollection(restApi: INestApplication, user: ethers.Wallet, jwt: string, {
  name,
  description,
  contract_address,
  category_id,
  logo_image,
  chainId,
  royalty,
}: {
  name: string,
  description: string,
  contract_address: string,
  category_id: number,
  logo_image: string,
  chainId: number
  royalty: Array<any>
}) {
  const resp = await request(restApi.getHttpServer())
    .post('/collection/create')
    .set('Authorization', 'Bearer ' + jwt)
    .set('Content-Type', 'multipart/form-data')
    .field('name', name)
    .field('contract_address', contract_address)
    .field('description', 'some image')
    .attach('logo_image', logo_image)
    .field('creator_address', user.address)
    .field('category_id', category_id)
    .field('royalty', JSON.stringify(royalty))
    .field('chainId', chainId)

  return resp.body;
}

export async function createItem(restApi: INestApplication, jwt: string, {
  collectionId,
  lazyMint,
  freezeMetadata,
  name,
  description,
  image,
  supply,
  external_link,
  explicit_sensitive,
  attributes,
  chainId
}: {
  collectionId: number,
  lazyMint: boolean,
  freezeMetadata: boolean,
  name: string,
  description: string,
  image: string,
  supply: number,
  external_link: string,
  explicit_sensitive: boolean,
  attributes: Array<any>,
  chainId: number,
}) {
  const collection_id = collectionId;
  const unlockable = false;
  const is_metadata_freeze = freezeMetadata;
  const is_minted = lazyMint;

  try {
    const resp = await request(restApi.getHttpServer())
      .post('/item')
      .set('Authorization', 'Bearer ' + jwt)
      .set('Content-Type', 'multipart/form-data')
      .field('name', name)
      .field('description', description)
      .field('external_link', external_link)
      .field('collection_id', collection_id)
      .attach('image', image)
      .field('supply', supply)
      .field('unlockable', unlockable)
      .field('explicit_sensitive', explicit_sensitive)
      .field('is_metadata_freeze', is_metadata_freeze)
      .field('attributes', JSON.stringify(attributes))
      .field('chainId', chainId)
      .field('is_minted', is_minted)
    return resp.body;

  } catch (err) {
    throw err;
  }
}

export async function uploadMetadataToIpfs(restApi: INestApplication, jwt: string, {
  collectionId,
  name,
  description,
  attributes,
  external_link,
  image,
  supply,
  unlockable,
  explicit_sensitive
}: {
  collectionId: number,
  name: string,
  description: string,
  attributes: Array<any>
  external_link: string,
  image: string
  supply: number,
  unlockable: boolean,
  explicit_sensitive: boolean
}) {
  try {
    const resp = await request(restApi.getHttpServer())
      .post('/item/upload-metadata')
      .set('Authorization', 'Bearer ' + jwt)
      .set('Content-Type', 'multipart/form-data')
      .field('collection_id', collectionId)
      .field('name', name)
      .field('description', description)
      .field('attributes', JSON.stringify(attributes))
      .attach('image', image)
      .field('external_link', external_link)
      .field('supply', supply)
      .field('unlockable', unlockable)
      .field('explicit_sensitive', explicit_sensitive)
    return resp.body;

  } catch (err) {
    throw err;
  }
}

export async function createLazyMintListing(restApi: INestApplication, jwt: string, {
  itemId,
  listingData
}: {
  itemId: number,
  listingData: LazyMintListingDto
}) {
  try {
    const resp = await request(restApi.getHttpServer())
      .post(`/item/create-lazymint-listing/${itemId}`)
      .set('Authorization', 'Bearer ' + jwt)
      .send(listingData)

    return resp.body;
  } catch (err) {
    throw err;
  }
}

export async function getLazyMintListingSignature(restApi: INestApplication, jwt: string, {
  listingId,
  quantity
}: {
  listingId: number
  quantity: number
}) {
  try {
    const resp = await request(restApi.getHttpServer())
      .get(`/item/get-lazymint-listing-signature/${listingId}`)
      .set('Authorization', 'Bearer ' + jwt)
      .query({ quantity: quantity })
    return resp.body;

  } catch (err) {
    throw err;
  }
}

export async function createLazyMintSale(restApi: INestApplication, jwt: string, {
  listingData,
}: {
  listingData: LazyMintSale
}) {
  try {
    const resp = await request(restApi.getHttpServer())
      .post(`/item/lazy-mint-sale/`)
      .set('Authorization', 'Bearer ' + jwt)
      .send(listingData)

    return resp.body;
  } catch (err) {
    throw err;
  }
}

export async function getNotificationData(restApi: INestApplication) {
  try {
    const resp = await request(restApi.getHttpServer())
    .get(`/notification/1?page=1&take=Take_10`)

    return resp.body
  } catch (err) {
    throw err
  }
}

export async function getItemActivities(restApi: INestApplication, itemId: number, param: ActivitiesParams ) {
  const {page, event} = param
  try {
    const resp = await request(restApi.getHttpServer())
    .get(`/item/activities/${itemId}?page=${page}&event=${event}`)
    return resp.body
  } catch (err) {
    throw err
  }
}