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
  LazyMintListingDto,
  PaginationQueryParams,
  SaleHistoryQueryParams,
} from './dto/item.dto';
import { IpfsService } from '../ipfs/ipfs.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttributeType,
  Collection,
  Item,
  ItemViews,
  OfferStatus,
  Prisma,
  TokenType,
} from '@prisma/client';
import standardizeMetadataAttribute from '../lib/standardizeMetadataAttributes';
import { JwtService } from '@nestjs/jwt';
import { ethers } from 'ethers';
import { ConfigService } from '@nestjs/config';
import { IndexerService } from '../indexer/indexer.service';
import { UsersService } from '../users/users.service';
import { MintRequestStruct, signMintRequest } from './web3/erc1155-lazy-mint';
import { NATIVE_CURRENCY } from './web3/constants';
import { CollectionService } from '../collection/collection.service';
import { formatDistance } from 'date-fns';
import { v4 as uuidV4 } from 'uuid';
import retry from 'async-retry';

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
    const contract_address = (
      process.env.NFT_CONTRACT_ADDRESS as string
    ).toLowerCase();
    let image = '';
    let metadata = '';
    let attributeData = [];
    let collection_id = createItemDto.collection_id;
    let collection: Collection;
    const nusa_item_id: string = uuidV4();

    // If no collection, create collection automatically
    if (!collection_id) {
      const fallbackCollection = await this.createFallbackCollection(
        userId,
        userWalletAddress,
        createItemDto.chainId,
      );
      collection = fallbackCollection.data;
      collection_id = fallbackCollection.data.id;
    } else {
      collection = await this.prisma.collection.findFirst({
        where: {
          id: +collection_id,
        },
      });
    }
    // Clean attributes
    if (createItemDto.attributes) {
      attributeData = JSON.parse(createItemDto.attributes);
      attributeData = this.nusaTypeValidator(attributeData);
    }
    // If freeze metadata, upload to IPFS
    if (createItemDto.is_metadata_freeze) {
      const ipfsImageData = await this.ipfsService.uploadImage(file.path);
      const standardizeMetadata = standardizeMetadataAttribute(attributeData);

      const ipfsMetadata = await this.ipfsService.uploadMetadata({
        name: createItemDto.name,
        description: createItemDto.description,
        image,
        attributes: standardizeMetadata,
        nusa_collection: {
          name: collection.name,
          slug: collection.slug,
        },
        external_link: createItemDto.external_link,
        explicit_sensitive: createItemDto.explicit_sensitive,
        nusa_item_id,
      });
      image = `ipfs://${ipfsImageData.Hash}`;
      metadata = `ipfs://${ipfsMetadata.Hash}`;
    } else {
      // Save image and metadata as API URL to nusa server
      image = process.env.API_IMAGE_SERVE_URL
        ? process.env.API_IMAGE_SERVE_URL + '/' + file.filename
        : 'https://nft.nusa.finance/uploads/' + file.filename;
    }

    let lastInsertUnmintedItem = await this.prisma.item.findFirst({
      where: { tokenId: { lt: 0 } },
      orderBy: { id: 'asc' },
    });

    let createItemData: Prisma.ItemCreateInput = {
      uuid: nusa_item_id,
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
      tokenId: lastInsertUnmintedItem
        ? lastInsertUnmintedItem.tokenId.sub(1)
        : -1,
      explicit_sensitive: createItemDto.explicit_sensitive,
      is_metadata_freeze: createItemDto.is_metadata_freeze,
      attributes: {
        createMany: {
          data: attributeData,
        },
      },
      token_standard: TokenType.ERC1155,
    };

    let item: Item;

    await retry(
      async () => {
        try {
          item = await this.prisma.item.create({
            data: createItemData,
            include: {
              Collection: true,
            },
          });
        } catch (err) {
          console.log({ err });
          lastInsertUnmintedItem = await this.prisma.item.findFirst({
            where: { tokenId: { lt: 0 } },
            orderBy: { id: 'desc' },
          });
          createItemData = {
            ...createItemData,
            tokenId: lastInsertUnmintedItem.tokenId.sub(1),
          };
          throw new Error();
        }
      },
      {
        forever: true,
        minTimeout: 500,
      },
    );

    if (createItemDto.is_metadata_freeze == false) {
      item = await this.prisma.item.update({
        where: { id: item.id },
        data: {
          metadata: `${process.env.API_BASE_URL}/item/metadata/${item.id}`,
        },
        include: {
          Collection: true,
        },
      });
    }

    return {
      status: HttpStatus.CREATED,
      message: 'Item created',
      data: item,
    };
  }

  async createFallbackCollection(
    userId: number,
    userWalletAddress: string,
    chainId,
  ) {
    const myCollection = await this.collectionService.findMyCollection(userId, {
      page: 1,
    });

    let collectionName = `Untitled Collection ${userWalletAddress}`;
    if (myCollection.records.length > 0) {
      collectionName += ` ${myCollection.records[0].id + 1}`;
    }

    const { slug } = await this.collectionService.getSlug(collectionName);

    const collectionData = await this.collectionService.createCollection(
      userWalletAddress,
      {
        category_id: 1,
        name: collectionName,
        chainId: chainId,
        creator_address: userWalletAddress,
        slug,
        explicit_sensitive: false,
        // TODO: Set default logo image to a variable
        logo_image: 'ipfs://QmaTCGzpQBRy1rmCcwqtY1t8MPj4NkfhjdqLRStoPPbpPC', // default logo image
      },
    );

    return collectionData;
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

  async getTokenOwners(tokenId: number | Prisma.Decimal) {
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
          userId,
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
      });
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
      where: { id: +listingId },
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
    console.log({ nftContractOwnerAddress: nftContractOwner.address });

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
    const floorPrice = collectionStatus.floorPrice || 0;

    const offers = await this.prisma.marketplaceOffer.findMany({
      skip: 10 * (+page - 1),
      take: 10,
      where: {
        assetContract: itemData.contract_address,
        tokenId: itemData.tokenId,
        status: { notIn: [OfferStatus.COMPLETED, OfferStatus.CANCELLED] },
      },
      orderBy: {
        totalPrice: 'desc',
      },
    });
    const records = offers.map((o) => {
      const pricePerTokenWei = o.totalPrice.div(o.quantity);
      const pricePerTokenEth = Number(
        ethers.utils.formatEther(pricePerTokenWei.toString()),
      );
      const totalPriceEth = Number(
        ethers.utils.formatEther(o.totalPrice.toString()),
      );

      let _floorPrice;
      if (floorPrice == 0) {
        _floorPrice = pricePerTokenEth;
      } else {
        _floorPrice = +floorPrice;
      }

      const floorDifferenceValue =
        ((pricePerTokenEth - _floorPrice) / _floorPrice) * 100;
      let floorDifference = '';
      if (Math.sign(floorDifferenceValue) == -1) {
        floorDifference = `${Math.abs(
          Math.floor(floorDifferenceValue),
        )}% below`;
      }
      if (floorDifferenceValue == 0) {
        floorDifference = `equal`;
      }
      if (Math.sign(floorDifferenceValue) == 1) {
        floorDifference = `${Math.round(floorDifferenceValue)}% above`;
      }

      const expirationTimestamp = o.expirationTimestamp.toNumber() * 1000;
      let expiration;
      if (expirationTimestamp - Date.now() <= 0) {
        expiration = `${formatDistance(Date.now(), expirationTimestamp)} ago`;
      } else {
        expiration = formatDistance(Date.now(), expirationTimestamp);
      }

      return {
        ...o,
        floorDifference,
        expiration,
        fromAddress: o.offeror,
        pricePerToken: `${pricePerTokenEth} MATIC`,
        price: `${totalPriceEth} MATIC`,
      };
    });

    const metadata = {
      page,
      perPage: 10,
    };

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
    const result = await this.getActivities(item.tokenId, page, event);
    console.log('result get item activity', result);

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

  async getActivities(tokenId, page, event) {
    const limit = 10;
    const offset = limit * (page - 1);

    const query = Prisma.sql`
      SELECT X.* FROM (
          SELECT 
            CASE WHEN "from" = '0x0000000000000000000000000000000000000000'
              THEN 'mint'
              ELSE 'transfer'
            END AS event,
            "createdAt",
            0 AS price,
            "from",
            "to",
            "tokenId"
          FROM
            public."TokenTransferHistory"
        UNION
          SELECT
            'listing' AS event,
            "createdAt",
            CASE WHEN "listingType" = 'Direct'
              THEN "buyoutPricePerToken"
              ELSE "reservePricePerToken"
            END AS price,
            "lister" as from,
            '-' as to,
            "tokenId"
          FROM
            public."MarketplaceListing"
        UNION
          SELECT
            'bid' AS event,
            offer."createdAt",
            "totalOfferAmount" as price,
            "offeror" as from,
            accepted."seller" as to,
            "tokenId"
          FROM
            public."MarketplaceOffer" offer
            JOIN public."AcceptedOffer" accepted
            ON offer."id" = accepted."offerId"
        UNION
          SELECT
            'sale' AS event,
            sale."createdAt",
            "totalPricePaid" as price,
            "buyer" as from,
            listing."lister" as to,
            listing."tokenId"
          FROM
            public."MarketplaceSale" sale
            JOIN public."MarketplaceListing" listing
            ON sale."listingId" = listing."listingId"
        ) X
      WHERE X."tokenId" = CAST(${tokenId} AS int)
      ${event ? Prisma.sql`AND X."event" = ${event}` : Prisma.empty}
      ORDER BY X."createdAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const countQuery = Prisma.sql`
      SELECT COUNT(X.*) FROM (
        SELECT 
          CASE WHEN "from" = '0x0000000000000000000000000000000000000000'
            THEN 'mint'
            ELSE 'transfer'
          END AS event,
          "createdAt",
          0 AS price,
          "from",
          "to",
          "tokenId"
        FROM
          public."TokenTransferHistory"
      UNION
        SELECT
          'listing' AS event,
          "createdAt",
          CASE WHEN "listingType" = 'Direct'
            THEN "buyoutPricePerToken"
            ELSE "reservePricePerToken"
          END AS price,
          "lister" as from,
          '-' as to,
          "tokenId"
        FROM
          public."MarketplaceListing"
      UNION
        SELECT
          'bid' AS event,
          offer."createdAt",
          "totalOfferAmount" as price,
          "offeror" as from,
          accepted."seller" as to,
          "tokenId"
          FROM
          public."MarketplaceOffer" offer
          JOIN public."AcceptedOffer" accepted
          ON offer."id" = accepted."offerId"
      UNION
        SELECT
          'sale' AS event,
          sale."createdAt",
          "totalPricePaid" as price,
          "buyer" as from,
          listing."lister" as to,
          listing."tokenId"
        FROM
          public."MarketplaceSale" sale
          JOIN public."MarketplaceListing" listing
          ON sale."listingId" = listing."listingId"
      ) X
    WHERE X."tokenId" = CAST(${tokenId} AS int)
    ${event ? Prisma.sql`AND X."event" = ${event}` : Prisma.empty}
    `;

    const records: any[] = await this.prisma.$queryRaw(query);
    const count: [{ count: BigInt }] = await this.prisma.$queryRaw(countQuery);

    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata: {
        page: Number(page),
        perPage: 10,
        pageCount: records.length,
        totalCount: Number(count[0].count),
      },
      records,
    };
  }
}
