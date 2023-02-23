import { Collection, Prisma, PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';
import * as path from 'path';
import { AttributeType } from '..';
import { mintItem } from './helpers/mint-item';
import {
  uploadImageToIpfs,
  uploadMetadataToIpfs,
} from './helpers/upload-ipfs';
import { v4 as uuidV4 } from 'uuid';

const prisma = new PrismaClient();

// Mumbai Testnet
const BLOCKCHAIN = Number(process.env.CHAIN_ID);
const TOKEN_STANDARD = 'ERC1155';

const mockUserData = () => {
  return [
    {
      wallet_address: process.env.TEST_WALLET_ADDRESS as string,
      first_name: 'John',
      last_name: 'Doe',
      username: 'john-doe',
      profile_picture: 'photo-1665712259311-39909049c381.jpg',
      cover_picture: 'photo-1667179971021-8998ae155265.jpg',
    },
    {
      wallet_address: process.env.TEST_WALLET_ADDRESS_2 as string,
      first_name: 'Jane',
      last_name: 'Doe',
      username: 'jane-doe',
      profile_picture: 'photo-1667102818988-65c8976d2c04.jpg',
      cover_picture: 'photo-1666378441296-21edb6975a82.jpg',
    },
    {
      wallet_address: process.env.TEST_WALLET_ADDRESS_3 as string,
      first_name: 'Budi',
      last_name: 'Prakoso',
      username: 'budi-prakoso',
      profile_picture: 'photo-1667114790613-23f1d1d1f1f5.jpg',
      cover_picture: 'photo-1666289037937-75ef4f37a6df.jpg',
    },
  ]
}

const mockCategories = () => {
  return [
    { name: 'Photography' },
    { name: 'Sports' },
    { name: 'Music' },
    { name: 'Collectibles' },
    { name: 'Trading Cards' },
    { name: 'Art' },
  ];
};

const mockCollections = (users: Array<any>): (Prisma.CollectionCreateInput & any)[] => {
  return [
    {
      logo_image: 'image_350x350 (1).jpg',
      featured_image: 'image_600x400 (1).jpg',
      banner_image: 'image_1400x350 (1).jpg',
      name: 'NFT Cannonball',
      slug: 'nft-cannonball',
      url: 'http://tadpolenft.io/collection/nft-cannonball',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in.',
      contract_address: process.env.NFT_CONTRACT_ADDRESS,
      creator_address: users[0].wallet_address,
      category_id: 1,
      chainId: BLOCKCHAIN,
      payment_token: ethers.constants.AddressZero,
      royalty: {
        createMany: {
          data: [
            {
              wallet_address: users[0].wallet_address,
              percentage: 0.05,
            },
          ],
        }
      }
    },
    {
      logo_image: 'image_350x350 (2).jpg',
      featured_image: 'image_600x400 (2).jpg',
      banner_image: 'image_1400x350 (2).jpg',
      name: 'Monsters',
      slug: 'monsters',
      url: 'http://tadpolenft.io/collection/monsters',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in.',
      contract_address: process.env.NFT_CONTRACT_ADDRESS,
      creator_address: users[0].wallet_address,
      category_id: 1,
      chainId: BLOCKCHAIN,
      payment_token: ethers.constants.AddressZero,
      royalty: {
        createMany: {
          data: [
            {
              wallet_address: users[0].wallet_address,
              percentage: 0.05,
            },
          ],
        }
      }
    },
    {
      logo_image: 'image_350x350 (3).jpg',
      featured_image: 'image_600x400 (3).jpg',
      banner_image: 'image_1400x350 (3).jpg',
      name: 'Cyclo GRI07',
      slug: 'cyclo-gri07',
      url: 'http://tadpolenft.io/collection/cyclo-gri07',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in.',
      contract_address: process.env.NFT_CONTRACT_ADDRESS,
      creator_address: users[0].wallet_address,
      category_id: 1,
      chainId: BLOCKCHAIN,
      payment_token: ethers.constants.AddressZero,
      royalty: {
        createMany: {
          data: [
            {
              wallet_address: users[0].wallet_address,
              percentage: 0.05,
            },
          ],
        }
      }
    },
    {
      logo_image: 'image_350x350 (4).jpg',
      featured_image: 'image_600x400 (4).jpg',
      banner_image: 'image_1400x350 (4).jpg',
      name: 'Haoejifva',
      slug: 'haoejifva',
      url: 'http://tadpolenft.io/collection/haoejifva',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in.',
      contract_address: process.env.NFT_CONTRACT_ADDRESS,
      creator_address: users[0].wallet_address,
      category_id: 2,
      chainId: BLOCKCHAIN,
      payment_token: ethers.constants.AddressZero,
      royalty: {
        createMany: {
          data: [
            {
              wallet_address: users[0].wallet_address,
              percentage: 0.05,
            },
          ],
        }
      }
    },
    {
      logo_image: 'image_350x350 (5).jpg',
      featured_image: 'image_600x400 (5).jpg',
      banner_image: 'image_1400x350 (5).jpg',
      name: 'NFTArt #1',
      slug: 'nftart-1',
      url: 'http://tadpolenft.io/collection/nftart-1',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in.',
      contract_address: process.env.NFT_CONTRACT_ADDRESS,
      creator_address: users[1].wallet_address,
      category_id: 2,
      chainId: BLOCKCHAIN,
      payment_token: ethers.constants.AddressZero,
      royalty: {
        createMany: {
          data: [
            {
              wallet_address: users[1].wallet_address,
              percentage: 0.05,
            },
          ],
        }
      }
    },
    {
      logo_image: 'image_350x350 (6).jpg',
      featured_image: 'image_600x400 (6).jpg',
      banner_image: 'image_1400x350 (6).jpg',
      name: 'Hond of God',
      slug: 'hond-of-god',
      url: 'http://tadpolenft.io/collection/hond-of-god',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in.',
      contract_address: process.env.NFT_CONTRACT_ADDRESS,
      creator_address: users[1].wallet_address,
      category_id: 3,
      chainId: BLOCKCHAIN,
      payment_token: ethers.constants.AddressZero,
      royalty: {
        createMany: {
          data: [
            {
              wallet_address: users[1].wallet_address,
              percentage: 0.05,
            },
          ],
        }
      }
    },
    {
      logo_image: 'image_350x350 (7).jpg',
      featured_image: 'image_600x400 (7).jpg',
      banner_image: 'image_1400x350 (7).jpg',
      name: 'Calibration',
      slug: 'calibration',
      url: 'http://tadpolenft.io/collection/calibration',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in.',
      contract_address: process.env.NFT_CONTRACT_ADDRESS,
      creator_address: users[1].wallet_address,
      category_id: 3,
      chainId: BLOCKCHAIN,
      payment_token: ethers.constants.AddressZero,
      royalty: {
        createMany: {
          data: [
            {
              wallet_address: users[1].wallet_address,
              percentage: 0.05,
            },
          ],
        }
      }
    },
    {
      logo_image: 'image_350x350 (8).jpg',
      featured_image: 'image_600x400 (8).jpg',
      banner_image: 'image_1400x350 (8).jpg',
      name: 'Queenz',
      slug: 'queenz',
      url: 'http://tadpolenft.io/collection/queenz',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in.',
      contract_address: process.env.NFT_CONTRACT_ADDRESS,
      creator_address: users[1].wallet_address,
      category_id: 4,
      chainId: BLOCKCHAIN,
      payment_token: ethers.constants.AddressZero,
      royalty: {
        createMany: {
          data: [
            {
              wallet_address: users[1].wallet_address,
              percentage: 0.05,
            },
          ],
        }
      }
    },
    {
      logo_image: 'image_350x350 (9).jpg',
      featured_image: 'image_600x400 (9).jpg',
      banner_image: 'image_1400x350 (9).jpg',
      name: 'HoloHolo',
      slug: 'holoholo',
      url: 'http://tadpolenft.io/collection/holoholo',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in.',
      contract_address: process.env.NFT_CONTRACT_ADDRESS,
      creator_address: users[2].wallet_address,
      category_id: 4,
      chainId: BLOCKCHAIN,
      payment_token: ethers.constants.AddressZero,
      royalty: {
        createMany: {
          data: [
            {
              wallet_address: users[2].wallet_address,
              percentage: 0.05,
            },
          ],
        }
      }
    },
    {
      logo_image: 'image_350x350 (10).jpg',
      featured_image: 'image_600x400 (10).jpg',
      banner_image: 'image_1400x350 (10).jpg',
      name: 'Cat Journey21',
      slug: 'cat-journey21',
      url: 'http://tadpolenft.io/collection/cat-journey21',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in.',
      contract_address: process.env.NFT_CONTRACT_ADDRESS,
      creator_address: users[2].wallet_address,
      category_id: 5,
      chainId: BLOCKCHAIN,
      payment_token: ethers.constants.AddressZero,
      royalty: {
        createMany: {
          data: [
            {
              wallet_address: users[2].wallet_address,
              percentage: 0.05,
            },
          ],
        }
      }
    },
    {
      logo_image: 'image_350x350 (11).jpg',
      featured_image: 'image_600x400 (11).jpg',
      banner_image: 'image_1400x350 (11).jpg',
      name: 'The Era',
      slug: 'the-era',
      url: 'http://tadpolenft.io/collection/the-era',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in.',
      contract_address: process.env.NFT_CONTRACT_ADDRESS,
      creator_address: users[2].wallet_address,
      category_id: 5,
      chainId: BLOCKCHAIN,
      payment_token: ethers.constants.AddressZero,
      royalty: {
        createMany: {
          data: [
            {
              wallet_address: users[2].wallet_address,
              percentage: 0.05,
            },
          ],
        }
      }
    },
    {
      logo_image: 'image_350x350 (12).jpg',
      featured_image: 'image_600x400 (12).jpg',
      banner_image: 'image_1400x350 (12).jpg',
      name: 'Plant',
      slug: 'plant',
      url: 'http://tadpolenft.io/collection/plant',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in.',
      contract_address: process.env.NFT_CONTRACT_ADDRESS,
      creator_address: users[2].wallet_address,
      category_id: 6,
      chainId: BLOCKCHAIN,
      payment_token: ethers.constants.AddressZero,
      royalty: {
        createMany: {
          data: [
            {
              wallet_address: users[2].wallet_address,
              percentage: 0.05,
            },
          ],
        }
      }
    },
  ]
}

async function main() {
  const categories = mockCategories();
  const createCategories = await prisma.category.createMany({
    data: categories,
  });

  const users = mockUserData();
  const createdUsers = await prisma.$transaction(
    users.map(u => prisma.user.create({ data: u }))
  )

  const collections = mockCollections(users)
  const createdCollections = await prisma.$transaction(
    collections.map(c => prisma.collection.create({ data: c }))
  )

  const items: Prisma.ItemCreateInput[] = []
  for (let cc of createdCollections) {
    // For each collection create 4 items
    let counter = 1;
    while (counter <= 4) {
      const imageIpfsData = await uploadImageToIpfs(path.join(__dirname, 'helpers/seed-images/' + `image-${counter}.png`))
      const image = `ipfs://${imageIpfsData.Hash}`;
      const name = `${cc.name}-item-${counter}`;
      const description = `${cc.name} description item-${counter}`;
      const attributes = [
        {
          trait_type: "property",
          nusa_attribute_type: AttributeType.PROPERTIES,
          value: `variant-${counter}`,
          opensea_display_type: null,
        },
        {
          trait_type: "level",
          nusa_attribute_type: AttributeType.LEVELS,
          value: String(counter),
          max_value: "",
          opensea_display_type: "number",
        },
        {
          trait_type: "stat",
          nusa_attribute_type: AttributeType.STATS,
          value: String(counter * 2),
          max_value: "",
          opensea_display_type: null,
        }
      ]
      const metadataIpfsData = await uploadMetadataToIpfs({
        name,
        description,
        image,
        attributes,
        nusa_collection: {
          name: cc.name,
          slug: cc.slug as string,
        },
        explicit_sensitive: cc.explicit_sensitive,
        external_link: 'external-link',
        nusa_item_id: uuidV4(),
      });
      const metadata = `ipfs://${metadataIpfsData.Hash}`;
      const supply = 1;

      const tokenId = await mintItem(cc.creator_address, metadata, supply)
      console.log(`minted tokenId ${tokenId}`)

      const createItem = {
        name,
        description,
        Collection: {
          connect: { id: Number(cc.id) }
        },
        external_link: `${cc.name}-item-${counter}.io`,
        image,
        Creator: {
          connect: {
            id: createdUsers.find(u => u.wallet_address == cc.creator_address)?.id,
          },
        },
        contract_address: cc.contract_address,
        chainId: cc.chainId,
        tokenId,
        supply,
        unlockable: false,
        metadata,
        explicit_sensitive: false,
        is_metadata_freeze: true,
        quantity_minted: 1,
        attributes: {
          createMany: {
            data: attributes,
          }
        },
        token_standard: TOKEN_STANDARD,
      }

      items.push(createItem);

      counter++
    }
  }

  const createdItems = await prisma.$transaction(
    items.map(it => prisma.item.create({ data: it }))
  )

  console.log({
    createCategories,
    createdUsers,
    createdCollections,
    createdItems,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
