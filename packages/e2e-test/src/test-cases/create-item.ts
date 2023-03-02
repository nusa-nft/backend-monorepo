import { INestApplication } from "@nestjs/common";
import { PrismaClient, Item } from "@nusa-nft/database";
import { NusaNFT } from "@nusa-nft/smart-contract/typechain-types";
import { TransferSingleEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/NusaNFT";
import { ethers } from "ethers";
import _ from "lodash";
import { assert } from "../lib/assertions";
import { getIpfsData } from "../lib/ipfs";
import { login, uploadMetadataToIpfs } from "../lib/rest-api";
import retry from 'async-retry';

export async function testCreateItemOnChain({
  restApi,
  collectionId,
  wallet,
  db,
  nft
}: {
  restApi: INestApplication,
  collectionId: number,
  wallet: ethers.Wallet,
  db: PrismaClient,
  nft: NusaNFT
}) {
  // - REST API should upload metadata to IPFS
  const creds = await login(restApi, wallet);
  let resp =  await uploadMetadataToIpfs(restApi, creds.jwt, {
    name: 'test-item',
    description: 'test-description',
    collectionId,
    attributes: [
      {
        trait_type: 'eyes',
        nusa_attribute_type: 'PROPERTIES',
        value: 'blue',
      }
    ],
    external_link: 'test-link',
    image: `${__dirname}/../test-data/image1.png`,
    supply: 1,
    unlockable: false,
    explicit_sensitive: false
  });
  const { ipfsUri } = resp;
  const ipfsData = await getIpfsData(ipfsUri);
  assert(ipfsData.name == 'test-item')
  assert(ipfsData.description == 'test-description')
  assert(ipfsData.nusa_collection.name == 'My Collection')
  assert(ipfsData.nusa_collection.slug == 'my-collection')
  assert(_.isEqual(ipfsData.attributes, [
    {
      trait_type: 'eyes',
      // nusa_attribute_type: 'PROPERTIES',
      value: 'blue',
    }
  ]))
  // - Client should mint item to blockchain
  let tx = await nft
    .connect(wallet)
    .mintTo(wallet.address, ethers.constants.MaxUint256, ipfsUri, 1);
  let receipt = await tx.wait();
  let transferSingleEvent = await receipt.events.find(ev => ev.event == 'TransferSingle') as TransferSingleEvent;
  let { id } = transferSingleEvent.args;

  // - Indexer should pickup minted item, read the metadata, and create item on DB
  let minted: Item;
  await retry(async () => {
    minted = await db.item.findFirstOrThrow({
      where: {
        contract_address: nft.address,
        tokenId: id.toString()
      }
    });
  }, { forever: true });
  assert(minted.uuid == ipfsData.nusa_item_id, 'assert minted.uuid failed');
  assert(minted.name == ipfsData.name, 'assert minted.name failed');
  assert(minted.description == ipfsData.description, 'assert minted.description failed');
  assert(minted.image == ipfsData.image, 'assert minted.image failed');
  assert(minted.metadata == ipfsUri, 'assert minted.metadata failed');
  assert(minted.quantity_minted == 1);
  
  let tokenOwnership = await db.tokenOwnerships.findFirst({
    where: {
      contractAddress: nft.address,
      tokenId: minted.tokenId
    }
  });
  assert(tokenOwnership.ownerAddress.toLowerCase() == wallet.address.toLowerCase(), 'assert tokenOwnership.ownerAddress failed');
  assert(tokenOwnership.quantity == 1, 'assert tokenOwnership.quantity failed');

  console.log('Create Item On Chain test passed');
}