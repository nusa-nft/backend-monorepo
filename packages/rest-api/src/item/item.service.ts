import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  ActivitiesParams,
  ItemDto,
  ItemQueryParams,
  LazyMintListingDto,
  OnSaleQueryParams,
  PaginationQueryParams,
  SaleHistoryQueryParams,
} from './dto/item.dto';
import { IpfsService } from '../ipfs/ipfs.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttributeType, Item, ItemViews, TokenType } from '@prisma/client';
import standardizeMetadataAttribute from '../lib/standardizeMetadataAttributes';
import { isArray, isObject } from 'class-validator';
import { JwtService } from '@nestjs/jwt';
import { ethers } from 'ethers';
import { ConfigService } from '@nestjs/config';
import { IndexerService } from 'src/indexer/indexer.service';
import { UsersService } from 'src/users/users.service';
import { MintRequestStruct, signMintRequest } from './web3/erc1155-lazy-mint';
import { NATIVE_CURRENCY } from './web3/constants';
import { CollectionService } from 'src/collection/collection.service';
import { formatDistance } from 'date-fns';

@Injectable()
export class ItemService {
  MAX_INTEGER = 2147483647;

  constructor(
    private prisma: PrismaService,
    private ipfsService: IpfsService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private indexerService: IndexerService,
    private usersService: UsersService,
    @Inject(forwardRef(() => CollectionService))
    private collectionService: CollectionService,
  ) {}

  private provider: ethers.providers.Provider;

  async onModuleInit(): Promise<void> {
    this.provider = new ethers.providers.JsonRpcProvider(
      this.configService.get<string>('RPC_URL'),
    );
  }

  async createItem(
    createItemDto: ItemDto,
    file: Express.Multer.File,
    userId: number,
    userWalletAddress: string,
  ) {
    const contract_address = process.env.NFT_CONTRACT_ADDRESS;
    let image = '';
    let metadata = '';
    let attributeData = [];
    let collection_id = createItemDto.collection_id;

    // If no collection, create collection automatically
    if (!collection_id) {
      const myCollection = await this.collectionService.findMyCollection(
        userId,
        { page: 1 },
      );

      let collectionName = `Untitled Collection ${userWalletAddress}`;
      if (myCollection.records.length > 0) {
        collectionName += ` ${myCollection.records[0].id + 1}`;
      }

      const { slug } = await this.collectionService.getSlug(collectionName);

      const collection = await this.collectionService.createCollection(
        userWalletAddress,
        {
          category_id: 1,
          name: collectionName,
          chainId: createItemDto.chainId,
          creator_address: userWalletAddress,
          slug,
          explicit_sensitive: false,
          // TODO: Set default logo image to a variable
          logo_image: 'ipfs://QmaTCGzpQBRy1rmCcwqtY1t8MPj4NkfhjdqLRStoPPbpPC', // default logo image
        },
      );

      collection_id = collection.data.id;
    }

    if (createItemDto.attributes) {
      attributeData = JSON.parse(createItemDto.attributes);
      attributeData = this.nusaTypeValidator(attributeData);
    }

    // If freeze metadata, upload to IPFS
    if (createItemDto.is_metadata_freeze) {
      console.log({ file });
      const ipfsImageData = await this.ipfsService.uploadImage(file.path);
      const standardizeMetadata = standardizeMetadataAttribute(attributeData);
      const ipfsMetadata = await this.ipfsService.uploadMetadata({
        name: createItemDto.name,
        description: createItemDto.description,
        image,
        attributes: standardizeMetadata,
      });
      image = `ipfs://${ipfsImageData.Hash}`;
      metadata = `ipfs://${ipfsMetadata.Hash}`;
    } else {
      // Save image and metadata as API URL to nusa server
      image = process.env.API_IMAGE_SERVE_URL
        ? process.env.API_IMAGE_SERVE_URL + '/' + file.filename
        : 'https://nft.nusa.finance/uploads/' + file.filename;
    }

    const Item = await this.prisma.item.create({
      data: {
        name: createItemDto.name,
        description: createItemDto.description,
        Collection: {
          connect: {
            id: Number(collection_id),
          },
        },
        external_link: createItemDto.external_link,
        image,
        Creator: {
          connect: {
            id: userId,
          },
        },
        contract_address: contract_address,
        chainId: Number(createItemDto.chainId),
        supply: Number(createItemDto.supply),
        unlockable: createItemDto.unlockable,
        metadata,
        explicit_sensitive: createItemDto.explicit_sensitive,
        is_metadata_freeze: createItemDto.is_metadata_freeze,
        // If item is_minted, quantity_minted is supply, else 0
        quantity_minted: createItemDto.is_minted ? createItemDto.supply : 0,
        attributes: {
          createMany: {
            data: attributeData,
          },
        },
        token_standard: TokenType.ERC1155,
      },
      include: {
        attributes: true,
        Creator: {
          select: {
            username: true,
            wallet_address: true,
          },
        },
      },
    });

    const item = await this.prisma.item.update({
      where: { id: Item.id },
      data: {
        metadata: `${process.env.API_BASE_URL}/item/metadata/${Item.id}`,
      },
      include: {
        attributes: true,
        Creator: {
          select: {
            username: true,
            wallet_address: true,
          },
        },
      },
    });

    return {
      status: HttpStatus.CREATED,
      message: 'Item created',
      data: item,
    };
  }

  async getItem(id: number, token: string | null) {
    let userId = null;
    if (token) {
      const user = this.jwtService.decode(token);
      userId = user.sub;
    }

    const item = await this.prisma.item.findUnique({
      where: { id },
      include: {
        attributes: true,
        Collection: true,
        LazyMintListing: {
          where: {
            isCancelled: false,
            endTime: { gt: Math.floor(Date.now() / 1000) },
          },
          orderBy: { id: 'desc' },
          take: 1,
        },
        Creator: true,
        ItemViews: {
          orderBy: { id: 'desc' },
          take: 5,
          include: {
            User: true,
          },
        },
      },
    });

    await this.isLikedValidator(item, userId);

    const relatedItemsInCollection = await this.pickRandom(
      item.collection_id,
      id,
    );
    Object.assign(item, { relatedItems: relatedItemsInCollection });

    // If item already minted on Blockchain
    // - get token owners from indexer
    // - should not have lazy mint listing
    // - get active listing from indexer
    if (item.quantity_minted > 0) {
      const owners = await this.getTokenOwners(item.tokenId);
      Object.assign(item, { owners });

      item.LazyMintListing = [];
      const listings = await this.getItemActiveListing(item);
      console.log({ listings });
      Object.assign(item, { ItemActiveListings: listings });
    } else {
      // else, item is lazy minted (only stored on DB)
      // - owner is only the creator
      // - set ActiveLazyMintListing if any
      const owners = [
        {
          wallet_address: item.Creator.wallet_address,
          username: item.Creator.username,
          profile_picture: item.Creator.profile_picture,
          quantity: item.supply,
        },
      ];
      Object.assign(item, { owners });

      if (item.LazyMintListing.length > 0) {
        Object.assign(item, { ActiveLazyMintListing: item.LazyMintListing[0] });
      }
    }

    return item;
  }

  async retrieveListingOffers(listing) {
    const rawOffersData = await this.indexerService.getListingOffers(
      listing.listingId,
    );

    const offers = [];
    let highestOffer = { price: 0, from: null };
    // eslint-disable-next-line prefer-const
    for (let o of rawOffersData) {
      let price = 0;
      if (o.currency == NATIVE_CURRENCY) {
        price = o.totalOfferAmount;
      }
      const user = await this.usersService.findWalletOne(
        o.offeror.toLowerCase(),
      );
      const offer = {
        ...o,
        price,
        from: user,
      };

      offers.push(offer);
      if (offer.price > highestOffer.price) {
        highestOffer = offer;
      }
    }

    return { ...listing, offers, highestOffer };
  }

  async getItemMetadata(itemId: number) {
    const item = await this.prisma.item.findFirstOrThrow({
      where: { id: itemId },
      include: {
        attributes: true,
      },
    });

    const attributes = standardizeMetadataAttribute(item.attributes);

    return {
      name: item.name,
      description: item.description,
      image: item.image,
      attributes,
    };
  }

  async getItemActiveListing(item: Item) {
    const listings = await this.indexerService.getItemActiveListing(
      item.contract_address,
      item.tokenId,
    );
    console.log({ listingsFromIndexer: listings });
    const ret = [];
    for (const l of listings) {
      const user = await this.usersService.findWalletOne(l.lister);
      if (user) {
        const lister = {
          wallet_address: user.wallet_address,
          username: user.username,
          profile_picture: user.profile_picture,
        };
        ret.push({ ...l, lister });

        continue;
      }

      ret.push({
        ...l,
        lister: { wallet_address: l.lister },
      });
    }
    // Retrieve Listing Offers
    if (ret.length > 0) {
      for (let i = 0; i < ret.length; i++) {
        const listing = await this.retrieveListingOffers(ret[i]);
        ret[i] = listing;
      }
    }
    return ret;
  }

  async getTokenOwners(tokenId: number) {
    const ownersMap = await this.indexerService.getTokenOwners(tokenId);
    const owners = [];
    for (const [walletAddress, quantity] of Object.entries(ownersMap)) {
      const user = await this.usersService.findWalletOne(walletAddress);
      if (user) {
        const owner = {
          wallet_address: walletAddress,
          username: user.username,
          profile_picture: user.profile_picture,
          quantity,
        };
        owners.push(owner);
        continue;
      }
      owners.push({
        wallet_address: walletAddress,
        quantity,
      });
    }

    return owners;
  }

  async setMinted(itemId: number, tokenId: number) {
    if (!tokenId && tokenId != 0) {
      throw new HttpException('tokenId is required', HttpStatus.BAD_REQUEST);
    }

    let item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new HttpException('item not found', HttpStatus.NOT_FOUND);
    }

    item = await this.prisma.item.update({
      where: {
        id: itemId,
      },
      data: {
        tokenId,
        quantity_minted: item.supply,
      },
    });

    return {
      status: HttpStatus.OK,
      message: 'Item updated',
      data: item,
    };
  }

  async getItems(filter: ItemQueryParams, token: string | null) {
    let userId = null;
    if (token) {
      const user = this.jwtService.decode(token);
      userId = user.sub;
    }
    const { attributes, page, name, collectionId } = filter;

    let where: Record<string, any> = {
      collection_id: { equals: +collectionId },
      deleted: false,
    };

    if (attributes) {
      const attributesFilter = [];
      for (const [key, value] of Object.entries(attributes)) {
        if (isArray(value)) {
          value.forEach((v: string) => {
            attributesFilter.push({
              trait_type: key,
              value: v,
            });
          });
          continue;
        }

        if (isObject(value)) {
          let attFilter = {
            trait_type: key,
            value: {},
          };
          let attFilterValue = {};
          if (value['min']) {
            attFilterValue = {
              gte: String(value['min']),
            };
          }
          if (value['max']) {
            attFilterValue = {
              ...attFilterValue,
              lte: String(value['max']),
            };
          }
          attFilter = {
            ...attFilter,
            value: attFilterValue,
          };
          attributesFilter.push(attFilter);
          continue;
        }

        attributesFilter.push({
          trait_type: key,
          value,
        });
      }

      where = {
        ...where,
        attributes: {
          some: {
            OR: attributesFilter,
          },
        },
      };
    }

    if (name) {
      where = {
        ...where,
        name: {
          contains: name,
          mode: 'insensitive',
        },
      };
    }

    const dataCount = await this.prisma.item.aggregate({
      _count: true,
      where,
    });

    const items = await this.prisma.item.findMany({
      skip: 10 * (page ? page - 1 : 10 - 1),
      take: 10,
      where,
      include: {
        attributes: true,
        LazyMintListing: true,
      },
      orderBy: { id: 'desc' },
    });

    const itemsWithIsLiked = await Promise.all(
      items.map(async (data) => {
        await this.isLikedValidator(data, userId);
        return data;
      }),
    );

    const records = await this.getItemsOnChainListing(itemsWithIsLiked);

    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata: {
        page,
        perPage: 10,
        pageCount: Math.ceil(dataCount._count / 10),
        totalCount: dataCount._count,
      },
      records,
    };
  }

  async getActiveOnsaleItems(filter: OnSaleQueryParams, token: string | null) {
    const items = [];
    let lazyMintedItemData;
    let totalCount = 0;
    let userId = null;
    if (token) {
      const user = this.jwtService.decode(token);
      userId = user.sub;
    }

    const {
      page,
      sortBy,
      categoryId,
      nsfwOnly,
      showLazyMinted,
      owner_address,
    } = filter;

    const listingData = await this.indexerService.getMarketplaceActiveListings(
      page,
      sortBy,
      owner_address,
    );

    for (const listing of listingData.records) {
      const { tokenId } = listing;
      let where: Record<string, any> = {
        tokenId,
        deleted: false,
      };

      if (categoryId) {
        where = {
          ...where,
          Collection: {
            Category: {
              id: +categoryId,
            },
          },
        };
      }

      if (nsfwOnly == true) {
        where = {
          ...where,
          explicit_sensitive: true,
        };
      }

      const data = await this.prisma.item.findFirst({
        where,
        include: {
          attributes: true,
        },
      });

      const listingWithOffers = await this.retrieveListingOffers(listing);
      items.push({
        ...data,
        ItemActiveListings: listingWithOffers,
      });

      // total data after sorted
      const countData = await this.prisma.item.aggregate({
        _count: true,
        where,
      });
      totalCount = totalCount + countData._count;
    }

    const metadata = listingData.metadata;

    if (showLazyMinted) {
      lazyMintedItemData = await this.prisma.item.findMany({
        where: {
          creator_address: owner_address,
          LazyMintListing: {
            some: {},
          },
        },
      });
    }
    items.push(lazyMintedItemData);

    const noNullItemData = items.filter(Boolean);

    const itemsWithIsLiked = await Promise.all(
      noNullItemData.map(async (data) => {
        await this.isLikedValidator(data, userId);
        return data;
      }),
    );
    Object.assign(metadata, { totalCount });
    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata,
      records: itemsWithIsLiked,
    };
  }

  async like(userId: number, itemId: number) {
    const likeData = await this.prisma.itemLikes.findFirst({
      where: {
        userId,
        itemId,
      },
    });

    if (likeData) {
      await this.prisma.itemLikes.delete({
        where: {
          id: likeData.id,
        },
      });
      await this.prisma.item.update({
        where: {
          id: itemId,
        },
        data: {
          itemLikeCount: {
            decrement: 1,
          },
        },
      });
    } else {
      const data = await this.prisma.itemLikes.create({
        data: {
          User: {
            connect: {
              id: userId,
            },
          },
          Item: {
            connect: {
              id: itemId,
            },
          },
        },
      });
      await this.prisma.item.update({
        where: {
          id: itemId,
        },
        data: {
          itemLikeCount: {
            increment: 1,
          },
        },
      });
      return data;
    }
  }

  async getFavorite(userId: number, pagination: PaginationQueryParams) {
    let { page } = pagination;
    if (!page) page = 1;

    const where = {
      ItemLikes: {
        some: {
          User: {
            id: userId,
          },
        },
      },
    };

    const dataCount = await this.prisma.item.aggregate({
      _count: true,
      where,
    });

    let items = await this.prisma.item.findMany({
      skip: 10 * (page - 1),
      take: 10,
      where,
      include: {
        LazyMintListing: {
          where: {
            isCancelled: false,
            endTime: { gt: Math.floor(Date.now() / 1000) },
          },
          orderBy: { id: 'desc' },
          take: 1,
        },
      },
    });

    items = items.map((it) => ({ ...it, isLiked: true }));

    const records = await this.getItemsOnChainListing(items);

    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata: {
        page,
        perPage: 10,
        pageCount: Math.ceil(dataCount._count / 10),
        totalCount: dataCount._count,
      },
      records,
    };
  }

  async filter(collection_id: number) {
    const filterData = await this.prisma.attributes.findMany({
      where: {
        Item: {
          collection_id,
        },
      },
      select: {
        trait_type: true,
        value: true,
        nusa_attribute_type: true,
      },
    });

    const propertyType = filterData.filter(
      (data) => data.nusa_attribute_type == AttributeType.PROPERTIES,
    );

    const levelType = filterData.filter(
      (data) => data.nusa_attribute_type == AttributeType.LEVELS,
    );

    const statType = filterData.filter(
      (data) => data.nusa_attribute_type == AttributeType.STATS,
    );

    const property = this.filterData(propertyType);
    const level = this.filterData(levelType);
    const status = this.filterData(statType);

    const mergedData = [...property, ...level, ...status];
    return mergedData;
  }

  nusaTypeValidator(
    attributes: {
      trait_type: string;
      nusa_attribute_type: string;
      value: string;
      max_value: string;
      opensea_display_type: string;
    }[],
  ) {
    const opensea_display_type = attributes.map((data) => {
      if (
        data.nusa_attribute_type == AttributeType.LEVELS ||
        data.nusa_attribute_type == AttributeType.STATS
      ) {
        data.opensea_display_type = 'number';
      } else {
        data.opensea_display_type = null;
      }
      return data;
    });
    return opensea_display_type;
  }

  filterData(data: any) {
    let filter: any;
    let array: any;
    const attributeType = data[0]?.nusa_attribute_type;

    const aggregate = data.reduce((filtered, data) => {
      (filtered[data.trait_type] = filtered[data.trait_type] || []).push(
        data.value,
      );
      return filtered;
    }, {});

    if (attributeType == AttributeType.PROPERTIES) {
      filter = Object.keys(aggregate).map((key) => [
        { type: key, value: aggregate[key] },
      ]);
      array = [
        ...new Set(
          filter.map((item) => ({
            trait_type: item[0].type,
            value: [...new Set(item[0].value)],
            nusa_attribute_type: data[0].nusa_attribute_type,
          })),
        ),
      ];
    } else {
      filter = Object.keys(aggregate).map((key) => [{ type: key }]);
      array = [
        ...new Set(
          filter.map((item) => ({
            trait_type: item[0].type,
            nusa_attribute_type: data[0].nusa_attribute_type,
          })),
        ),
      ];
    }

    return array;
  }

  async view(token: string | null, itemId: number, ip: string) {
    let userId = null;
    if (token) {
      const user = this.jwtService.decode(token);
      userId = user.sub;
    }

    let view: ItemViews;
    if (userId) {
      view = await this.prisma.itemViews.findFirst({
        where: {
          itemId: itemId,
          ip,
          userId
        },
      });
      if (view) {
        return view;
      }
    } else {
      view = await this.prisma.itemViews.findFirst({
        where: {
          itemId: itemId,
          ip,
        },
      })
      if (view) {
        return view;
      }
    }

    view = await this.prisma.itemViews.create({
      data: {
        userId,
        itemId,
        ip,
      },
    });

    await this.prisma.item.update({
      where: {
        id: itemId,
      },
      data: {
        itemViewCount: {
          increment: 1,
        },
      },
    });

    return view;
  }

  async isLikedValidator(item: any, userId: number) {
    if (!item) return;
    else {
      const liked = await this.prisma.itemLikes.findFirst({
        where: {
          itemId: item.id,
          userId: userId,
        },
      });
      if (liked) {
        const likedObj = { isLiked: true };
        Object.assign(item, likedObj);
        return item;
      } else {
        const likedObj = { isLiked: false };
        Object.assign(item, likedObj);
        return item;
      }
    }
  }

  async pickRandom(collection_id: number, itemId: number) {
    const count = 6;
    const itemCount = await this.prisma.item.count({
      where: {
        collection_id,
        deleted: false,
      },
    });
    const skip = Math.max(0, Math.floor(Math.random() * itemCount) - count);

    const items = await this.prisma.item.findMany({
      take: count,
      skip: skip,
      orderBy: { id: 'desc' },
      where: {
        collection_id,
        deleted: false,
        NOT: {
          id: itemId,
        },
      },
    });

    const records = await this.getItemsOnChainListing(items);

    return records;
  }

  async deleteItem(id: number, creator_address: string) {
    await this.prisma.item.findFirstOrThrow({
      where: {
        id,
        creator_address: {
          equals: creator_address,
          mode: 'insensitive',
        },
        quantity_minted: { gt: 0 },
      },
    });

    await this.prisma.item.delete({
      where: { id },
    });

    return {
      status: HttpStatus.OK,
      message: 'success',
    };
  }

  async createLazyMintListing(
    itemId: number,
    userId: number,
    listingData: LazyMintListingDto,
  ) {
    const item = await this.prisma.item.findFirstOrThrow({
      where: {
        id: itemId,
        Creator: { id: userId },
      },
    });

    const listing = await this.prisma.lazyMintListing.findFirst({
      where: {
        itemId,
        endTime: {
          gt: Math.floor(Date.now() / 1000),
        },
        isCancelled: false,
      },
      orderBy: { id: 'desc' },
    });
    // item supply == 1
    // then need to cancel listing and create new one
    if (listing && item.supply == 1) {
      throw new HttpException(
        'There is already an active listing, cancel before creating a new listing',
        HttpStatus.BAD_REQUEST,
      );
    }
    // If item supply > 1
    // check if listing quantity <= supply
    if (listingData.quantity > item.supply) {
      throw new HttpException(
        `Can not list more than supply`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (listingData.endTime > this.MAX_INTEGER) {
      listingData.endTime = this.MAX_INTEGER;
    }

    const newListing = await this.prisma.lazyMintListing.create({
      data: {
        itemId: item.id,
        ...listingData,
        buyoutPricePerToken: listingData.buyoutPricePerToken,
        reservePricePerToken: listingData.reservePricePerToken,
        assetContract: item.contract_address,
      },
    });

    return newListing;
  }

  async cancelLazyMintListing(listingId: number) {
    const listing = await this.prisma.lazyMintListing.findFirstOrThrow({
      where: { id: listingId },
    });
    const result = await this.prisma.lazyMintListing.update({
      where: { id: listing.id },
      data: {
        isCancelled: true,
      },
    });

    return result;
  }

  async getLazyMintListingSignature(
    listingId: number,
    minterWalletAddress: string,
  ) {
    const listing = await this.prisma.lazyMintListing.findFirstOrThrow({
      where: { id: listingId },
      include: {
        Item: {
          include: {
            Collection: {
              include: {
                royalty: true,
              },
            },
          },
        },
      },
    });

    const royaltyRecipient =
      listing.Item.Collection.royalty.length > 0
        ? listing.Item.Collection.royalty[0].wallet_address
        : listing.Item.creator_address;

    const royaltyBps =
      listing.Item.Collection.royalty.reduce(
        (agg, r) => r.percentage + agg,
        0,
      ) * 10000;
    const primarySaleRecipient = listing.Item.creator_address;

    const MAX_UINT_128 = '170141183460469231731687303715884105727';

    const mintRequest: MintRequestStruct = {
      to: minterWalletAddress,
      royaltyRecipient: royaltyRecipient,
      royaltyBps,
      primarySaleRecipient,
      tokenId: ethers.constants.MaxUint256,
      uri: listing.Item.metadata,
      quantity: listing.quantity,
      pricePerToken: listing.buyoutPricePerToken.toString(),
      currency: listing.currency,
      validityStartTimestamp: 0,
      validityEndTimestamp: MAX_UINT_128,
      uid: ethers.utils.formatBytes32String(
        listingId.toString() + '-' + Math.floor(Date.now() / 1000).toString(),
      ),
    };

    const provider = new ethers.providers.JsonRpcProvider(
      this.configService.get<string>('RPC_URL'),
    );
    const nftContractOwner = new ethers.Wallet(
      this.configService.get<string>('NFT_CONTRACT_OWNER_PRIVATE_KEY'),
      provider,
    );

    const { chainId } = await provider.getNetwork();

    const signature = await signMintRequest(
      mintRequest,
      nftContractOwner,
      chainId,
      this.configService.get<string>('NFT_CONTRACT_ADDRESS'),
    );

    return {
      mintRequest,
      signature,
    };
  }

  async getCreatedByUser(userId: number, pagination: PaginationQueryParams) {
    let { page } = pagination;
    if (!page) page = 1;

    const where = { Creator: { id: userId } };

    const dataCount = await this.prisma.item.aggregate({
      _count: true,
      where,
    });

    let items = await this.prisma.item.findMany({
      skip: 10 * (page - 1),
      take: 10,
      where,
      orderBy: { id: 'desc' },
      include: {
        ItemLikes: {
          where: { userId },
        },
        LazyMintListing: {
          where: {
            isCancelled: false,
            endTime: { gt: Math.floor(Date.now() / 1000) },
          },
          orderBy: { id: 'desc' },
          take: 1,
        },
      },
    });

    items = items.map((it) => ({
      ...it,
      isLiked: it.ItemLikes.length > 0,
    }));

    const records = await this.getItemsOnChainListing(items);

    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata: {
        page,
        perPage: 10,
        pageCount: Math.ceil(dataCount._count / 10),
        totalCount: dataCount._count,
      },
      records,
    };
  }

  async getOwnedByUser(userId: number, pagination: PaginationQueryParams) {
    let { page } = pagination;
    if (!page) page = 1;

    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const tokenIdValue = await this.indexerService.getOwnedTokensByWallet(
      user.wallet_address,
    );

    const tokenIds = [];
    for (const [tokenId] of Object.entries(tokenIdValue)) {
      tokenIds.push(Number(tokenId));
    }

    const where = {
      OR: [
        {
          AND: [
            {
              tokenId: {
                in: tokenIds,
              },
            },
            {
              quantity_minted: { gt: 0 },
            },
          ],
        },
        {
          // Lazy minted items
          AND: [{ Creator: { id: user.id } }, { quantity_minted: 0 }],
        },
      ],
    };

    const dataCount = await this.prisma.item.aggregate({
      _count: true,
      where,
    });

    let items = await this.prisma.item.findMany({
      skip: 10 * (page - 1),
      take: 10,
      where,
      orderBy: { id: 'desc' },
      include: {
        ItemLikes: {
          where: { userId },
        },
        LazyMintListing: {
          where: {
            isCancelled: false,
            endTime: { gt: Math.floor(Date.now() / 1000) },
          },
          orderBy: { id: 'desc' },
          take: 1,
        },
      },
    });

    items = items.map((it) => ({
      ...it,
      isLiked: it.ItemLikes.length > 0,
    }));

    const records = await this.getItemsOnChainListing(items);

    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata: {
        page,
        perPage: 10,
        pageCount: Math.ceil(dataCount._count / 10),
        totalCount: dataCount._count,
      },
      records,
    };
  }

  async getItemOfferHistory(itemId: number, pagination: PaginationQueryParams) {
    let { page } = pagination;
    if (!page) page = 1;
    const itemData = await this.prisma.item.findFirst({
      where: {
        id: itemId,
      },
      include: {
        Collection: true,
      },
    });

    const collectionStatus = await this.collectionService.getCollectionStatus(
      +itemData.Collection.id,
    );

    const floorPrice = collectionStatus.floorPrice;
    const tokenId = itemData.tokenId;

    const offerHistory = await this.indexerService.getItemOfferHistory(
      +tokenId,
      +page,
      +floorPrice,
    );
    const metadata = offerHistory.metadata;

    let records;
    let pageCount;
    let totalCount;
    if (!offerHistory || !offerHistory.records) {
      records = 0;
    } else {
      for (const offer of offerHistory.records) {
        const user = await this.prisma.user.findFirst({
          where: {
            wallet_address: offer.fromAddress,
          },
        });

        let from;
        if (!user || !user.username) {
          from = null;
          Object.assign(offer, { from });
        } else {
          from = user.username;
          Object.assign(offer, { from });
        }
      }
      records = offerHistory.records;

      pageCount = Math.ceil(offerHistory.records.length / 10);
      totalCount = offerHistory.records.length;
      Object.assign(metadata, { pageCount, totalCount });
    }
    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata,
      records,
    };
  }

  async getItemsOnChainListing(items: Item[]) {
    const records = [];
    for (const [, it] of items.entries()) {
      // Lazy mint item
      if (it.quantity_minted > 0) {
        records.push(it);
        continue;
      }
      // Minted On Chain Item
      // TODO: This should be optimized.
      // indexerService should have itemlisting by tokenId[]
      const listings = await this.indexerService.getItemActiveListing(
        this.configService.get<string>('NFT_CONTRACT_ADDRESS'),
        it.tokenId,
      );
      if (listings.length > 0) {
        const listingsWithOffers = [];
        for (const [i, l] of listings.entries()) {
          const listing = await this.retrieveListingOffers(l);
          listingsWithOffers[i] = listing;
        }
        records.push({
          ...it,
          ItemActiveListings: listingsWithOffers,
        });
      } else {
        records.push({
          ...it,
          ItemActiveListings: [],
        });
      }
    }
    return records;
  }

  async getItemActivities(itemId: number, params: ActivitiesParams) {
    const { page, event } = params;

    const item = await this.prisma.item.findFirstOrThrow({
      where: { id: itemId },
    });
    const result = await this.indexerService.getItemActivities(
      item.tokenId,
      page,
      event,
    );

    const records = [];
    for (const r of result.records) {
      let from = { wallet_address: r.from };
      let to = { wallet_address: r.to };

      if (ethers.utils.isAddress(r.from)) {
        const _from = await this.prisma.user.findFirst({
          where: { wallet_address: r.from },
        });
        if (_from) {
          from = _from;
        }
      }
      if (ethers.utils.isAddress(r.to)) {
        const _to = await this.prisma.user.findFirst({
          where: { wallet_address: r.to },
        });
        if (_to) {
          to = _to;
        }
      }

      const date = formatDistance(new Date(r.createdAt * 1000), new Date(), {
        addSuffix: true,
      });
      records.push({
        ...r,
        from,
        to,
        date,
      });
    }

    return {
      ...result,
      records,
    };
  }

  async getItemSaleHistory(itemId: number, sortBy: SaleHistoryQueryParams) {
    const item = await this.prisma.item.findFirst({
      where: {
        id: itemId,
      },
    });

    if (item == null) {
      throw new HttpException('item is not found', HttpStatus.BAD_REQUEST);
    }

    if (item.tokenId == null) {
      throw new HttpException('item is not listed', HttpStatus.BAD_REQUEST);
    }

    const tokenId = item.tokenId;
    const data = await this.indexerService.getItemSaleHistory(tokenId, sortBy);

    return data;
  }

  async getRecentlySold() {
    const recentSales = await this.prisma.marketplaceSale.findMany({
      take: 10,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const recentlySoldListings = [];

    for (const sales of recentSales) {
      recentlySoldListings.push(sales.listingId);
    }

    return await this.prisma.item.findMany({
      where: {
        MarketplaceListing: {
          some: {
            listingId: {
              in: recentlySoldListings,
            },
          },
        },
      },
    });
  }
}
