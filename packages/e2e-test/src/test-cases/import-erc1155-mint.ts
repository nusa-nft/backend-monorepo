import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { ImportedContracts, Item, PrismaClient, TokenOwnerships } from "@nusa-nft/database";
import { ethers } from "ethers";
import { ERC1155_dummy } from "@nusa-nft/smart-contract/typechain-types"
import { uploadMetadataToIpfs, uploadToFileToIpfs } from "../lib/ipfs";
import { increaseTime } from "../lib/time";
import retry from "async-retry";
import { TransferBatchEvent, TransferBatchEventObject, TransferSingleEvent } from "@nusa-nft/smart-contract/typechain-types/contracts/ERC1155_dummy";
import { assert, fmtFailed, fmtSuccess } from "../lib/assertions";

export async function importERC1155Mint({
    restApi,
    db,
    web3Provider,
    erc1155,
    minter,
    receiver
  }: {
    restApi: INestApplication;
    db: PrismaClient,
    web3Provider: ethers.providers.Web3Provider,
    erc1155: ERC1155_dummy,
    minter: ethers.Wallet,
    receiver: ethers.Wallet,
  }) {
    // Clean the queue
    console.log('Cleaning the queue...');
    await request(restApi.getHttpServer())
      .delete('/collection/import-queue')
      .send();

    // Upload some metadata to ipfs and Mint some NFTs
    const metadataIpfsHashes = [];
    const transferSingleEvents = [];
    for (let i = 0; i < 5; i++) {
      let resp = await uploadToFileToIpfs(`${__dirname}/../test-data/image1.png`);
      const fileIpfsHash = `ipfs://${resp.Hash}`;
      const metadata = {
        name: `test-item-${i}`,
        description: 'test-description',
        image: fileIpfsHash,
        attributes: [
          {
            trait_type: 'hair',
            value: `hair-variant-${i}`,
          },
          {
            trait_type: 'eyes',
            value: `eyes-variant-${i}`,
          }
        ] 
      }
      resp = await uploadMetadataToIpfs(metadata);
      const metadataIpfsHash = `ipfs://${resp.Hash}`;
      metadataIpfsHashes.push(metadataIpfsHash);

      // Mint some nfts
      let tx = await erc1155.connect(minter).mint(
        receiver.address,
        ethers.constants.MaxUint256,
        metadataIpfsHash,
        1,
        []
      );
      let receipt = await tx.wait();
      let transferSingleEvent = receipt.events?.find(e => e.event === 'TransferSingle') as TransferSingleEvent;
      transferSingleEvents.push(transferSingleEvent);
    }

    await increaseTime(web3Provider, 3600);

    const resp = await request(restApi.getHttpServer())
      .post('/collection/import-queue')
      .send({
        contractAddress: erc1155.address,
        categoryId: 1
      });
    console.log(resp.body);

    // Wait for worker to pickup job
    // await new Promise(resolve => setTimeout(resolve, 60000));
    let importedContract: ImportedContracts;
    await retry(async () => {
      importedContract = await db.importedContracts.findFirstOrThrow({
        where: {
          contractAddress: erc1155.address
        }
      });
      if (!importedContract.isImportFinish) {
        throw new Error('Import not finish')
      }
    }, { retries: 5 })

    // Check if imported nfts are recorded to DB
    let items: Item[];
    await retry(async () => {
      items = await db.item.findMany({
        where: {
          contract_address: erc1155.address,
        },
        orderBy: { tokenId: 'asc' }
      });
      if (items.length !== 5) {
        throw new Error('Not all items are imported')
      }
    }, { retries: 5 });
    for (const [i, item] of items.entries()) {
      let [operator, from, to, id, value ] = transferSingleEvents[i].args;
      assert(item.tokenId.toNumber() === id.toNumber(), fmtFailed(`Token ID mismatch, ${item.tokenId.toNumber()}, ${id.toNumber()}`));
      assert(item.metadata == metadataIpfsHashes[i], fmtFailed(`Metadata mismatch, ${item.metadata}, ${metadataIpfsHashes[i]}`));
    }
    console.log(fmtSuccess('Imported NFTs are recorded to DB'));

    // Check if tokenOwnership is correct
    let tokenOwnerships: TokenOwnerships[];
    await retry(async () => {
      tokenOwnerships = await db.tokenOwnerships.findMany({
        where: {
          contractAddress: erc1155.address,
        },
        orderBy: { tokenId: 'asc' }
      })
      if (tokenOwnerships.length !== 5) {
        throw new Error('Not all token ownerships are imported')
      }
    })
    for (const [i, tokenOwnership] of tokenOwnerships.entries()) {
      let [operator, from, to, id, value ] = transferSingleEvents[i].args;
      assert(tokenOwnership.tokenId.toNumber() === id.toNumber(), fmtFailed(`Token ID mismatch, ${tokenOwnership.tokenId.toNumber()}, ${id.toNumber()}`));
      assert(tokenOwnership.ownerAddress === receiver.address, fmtFailed(`Owner address mismatch, ${tokenOwnership.ownerAddress}, ${receiver.address}`));
      assert(tokenOwnership.quantity === value.toNumber(), fmtFailed(`Quantity mismatch, ${tokenOwnership.quantity}, ${value.toNumber()}`));
    }
    console.log(fmtSuccess('Imported NFTs Token ownership is correct'));

    // Mint some more nfts
    const metadataIpfsHashes_2 = [];
    const transferSingleEvents_2 = [];
    for (let i = 5; i < 10; i++) {
      let resp = await uploadToFileToIpfs(`${__dirname}/../test-data/image1.png`);
      const fileIpfsHash = `ipfs://${resp.Hash}`;
      const metadata = {
        name: `test-item-${i}`,
        description: 'test-description',
        image: fileIpfsHash,
        attributes: [
          {
            trait_type: 'hair',
            value: `hair-variant-${i}`,
          },
          {
            trait_type: 'eyes',
            value: `eyes-variant-${i}`,
          }
        ] 
      }
      resp = await uploadMetadataToIpfs(metadata);
      const metadataIpfsHash = `ipfs://${resp.Hash}`;
      metadataIpfsHashes_2.push(metadataIpfsHash);
      // Mint some nfts
      let tx = await erc1155.connect(minter).mint(
        receiver.address,
        ethers.constants.MaxUint256,
        metadataIpfsHash,
        1,
        []
      );
      let receipt = await tx.wait();
      let transferSingleEvent = receipt.events?.find(e => e.event === 'TransferSingle') as TransferSingleEvent;
      transferSingleEvents_2.push(transferSingleEvent);
    }
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Check if imported nfts are recorded to DB
    let itemsAfterImport: Item[];
    await retry(async () => {
      itemsAfterImport = await db.item.findMany({
        where: {
          contract_address: erc1155.address,
          tokenId: { in: transferSingleEvents_2.map(ev => ev.args.id.toString()) }
        },
        orderBy: { tokenId: 'asc' }
      });
      if(itemsAfterImport.length !== 5) {
        throw new Error('Not all items are imported')
      }
    }, { retries: 5 });
    for (const [i, item] of itemsAfterImport.entries()) {
      let [operator, from, to, id, value ] = transferSingleEvents_2[i].args;
      assert(item.tokenId.toNumber() === id.toNumber(), fmtFailed(`Token ID mismatch, ${item.tokenId.toNumber()}, ${id.toNumber()}`));
      assert(item.metadata == metadataIpfsHashes_2[i], fmtFailed(`Metadata mismatch, ${item.metadata}, ${metadataIpfsHashes_2[i]}`));
    }
    console.log(fmtSuccess('Imported NFTs are indexed and are recorded to DB'));

    // Check if tokenOwnership is correct
    let tokenOwnershipsAfterImport: TokenOwnerships[];
    await retry(async () => {
      tokenOwnershipsAfterImport = await db.tokenOwnerships.findMany({
        where: {
          contractAddress: erc1155.address,
          tokenId: { in: transferSingleEvents_2.map(ev => ev.args.id.toString()) }
        },
        orderBy: { tokenId: 'asc' }
      })
      if (tokenOwnershipsAfterImport.length !== 5) {
        throw new Error('Token ownership not updated')
      }
    })
    for (const [i, tokenOwnership] of tokenOwnershipsAfterImport.entries()) {
      let [operator, from, to, id, value ] = transferSingleEvents_2[i].args;
      assert(tokenOwnership.tokenId.toNumber() === id.toNumber(), fmtFailed(`Token ID mismatch, ${tokenOwnership.tokenId.toNumber()}, ${id.toNumber()}`));
      assert(tokenOwnership.ownerAddress === receiver.address, fmtFailed(`Owner address mismatch, ${tokenOwnership.ownerAddress}, ${receiver.address}`));
      assert(tokenOwnership.quantity === value.toNumber(), fmtFailed(`Quantity mismatch, ${tokenOwnership.quantity}, ${value.toNumber()}`));
    }
    console.log(fmtSuccess('Imported NFTs are indexed and Token ownership is correct'));
    // console.log({ resp });
  }