import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ethers } from 'ethers';
import {
  CollectionActivitiesParams,
  CollectionDto,
  CollectionSortBy,
  ImportDto,
  SaleHistoryQueryParams,
  SortBy,
  UpdateCollectionDto,
} from './dto/collection.dto';
import { PrismaService } from '../prisma/prisma.service';
import { SearchDtoParam } from './dto/search.dto';
import { slugify } from '../lib/slugify';
import { JwtService } from '@nestjs/jwt';
import { IndexerService } from 'src/indexer/indexer.service';
import { Item, Prisma, TokenType, Collection, User } from '@prisma/client';
import { ItemService } from '../item/item.service';
import { formatDistance } from 'date-fns';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import axios from 'axios';

@Injectable()
@Processor('import-collection')
export class CollectionService {
  private provider: ethers.providers.JsonRpcProvider;
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private indexerService: IndexerService,
    @Inject(forwardRef(() => ItemService))
    private itemService: ItemService,
    @InjectQueue('import-collection') private importCollectionQueue: Queue,
  ) {
    this.provider = new ethers.providers.WebSocketProvider(process.env.RPC_URL_WSS);
  }

  async createCollection(
    creatorAddress: string,
    createCollectionDto: CollectionDto,
  ) {
    const slug = await this.slugValidator(createCollectionDto.slug);
    const contract_address = process.env.NFT_CONTRACT_ADDRESS;
    let royaltyData = [];
    try {
      royaltyData = JSON.parse(createCollectionDto.royalty);
    } catch (err) {
      Logger.warn(err);
    }
    const payment_token = ethers.constants.AddressZero;
    this.validateRoyaltyInput(royaltyData);
    const collection = await this.prisma.collection.create({
      data: {
        contract_address: contract_address,
        Creator: {
          connect: {
            wallet_address: creatorAddress,
          },
        },
        Category: {
          connect: {
            id: Number(createCollectionDto.category_id),
          },
        },
        royalty: {
          createMany: {
            data: royaltyData,
          },
        },
        name: createCollectionDto.name,
        slug: slug,
        description: createCollectionDto.description,
        logo_image: createCollectionDto.logo_image,
        featured_image: createCollectionDto.feature_image,
        telegram_link: createCollectionDto.telegram_link,
        website_link: createCollectionDto.website_link,
        medium_link: createCollectionDto.medium_link,
        discord_link: createCollectionDto.discord_link,
        banner_image: createCollectionDto.banner_image,
        chainId: Number(createCollectionDto.chainId),
        payment_token: payment_token,
      },
    });
    return {
      status: HttpStatus.CREATED,
      message: 'Collection created',
      data: collection,
    };
  }

  validateRoyaltyInput(
    royalty: { wallet_address: string; percentage: number }[],
  ) {
    const total = royalty.reduce((accum, x) => x.percentage + accum, 0);
    if (total > 0.1) {
      throw new HttpException(
        {
          error: 'total royalty cannot be more than 0.1',
          status: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return total;
  }

  async deleteCollection(id: number, user_wallet: string) {
    const collection = await this.findCollectionId(id);
    if (!collection) {
      throw new HttpException(
        {
          error: 'collection not found',
          status: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (collection.creator_address != user_wallet) {
      throw new HttpException(
        {
          error: 'unauthorized',
          status: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.collection.delete({
      where: {
        id: id,
      },
    });
    return {
      status: HttpStatus.OK,
      message: 'Collection deleted',
    };
  }

  async updateCollection(
    id: number,
    user_wallet: string,
    createCollectionDto: UpdateCollectionDto,
  ) {
    const royaltyData = JSON.parse(createCollectionDto.royalty);
    const findCollection = await this.prisma.collection.findFirst({
      where: { id: +id },
      include: { royalty: true },
    });
    this.validateRoyaltyInput(royaltyData || findCollection.royalty);

    if (!findCollection) {
      throw new HttpException(
        {
          error: 'collection not found',
          status: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (findCollection.creator_address != user_wallet) {
      throw new HttpException(
        {
          error: 'unauthorized',
          status: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (createCollectionDto.royalty) {
      await this.prisma.royalty.deleteMany({
        where: { collection_id: +id },
      });
    }
    let uniqueSlug: string;
    if (
      createCollectionDto.name !== findCollection.name &&
      createCollectionDto.name
    ) {
      uniqueSlug = await this.slugValidator(createCollectionDto.slug);
    }

    const collection = await this.prisma.collection.update({
      where: { id: +id },
      data: {
        contract_address:
          createCollectionDto.contract_address ||
          findCollection.contract_address,
        Creator: {
          connect: {
            wallet_address:
              createCollectionDto.Creator || findCollection.creator_address,
          },
        },
        Category: {
          connect: {
            id:
              Number(createCollectionDto.Category) ||
              findCollection.category_id,
          },
        },
        royalty: {
          createMany: {
            data: royaltyData || findCollection.royalty,
          },
        },
        name: createCollectionDto.name,
        slug: uniqueSlug || findCollection.slug,
        description: createCollectionDto.description,
        logo_image: createCollectionDto.logo_image,
        banner_image: createCollectionDto.banner_image,
        chainId: Number(createCollectionDto.chainId),
        telegram_link: createCollectionDto.telegram_link,
        website_link: createCollectionDto.website_link,
        medium_link: createCollectionDto.medium_link,
        discord_link: createCollectionDto.discord_link,
        display_theme: createCollectionDto.display_theme,
        featured_image: createCollectionDto.feature_image,
      },
    });
    return {
      status: HttpStatus.OK,
      message: 'Collection updated',
      data: collection,
    };
  }

  async findCollectionId(id: number) {
    const collectionData = await this.prisma.collection.findFirst({
      where: {
        id: id,
        deleted: false,
      },
      include: {
        Creator: true,
        royalty: {
          where: {
            deleted: false,
          },
        },
        items: true,
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    this.collectionIdOrSlugItemCount(collectionData);

    return collectionData;
  }

  async findCollectionSlug(slug: string, token: string | null) {
    let userId = null;
    if (token) {
      const user = this.jwtService.decode(token);
      userId = user.sub;
    }
    const collectionData = await this.prisma.collection.findFirst({
      where: {
        slug: slug,
        deleted: false,
      },
      include: {
        Creator: true,
        royalty: {
          where: {
            deleted: false,
          },
        },
        items: {
          include: {
            LazyMintListing: true,
            Creator: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    if (collectionData) {
      this.collectionIdOrSlugItemCount(collectionData);
      await this.isWatchedValidator(collectionData, userId);

      const items: (Item & any)[] = [];
      for (const item of collectionData.items) {
        // If item already minted on Blockchain
        // - get token owners from indexer
        // - should not have lazy mint listing
        // - get active listing from indexer
        if (item.quantity_minted > 0) {
          const owners = await this.itemService.getTokenOwners(item.tokenId);
          Object.assign(item, { owners });

          item.LazyMintListing = [];
          const listings = await this.itemService.getItemActiveListing(item);
          if (listings.length > 0) {
            for (let i = 0; i < listings.length; i++) {
              const listing = await this.itemService.retrieveListingOffers(
                listings[i],
              );
              listings[i] = listing;
            }
          }
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
            Object.assign(item, {
              ActiveLazyMintListing: item.LazyMintListing[0],
            });
          }
        }
        items.push(item);
      }

      collectionData.items = items;
    }

    return collectionData;
  }

  async findByCollection(searchParam: SearchDtoParam) {
    if (!searchParam.page) {
      throw new HttpException(
        {
          error: 'page number required',
          status: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    let where: Prisma.CollectionWhereInput = {
      deleted: false,
      name: {
        contains: searchParam.collection_name,
        mode: 'insensitive',
      },
      Category: {
        name: {
          contains: searchParam.category,
          mode: 'insensitive',
        },
      },
      Creator: {
        username: {
          contains: searchParam.username,
          mode: 'insensitive',
        },
      },
    };

    if (searchParam.isCurated) {
      where = {
        ...where,
        CuratedCollection: {
          id: { gt: 0 },
        },
      };
    }

    const dataCount = await this.prisma.collection.aggregate({
      _count: true,
      where,
      orderBy: { id: 'desc' },
    });

    const collectionData = await this.prisma.collection.findMany({
      skip: 10 * (searchParam.page - 1),
      take: 10,
      where,
      include: {
        _count: {
          select: {
            items: true,
          },
        },
        Creator: true,
        royalty: {
          where: {
            deleted: false,
          },
        },
        items: true,
      },
      orderBy: { id: 'desc' },
    });

    this.collectionItemCount(collectionData);

    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata: {
        page: searchParam.page,
        perPage: 10,
        pageCount: Math.ceil(dataCount._count / 10),
        totalCount: dataCount._count,
      },
      records: collectionData,
    };
  }

  async findMyCollection(userId: number, searchParam: SearchDtoParam) {
    if (!searchParam.page) {
      throw new HttpException(
        {
          error: 'page number required',
          status: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const where: Record<string, any> = {
      deleted: false,
      name: {
        contains: searchParam.collection_name,
        mode: 'insensitive',
      },
      Category: {
        name: {
          contains: searchParam.category,
          mode: 'insensitive',
        },
      },
      Creator: {
        id: {
          equals: userId,
        },
      },
    };

    const dataCount = await this.prisma.collection.aggregate({
      _count: true,
      where,
      orderBy: { id: 'desc' },
    });

    const collectionData = await this.prisma.collection.findMany({
      skip: 10 * (searchParam.page - 1),
      take: 10,
      where,
      include: {
        _count: {
          select: {
            items: true,
          },
        },
        items: true,
        Creator: true,
        royalty: {
          where: {
            deleted: false,
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    this.collectionItemCount(collectionData);

    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata: {
        page: searchParam.page,
        perPage: 10,
        pageCount: Math.ceil(dataCount._count / 10),
        totalCount: dataCount._count,
      },
      records: collectionData,
    };
  }

  async getSlug(name: string) {
    let slug = slugify(name);

    const lastInserts = await this.prisma.collection.findMany({
      take: 2,
      where: {
        slug: { startsWith: slug },
        deleted: false,
      },
      orderBy: { id: 'desc' },
    });

    if (lastInserts.length == 1) {
      slug = `${slug}-${1}`;
    }

    if (lastInserts.length > 1) {
      const split = lastInserts[0].slug.split('-');
      const index = Number(split[split.length - 1]);
      const nextIndex = index + 1;
      slug = `${slug}-${nextIndex}`;
    }

    return {
      status: HttpStatus.OK,
      message: 'success',
      slug,
    };
  }

  async slugValidator(slug: string) {
    const token = null;
    const slugUnAvailable = await this.findCollectionSlug(slug, token);
    if (slugUnAvailable) {
      const uniqueSlug = await this.getSlug(slug);
      return uniqueSlug.slug;
    } else {
      return slug;
    }
  }

  async watch(userId: number, collectionId) {
    const watchData = await this.prisma.watchList.findFirst({
      where: {
        userId,
        collectionId,
      },
    });

    const collection = await this.prisma.collection.findFirst({
      where: {
        id: collectionId,
      },
    });

    if (!collection) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'collection not found',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (watchData) {
      await this.prisma.watchList.delete({
        where: {
          id: watchData.id,
        },
      });
      await this.prisma.collection.update({
        where: {
          id: collectionId,
        },
        data: {
          watchCount: {
            decrement: 1,
          },
        },
      });
      return {
        status: HttpStatus.OK,
        message: 'collection removed from watchlist',
      };
    } else {
      const data = await this.prisma.watchList.create({
        data: {
          User: {
            connect: {
              id: userId,
            },
          },
          Collection: {
            connect: {
              id: collectionId,
            },
          },
        },
      });
      await this.prisma.collection.update({
        where: {
          id: collectionId,
        },
        data: {
          watchCount: {
            increment: 1,
          },
        },
      });
      return data;
    }
  }

  async getWatchlist(userId: number, page: number) {
    const where: Record<string, any> = {
      WatchList: {
        some: {
          User: {
            id: userId,
          },
        },
      },
    };

    const collections = await this.prisma.collection.findMany({
      skip: 10 * (page - 1),
      take: 10,
      where,
      include: {
        _count: {
          select: {
            items: true,
          },
        },
        Creator: true,
        royalty: {
          where: {
            deleted: false,
          },
        },
        items: true,
      },
      orderBy: { id: 'desc' },
    });

    const dataCount = await this.prisma.collection.aggregate({
      _count: true,
      where,
      orderBy: { id: 'desc' },
    });

    this.collectionItemCount(collections);
    await this.collectionWatchlistListingData(collections);

    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata: {
        page: page,
        perPage: 10,
        pageCount: Math.ceil(dataCount._count / 10),
        totalCount: dataCount._count,
      },
      records: collections,
    };
  }

  async getCollectionStatus(collectionId: number) {
    const soldListingPrice = [];
    const items = await this.prisma.item.findMany({
      where: {
        Collection: {
          id: +collectionId,
        },
      },
      select: {
        tokenId: true,
      },
    });

    const getSoldLazyMintedItemPrice =
      await this.prisma.lazyMintListing.findMany({
        where: {
          Item: {
            collection_id: collectionId,
            quantity_minted: { gt: 0 },
          },
        },
        orderBy: {
          Item: {
            updatedAt: 'desc',
          },
        },
        include: {
          Item: true,
        },
      });

    if (!getSoldLazyMintedItemPrice.length) {
      soldListingPrice;
    } else {
      for (const item of getSoldLazyMintedItemPrice) {
        const maticPrice = ethers.utils.formatEther(
          item.buyoutPricePerToken.toString(),
        );
        soldListingPrice.push(maticPrice);
      }
    }

    const getLazyMintedItems = await this.prisma.lazyMintListing.findMany({
      where: {
        Item: {
          collection_id: collectionId,
          quantity_minted: { gt: 0 },
        },
        isCancelled: false,
        quantity: {
          gt: 0,
        },
      },
      include: {
        Item: {
          select: {
            creator_address: true,
          },
        },
      },
    });

    let uniqueLazyMintedOwnerAddress;
    const lazyMintedItemPrices = [];
    if (getLazyMintedItems) {
      const items = getLazyMintedItems.map(({ Item }) => Item);
      uniqueLazyMintedOwnerAddress = [
        ...new Set(items.map((item) => item.creator_address)),
      ];
      for (const listing of getLazyMintedItems) {
        if (listing.listingType == 'Direct') {
          const maticPrice = ethers.utils.formatEther(
            listing.buyoutPricePerToken.toString(),
          );
          lazyMintedItemPrices.push(maticPrice);
        }
        if (listing.listingType == 'Auction') {
          lazyMintedItemPrices.push(listing.reservePricePerToken);
        }
      }
    }

    const uniqueLazyMintedOwnerAddresses = uniqueLazyMintedOwnerAddress
      .toString()
      .trim();
    const lazyMintedItemPricesString = lazyMintedItemPrices.toString();

    const collectionItems = await this.prisma.collection.findFirst({
      where: {
        id: collectionId,
      },
      include: {
        _count: {
          select: {
            items: true,
          },
        },
        items: true,
      },
    });

    if (!collectionItems) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'collection not found',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    //count total items with respective quantity
    let totalItems = 0;
    for (const item of collectionItems.items) {
      const itemQuantity = item.supply;
      totalItems = totalItems + +itemQuantity;
    }

    // get array of token id
    const tokenIds = items.map(({ tokenId }) => tokenId);

    const tokenIdsString = tokenIds.toString();

    const volumeData = await this.indexerService.getStatusData(
      tokenIdsString,
      totalItems,
      uniqueLazyMintedOwnerAddresses,
      lazyMintedItemPricesString,
      soldListingPrice.toString(),
    );
    return volumeData;
  }

  collectionItemCount(collectionData: any) {
    collectionData.map((data) => {
      const itemCount = data._count.items;
      Object.assign(data, { itemCount: itemCount });
      delete data._count;
      return data;
    });
  }

  async collectionWatchlistListingData(collectionData: any) {
    let lastSale;
    let date;
    let timeStamp;
    for (const data of collectionData) {
      const getLazyMintedItems = await this.prisma.lazyMintListing.findMany({
        where: {
          Item: {
            collection_id: data.id,
            quantity_minted: { gt: 0 },
          },
          isCancelled: false,
        },
        include: {
          Item: true,
        },
        orderBy: {
          Item: {
            updatedAt: 'desc',
          },
        },
      });

      const status = await this.getCollectionStatus(+data.id);
      if (!getLazyMintedItems.length) {
        lastSale = `${status.lastSale} MATIC`;
      } else {
        date = new Date(getLazyMintedItems[0].Item.updatedAt);
        timeStamp = date.getTime() / 1000;
        if (timeStamp >= status.lastSaleTimestamp) {
          const maticPrice = ethers.utils.formatEther(
            getLazyMintedItems[0].buyoutPricePerToken.toString(),
          );
          lastSale = `${maticPrice} MATIC`;
        }
        if (timeStamp <= status.lastSaleTimestamp) {
          lastSale = `${status.lastSale} MATIC`;
        }
      }
      const volume = `${status.volume} MATIC`;
      const floorPrice = `${status.floorPrice} MATIC`;
      Object.assign(data, { volume, floorPrice, lastSale });
    }
  }

  collectionIdOrSlugItemCount(collectionData: any) {
    const itemCount = collectionData._count.items;
    Object.assign(collectionData, { itemCount: itemCount });
    delete collectionData._count;
    return collectionData;
  }

  async isWatchedValidator(collection: any, userId: number) {
    if (!collection) return;
    else {
      const watched = await this.prisma.watchList.findFirst({
        where: {
          collectionId: collection.id,
          userId: userId,
        },
      });
      if (watched) {
        const likedObj = { isWatched: true };
        Object.assign(collection, likedObj);
        return collection;
      } else {
        const likedObj = { isWatched: false };
        Object.assign(collection, likedObj);
        return collection;
      }
    }
  }

  async getCollectionSaleHistory(
    collectionId: number,
    sortBy: SaleHistoryQueryParams,
  ) {
    let totalVolumeNow = 0;
    let totalVolumePrevious = 0;

    const collection = await this.prisma.collection.findFirst({
      where: {
        id: +collectionId,
      },
      include: {
        items: true,
      },
    });
    const priceHistoryData = [];
    for (const data of collection.items) {
      const token = data.tokenId;
      const itemPrices = await this.indexerService.getItemSaleHistory(
        token,
        sortBy,
      );
      if (itemPrices) {
        totalVolumeNow =
          totalVolumeNow + itemPrices[itemPrices.length - 1].totalVolumeNow;
        totalVolumePrevious =
          totalVolumePrevious +
          itemPrices[itemPrices.length - 1].totalVolumePrevious;
        priceHistoryData.push(itemPrices);
      }
    }
    const arr = priceHistoryData.flat(1);

    const aggregate = (arr, date, price) => {
      // using reduce() method to aggregate
      const agg = arr.reduce((a, b) => {
        // get the value of both the keys
        const dateValue = b[date];
        const priceValue = b[price];

        // if there is already a key present
        // merge its value
        if (a[dateValue]) {
          a[dateValue] = {
            [date]: dateValue,
            [price]: [...a[dateValue][price], priceValue],
          };
        }
        // create a new entry on the key
        else {
          a[dateValue] = {
            [date]: dateValue,
            [price]: [priceValue],
          };
        }

        // return the aggregation
        return a;
      }, {});

      // return only values after aggregation
      return Object.values(agg);
    };
    //create new array after aggregate data
    const aggregatedArray = aggregate(arr, 'date', 'prices');
    //because of first array always return null
    aggregatedArray.pop();

    for (const i of aggregatedArray) {
      const price = i['prices'];
      //remove nested array
      const arrOfPrices = price.flat(2);
      //delete existing key(prices)
      delete i['prices'];
      //then assign newly created key to aggregatedArray
      Object.assign(i, { prices: arrOfPrices });
    }

    let percentChanges;
    if (totalVolumeNow == 0 || totalVolumePrevious == 0) {
      percentChanges = 0;
    } else {
      percentChanges =
        ((+totalVolumeNow - +totalVolumePrevious) / +totalVolumePrevious) * 100;
    }

    aggregatedArray.push({
      percentChanges,
      totalVolumeNow,
    });

    return aggregatedArray;
  }

  async getTopCollection(
    sortRange: SaleHistoryQueryParams,
    sortBy: CollectionSortBy,
  ) {
    const collectionData = await this.prisma.collection.findMany({
      where: {
        deleted: false,
      },
    });

    if (!collectionData) {
      return [];
    }

    for (const collection of collectionData) {
      const { id } = collection;
      const data = await this.getCollectionSaleHistory(id, sortRange);
      const dataForFilter = data[data.length - 1];
      const percentChanges = dataForFilter['percentChanges'];
      const totalVolumeNow = dataForFilter['totalVolumeNow'];

      const collectionStatus = await this.getCollectionStatus(id);
      const floorPrice = +collectionStatus.floorPrice;
      Object.assign(collection, { percentChanges, totalVolumeNow, floorPrice });
    }

    let sortByData: string;
    const sortData = sortBy.sortBy.toString();
    if (sortData == SortBy[0]) {
      sortByData = 'totalVolumeNow';
    }
    if (sortData == SortBy[1]) {
      sortByData = 'percentChanges';
    }
    if (sortData == SortBy[2]) {
      sortByData = 'floorPrice';
    }
    collectionData.sort((a, b) => b[sortByData] - a[sortByData]);

    const take10CollectionData = collectionData.slice(0, 10);
    return take10CollectionData;
  }

  async getCollectionActivities(
    collectionId: number,
    params: CollectionActivitiesParams,
  ) {
    const { page, event } = params;

    const collection = await this.prisma.collection.findFirstOrThrow({
      where: { id: collectionId },
      select: {
        items: {
          select: {
            tokenId: true,
          },
        },
      },
    });

    const tokenIdsArray = [];
    for (const item of collection.items) {
      tokenIdsArray.push(item.tokenId);
    }

    const tokenIds = JSON.stringify(tokenIdsArray);

    const result = await this.indexerService.getCollectionActivities(
      tokenIds,
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

  async importQueue({ contractAddress }: ImportDto) {
    const job = await this.importCollectionQueue.add('import-collection', { contractAddress });
    return job;
  }

  /**
   * Process import collection:
   * Contract addresses for testing (mumbai network. chain id 80001)
   * - 0xa7e13482f81478846eb6ca479aa8ff2b0d3bb753 // ERC1155 TransferBatch Event
   * - 0x803A7333cf67C626adBb5Bc7f38BCeB818E51054 // ERC721 Transfer Event
   * - 0xa7be5ecc24a2e2d3251f3c6c81078514b533a28b // ERC721 Transfer Event item with attributes
   * @param job 
   */
  @Process('import-collection')
  async processImportCollection(job: Job<{ contractAddress: string }>) {
    const { contractAddress } = job.data;
    const chainId = Number(process.env.CHAIN_ID);
    
    const ERC721_INTERFACE_ID = '0x80ac58cd';
    const ERC1155_INTERFACE_ID = '0xd9b67a26';

    const abi = [
      'function supportsInterface(bytes4 interfaceID) external view returns (bool)',
      'function name() public view returns (string memory)',
      // ERC721
      'function tokenURI(uint256 tokenId) public view returns (string memory)',
      'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
      // ERC1155
      'function uri(uint256 _id) external view returns (string memory)',
      'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
      'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
    ]
    const iface = new ethers.utils.Interface(abi);

    const contract = new ethers.Contract(contractAddress, abi, this.provider);
    const isErc721 = await contract.supportsInterface(ERC721_INTERFACE_ID);
    const isErc1155 = await contract.supportsInterface(ERC1155_INTERFACE_ID);
    const startBlock = 10000000;
    const latestBlock = await this.provider.getBlockNumber();

    let creationBlock;
    let tokenType;
    let collection: Collection;
    let user: User;
    let contractCreator = ''

    const imported = await this.prisma.importedContracts.findFirst({ where: { contractAddress, chainId }});

    if (!isErc721 && !isErc1155) {
      throw new HttpException('Contract is neither ERC721 or ERC1155', HttpStatus.BAD_REQUEST);
    }
    if (isErc721) tokenType = TokenType.ERC721;
    if (isErc1155) tokenType = TokenType.ERC1155;

    if (!imported) {
      creationBlock = await this.getContractCreationBlock(contractAddress, startBlock, latestBlock);
      await this.prisma.importedContracts.create({
        data: {
          contractAddress,
          chainId,
          tokenType,
          createdAt: new Date(),
          deployedAtBlock: creationBlock
        }
      });
    } else {
      creationBlock = imported.deployedAtBlock;
    }
    // Get contract owner
    // If not, get the deployer
    try {
      contractCreator = await contract.owner();
    } catch (err) {
      const block = await this.provider.getBlockWithTransactions(creationBlock);
      const tx = block.transactions.filter((x: any) => !!x.creates && x.creates.toLowerCase() == contractAddress.toLowerCase())
      if (tx.length > 0) {
        contractCreator = tx[0].from;
      }
    }
    
    if (!contractCreator) {
      contractCreator = ethers.constants.AddressZero;
    }

    // Check if user exists, if not create
    user = await this.prisma.user.findFirst({ where: { wallet_address: contractCreator }});
    if (!user) {
      user = await this.prisma.user.create({ data: { wallet_address: contractCreator }});
    } 

    let name = ''
    let slug = ''
    // Get Contract name from on chain
    // Or create if it does not exist on chain
    try {
      name = await contract.name();
      const res = await this.getSlug(name);
      slug = res.slug;
    } catch (err) {
      name = `${contractAddress}-${chainId}`;
      slug = name;
    }

    collection = await this.prisma.collection.findFirst({ where: {
      contract_address: contractAddress,
      chainId,
    }})
    if (!collection) {
      collection = await this.prisma.collection.create({ 
        data: {
          name,
          slug,
          logo_image: '',
          chainId,
          isImported: true,
          payment_token: ethers.constants.AddressZero,
          contract_address: contractAddress,
          Creator: {
            connect: {
              id_wallet_address: {
                id: user.id,
                wallet_address: user.wallet_address,
              },
            },
          },
          Category: {
            connect: {
              id: Number(4),
            },
          },
          royalty: {
            createMany: {
              data: [],
            },
          },
        }
      })
    }

    let topics = [];
    if (isErc721) {
      topics = [[contract.filters.Transfer().topics[0]]];
    }
    if (isErc1155) {
      topics = [[
        contract.filters.TransferSingle().topics[0],
        contract.filters.TransferBatch().topics[0]
      ]];
    }
    const logs = await contract.queryFilter(
      { topics },
      creationBlock,
      latestBlock,
    );
    console.log({ isErc1155, isErc721 });

    for (const log of logs) {
      const event = iface.parseLog(log);
      if (event.name == 'Transfer') {
        await this.handleERC721Transfer({
          event,
          contractAddress,
          log,
          contract,
          collection,
          user,
          tokenType,
          chainId,
        });
      }
      if (event.name == 'TransferSingle') {
        await this.handleERC1155TransferSingle({
          event,
          contractAddress,
          log,
          contract,
          collection,
          user,
          tokenType,
          chainId,
        });
      }
      if (event.name == 'TransferBatch') {
        await this.handleERC1155TransferBatch({
          event,
          contractAddress,
          log,
          contract,
          collection,
          user,
          tokenType,
          chainId,
        })
      }
    }
  }

  async getContractCreationBlock(contractAddress: string, startBlock: number, endBlock: number) {
    Logger.log('Getting contract creation block');
    if (startBlock == endBlock) {
      return startBlock;
    }
    const midBlock = Math.floor((startBlock + endBlock) / 2)
    const code = await this.provider.getCode(contractAddress, midBlock)
    if (code.length > 2) {
       return await this.getContractCreationBlock(contractAddress, startBlock, midBlock)
    } else {
       return await this.getContractCreationBlock(contractAddress, midBlock+1, endBlock)
    }
  }

  async getMetadata(uri: string) {
    if (uri.startsWith('ipfs://')) {
      const res = await axios.get(
        `${process.env.IPFS_GATEWAY}/${uri.replace('ipfs://', '')}`,
        { headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' } }
      );
      return res.data;
    }
    const res = await axios.get(
      uri,
      { headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' } }
    );
    return res.data;
  }

  async handleERC721Transfer({
    event,
    contractAddress,
    log,
    contract,
    collection,
    user,
    tokenType,
    chainId,
  }: {
    contractAddress: string,
    event: ethers.utils.LogDescription,
    log: ethers.Event,
    contract: ethers.Contract,
    collection: Collection,
    tokenType: TokenType
    chainId: number,
    user: User
  }) {
    const from = event.args[0];
    const to = event.args[1];
    const tokenId = event.args[2].toNumber();
    const { blockNumber, transactionHash } = log;
    const timestamp = (await this.provider.getBlock(blockNumber))
      .timestamp;
    await this.createUpdateTokenOwnership({
      contractAddress,
      from,
      to,
      tokenId,
      quantity: 1,
      timestamp,
      chainId,
      transactionHash,
      blockNumber,
      txIndex: 0,
    });
    if (from == ethers.constants.AddressZero) {
      await this.createItemIfNotExists({
        contract,
        collection,
        tokenId,
        chainId,
        tokenType,
        contractAddress,
        user,
      });
    }
  }

  async handleERC1155TransferSingle({
    event,
    contractAddress,
    log,
    contract,
    collection,
    user,
    tokenType,
    chainId,
  }: {
    contractAddress: string,
    event: ethers.utils.LogDescription,
    log: ethers.Event,
    contract: ethers.Contract,
    collection: Collection,
    tokenType: TokenType
    chainId: number,
    user: User
  }) {
    const operator = event.args[0];
    const from = event.args[1];
    const to = event.args[2];
    const id = event.args[3].toNumber();
    const value = event.args[4].toNumber();
    const { blockNumber, transactionHash } = log;
    const timestamp = (await this.provider.getBlock(blockNumber))
      .timestamp;
    const tokenOwnershipWrite = await this.createUpdateTokenOwnership({
      contractAddress,
      from,
      to,
      tokenId: id,
      quantity: value,
      timestamp: timestamp,
      chainId,
      transactionHash,
      blockNumber,
      txIndex: 0
    });
    // If tokenOwnerships has not changed && transfer is not mint return
    if (tokenOwnershipWrite.length == 0 && from != ethers.constants.AddressZero) return;
    await this.createItemIfNotExists({
      contract,
      collection,
      tokenId: id,
      chainId,
      tokenType,
      contractAddress,
      user,
      amount: value
    });
  }

  async handleERC1155TransferBatch({
    event,
    contractAddress,
    log,
    contract,
    collection,
    user,
    tokenType,
    chainId,
  }: {
    contractAddress: string,
    event: ethers.utils.LogDescription,
    log: ethers.Event,
    contract: ethers.Contract,
    collection: Collection,
    tokenType: TokenType
    chainId: number,
    user: User
  }) {
    // const { operator, from, to, ids, values } = event.args;
    const operator = event.args[0];
    const from = event.args[1];
    const to = event.args[2];
    const ids = event.args[3];
    const values = event.args[4];
    const { blockNumber, transactionHash } = log;
    const timestamp = (await this.provider.getBlock(blockNumber))
      .timestamp;
    for (let i = 0; i < ids.length; i++) {
      const tokenOwnershipWrite = await this.createUpdateTokenOwnership({
        contractAddress,
        from,
        to,
        tokenId: ids[i].toNumber(),
        quantity: values[i].toNumber(),
        timestamp: timestamp,
        chainId,
        transactionHash,
        blockNumber,
        txIndex: i,
      });
      // If tokenOwnerships has not changed && transfer is not mint return
      if (tokenOwnershipWrite.length == 0 && from != ethers.constants.AddressZero) return;
      await this.createItemIfNotExists({
        contract,
        collection,
        tokenId: ids[i].toNumber(),
        chainId,
        tokenType,
        contractAddress,
        user,
        amount: values[i].toNumber(),
      });
    }
  }

  async createUpdateTokenOwnership({
    contractAddress,
    from,
    to,
    tokenId,
    quantity,
    timestamp,
    chainId,
    transactionHash,
    blockNumber,
    txIndex = 0,
  }: {
    contractAddress: string
    from: string,
    to: string,
    tokenId: number,
    quantity: number,
    timestamp: number,
    chainId: number,
    transactionHash: string
    blockNumber: number,
    txIndex: number,
  }) {
    const tokenTransferHistory = await this.prisma.tokenTransferHistory.findFirst({
      where: {
        transactionHash,
        txIndex,
        chainId 
      }
    })
    if (!!tokenTransferHistory) return [];

    const transactions = [];
    transactions.push(
      this.prisma.tokenTransferHistory.upsert({
        where: {
          transactionHash_chainId_txIndex: {
            transactionHash,
            txIndex,
            chainId
          }
        },
        create: {
          contractAddress,
          from,
          to,
          tokenId,
          transactionHash,
          block: blockNumber,
          createdAt: timestamp,
          value: quantity,
          chainId,
          txIndex
        },
        update: {},
      })
    );

    const _from = await this.prisma.tokenOwnerships.findFirst({
      where: {
        contractAddress,
        tokenId,
        ownerAddress: from,
        chainId,
      }
    })
    const _to = await this.prisma.tokenOwnerships.findFirst({
      where: {
        contractAddress,
        tokenId,
        ownerAddress: to,
        chainId,
      }
    })
    // Upsert From
    if (_from && _from.ownerAddress != ethers.constants.AddressZero) {
      transactions.push(
        this.prisma.tokenOwnerships.upsert({
          where: {
            contractAddress_chainId_tokenId_ownerAddress: {
              contractAddress,
              tokenId,
              ownerAddress: from,
              chainId,
            }
          },
          create: {
            contractAddress,
            tokenId,
            ownerAddress: from,
            quantity: _from ? _from.quantity - quantity : 0,
            timestamp,
            chainId,
            transactionHash
          },
          update: {
            quantity: _from ? _from?.quantity - quantity : 0,
            transactionHash,
          }
        })
      )
    }
    // Upsert To
    transactions.push(
      this.prisma.tokenOwnerships.upsert({
        where: {
          contractAddress_chainId_tokenId_ownerAddress: {
            contractAddress,
            tokenId,
            ownerAddress: to,
            chainId
          }
        },
        create: {
          contractAddress,
          tokenId,
          ownerAddress: to,
          quantity: _to ? _to.quantity + quantity : quantity,
          timestamp,
          chainId,
          transactionHash
        },
        update: {
          quantity: _to ? _to?.quantity + quantity : quantity,
          transactionHash
        }
      })
    );

    const result = await this.prisma.$transaction(
      transactions,
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );
    return result;
  }
  
  async createItemIfNotExists({
    contract,
    collection,
    tokenId,
    chainId,
    tokenType,
    contractAddress,
    user,
    amount = 1
  }: {
    contract: ethers.Contract,
    collection: Collection,
    tokenId: number,
    chainId: number,
    tokenType: TokenType,
    contractAddress: string,
    user: User,
    amount?: number
  }) {
     const {
      name, metadataUri, attributes, description, image
    } = await this.extractMetadata(contract, collection, tokenId);
    let itemData: Prisma.ItemCreateInput = {
      chainId,
      supply: amount,
      quantity_minted: amount,
      token_standard: tokenType,
      metadata: metadataUri,
      tokenId: tokenId,
      contract_address: contractAddress,
      is_metadata_freeze: true,
      name,
      image,
      description,
      Collection: {
        connect: {
          id: collection.id,
        }
      },
      Creator: {
        connect: {
          id_wallet_address: {
            id: user.id,
            wallet_address: user.wallet_address,
          }
        }
      },
    }
    let itemUpdateData: Prisma.ItemUpdateInput = {
      ...itemData
    }
    if (tokenType == TokenType.ERC1155) {
      itemUpdateData = {
        ...itemUpdateData,
        supply: { increment: amount },
        quantity_minted: { increment: amount }
      }
    }
    if (this.validateMetadataAttributes(attributes)) {
      itemData = {
        ...itemData,
        attributes: { createMany: { data: attributes.map(x => ({ ...x, value: String(x.value) })) } }
      }
    }
    await this.prisma.item.upsert({
      where: {
        tokenId_contract_address_chainId: {
          tokenId: tokenId,
          contract_address: contractAddress,
          chainId,
        }
      },
      create: itemData,
      update: itemUpdateData,
    });
  }

  validateMetadataAttributes(attributes: object[]) {
    let isValid = false;
    attributes.forEach((x: object) => {
      if (
        !x.hasOwnProperty('trait_type') &&
        !x.hasOwnProperty('value')
      ) {
        isValid = false;
        return;
      }
      isValid = true;
    })
    return isValid;
  }

  async extractMetadata(contract: ethers.Contract, collection: Collection, tokenId: number) {
    let name = '';
    let description = '';
    let image = '';
    let metadataUri = '';
    let attributes = [];
    try {
      metadataUri = await contract.tokenURI(tokenId);
      const metadata = await this.getMetadata(metadataUri);
      name = metadata.name;
      image = metadata.image;
      if (!name) throw new Error();
      attributes = metadata.attributes;
      description = metadata.description;
    } catch (err) {
      name = `${collection.name}-${tokenId}`;
    }
    return { name, description, image, metadataUri, attributes }
  }
}
