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
  CollectionStatusQueryParams,
  ImportDto,
  RefreshMetadataDto,
  SaleHistoryQueryParams,
  SortBy,
  SyncOwnershipDto,
  UpdateCollectionDto,
} from './dto/collection.dto';
import { PrismaService } from '../prisma/prisma.service';
import { SearchDtoParam } from './dto/search.dto';
import { slugify } from '../lib/slugify';
import { JwtService } from '@nestjs/jwt';
import { IndexerService } from '../indexer/indexer.service';
import { Item, Prisma, TokenType, Collection, User } from '@prisma/client';
// import { ItemService } from '../item/item.service';
import { ItemServiceV2 } from '../item/item.service.v2';
import { formatDistance } from 'date-fns';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import axios from 'axios';
import { toString } from '../lib/toString';

@Injectable()
@Processor('import-collection')
export class CollectionService {
  // private provider: ethers.providers.JsonRpcProvider;
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private indexerService: IndexerService,
    @Inject(forwardRef(() => ItemServiceV2))
    private itemService: ItemServiceV2,
    @InjectQueue('import-collection') private importCollectionQueue: Queue,
  ) {
    // this.provider = new ethers.providers.WebSocketProvider(
    //   process.env.WSS_RPC_URL,
    // );
  }

  async createCollection(
    creatorAddress: string,
    createCollectionDto: CollectionDto,
  ) {
    let slug: string;
    if (!createCollectionDto.slug) {
      slug = (await this.getSlug(createCollectionDto.name)).slug;
    } else {
      slug = createCollectionDto.slug;
    }
    slug = await this.slugValidator(slug);
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
        contract_address: contract_address.toLowerCase(),
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
          createCollectionDto.contract_address.toLowerCase() ||
          findCollection.contract_address.toLowerCase(),
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
    const collectionData = await this.prisma.collection.findFirstOrThrow({
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
        const _item = await this.itemService.getItem(item.id, token);
        Object.assign(item, _item);
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

    const where: Prisma.CollectionWhereInput = {
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
    const collection = await this.prisma.collection.findFirst({
      where: { slug },
    });
    if (collection) {
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

    if (!collectionId) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'collection not found',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
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
        },
        isCancelled: false,
        isFulfilled: false,
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
    const tokenIds = items.map(({ tokenId }) => tokenId.toNumber());

    const volumeData = await this.getStatusData({
      // const volumeData = await this.indexerService.getStatusData(
      tokenIds: tokenIds,
      totalItems,
      lazyMintedOwners: uniqueLazyMintedOwnerAddress,
      lazyMintedItemPrices: lazyMintedItemPricesString,
      soldLazyMintedItemPrices: soldListingPrice.toString(),
    });
    return volumeData;
  }

  async getStatusData(collectionStatus: CollectionStatusQueryParams) {
    const {
      tokenIds,
      totalItems,
      lazyMintedOwners,
      lazyMintedItemPrices,
      soldLazyMintedItemPrices,
    } = collectionStatus;
    const lazyMintedItemPricesArray = lazyMintedItemPrices
      .split(',')
      .map(Number);
    const soldlazyMintedItemPricesArray = soldLazyMintedItemPrices
      .split(',')
      .map(Number);

    let listings;
    let floorPrice;
    let mintedVolume = 0;
    let lastSale;
    let lastSaleTimestamp;
    const currentItemPricesData = [];

    const listingData = await this.prisma.marketplaceListing.findMany({
      where: {
        tokenId: { in: tokenIds },
        AND: {
          MarketplaceSale: undefined,
          isCancelled: false,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const soldListingData = await this.prisma.marketplaceSale.findMany({
      where: {
        listing: {
          tokenId: { in: tokenIds },
        },
      },
      include: {
        listing: true,
      },
      orderBy: {
        listingId: 'desc',
      },
    });

    // geting collection status for unsold listings
    if (!listingData.length) {
      listings = 0;
      floorPrice = 0;
      mintedVolume = 0;
    } else {
      listings = listingData;

      //compiling current price of each item
      for (const listing of listings) {
        // FIXME:
        const auctionPrice = [];
        // const auctionPrice = await this.prisma.marketplaceOffer.findMany({
        //   where: {
        //     listingId: listing.listingId,
        //     listingType: 'Auction',
        //   },
        //   orderBy: {
        //     totalOfferAmount: 'desc',
        //   },
        // });

        // FIXME:
        const directPrice = [];
        // const directPrice = await this.prisma.marketplaceOffer.findMany({
        //   where: {
        //     listingId: listing.listingId,
        //     listingType: 'Direct',
        //   },
        //   orderBy: {
        //     totalOfferAmount: 'desc',
        //   },
        // });

        if (auctionPrice.length) {
          const auctionPriceValue = ethers.utils.formatEther(
            auctionPrice[0].totalOfferAmount.toString(),
          );
          currentItemPricesData.push(auctionPriceValue);
        }

        //comparing direct listing offer price and buyout price, take highest as curent price
        if (directPrice.length) {
          const directPriceValue = ethers.utils.formatEther(
            directPrice[0].totalOfferAmount.toString(),
          );
          const buyoutPriceValue = ethers.utils.formatEther(
            toString(listing.buyoutPricePerToken),
          );
          const currentPrice = Math.max(
            Number(directPriceValue),
            Number(buyoutPriceValue),
          );
          currentItemPricesData.push(currentPrice);
        }

        if (
          !auctionPrice.length &&
          !directPrice.length &&
          listing.listingType == 'Direct'
        ) {
          const buyoutPriceValue = ethers.utils.formatEther(
            toString(listing.buyoutPricePerToken),
          );
          currentItemPricesData.push(buyoutPriceValue);
        }

        if (
          !auctionPrice.length &&
          !directPrice.length &&
          listing.listingType == 'Auction'
        ) {
          const buyoutPriceValue = ethers.utils.formatEther(
            toString(listing.reservePricePerToken),
          );
          currentItemPricesData.push(buyoutPriceValue);
        }
      }
    }

    const mergedFloorPrices = [
      ...currentItemPricesData,
      ...lazyMintedItemPricesArray,
    ];
    //geting the lowest price out of the compiled prices as floor price

    if (mergedFloorPrices.length) {
      floorPrice = +Math.min(...mergedFloorPrices.filter(Boolean));
    }

    if (mergedFloorPrices[0] == 0 && mergedFloorPrices.length == 1) {
      floorPrice = Math.min(...mergedFloorPrices);
    }

    // geting collection status for unsold listings
    for (const data of soldListingData) {
      const totalPricePaid = ethers.BigNumber.from(
        toString(data.totalPricePaid),
      );
      const totalPricePaidMatic = ethers.utils.formatEther(
        totalPricePaid.toString(),
      );
      mintedVolume = mintedVolume + +totalPricePaidMatic;
    }
    const lazyMintedVolume = soldlazyMintedItemPricesArray.reduce(
      (accumulator, value) => {
        return accumulator + value;
      },
      0,
    );

    const volume = mintedVolume + lazyMintedVolume;

    let finalVolume;
    if (volume <= 0.0000001) {
      finalVolume = volume.toFixed(+volume.toString().split('-')[1]);
    }
    if (volume > 999) {
      finalVolume = (volume / 1000).toFixed(2) + ' K';
    } else {
      finalVolume = volume.toPrecision(2);
    }

    if (soldListingData.length == 0) {
      lastSale = 0;
      lastSaleTimestamp = 0;
    } else {
      lastSale = ethers.utils.formatEther(
        soldListingData[0].totalPricePaid.toString(),
      );
      lastSaleTimestamp = soldListingData[0].createdAt;
    }

    // geting unique owner
    const mintedOwners = [];
    for (const tokenId of tokenIds) {
      const tokenOwnerships = await this.prisma.tokenOwnerships.findMany({
        where: {
          tokenId: tokenId,
          quantity: {
            gt: 0,
          },
        },
      });
      const ownersValue: Record<string, number> = {};
      for (const tokenOwnership of tokenOwnerships) {
        ownersValue[tokenOwnership.ownerAddress] = tokenOwnership.quantity;
      }
      // const owner = await this.erc115service.getTokenOwners(tokenId);
      Object.assign(mintedOwners, ownersValue);
    }

    const uniqueMintedOwner = Object.keys(mintedOwners);
    const ownerAddresses = [...uniqueMintedOwner, ...lazyMintedOwners];
    const uniqueOwnerAddresses = [...new Set(ownerAddresses)].filter(Boolean);

    let uniqueOwner;
    if (totalItems == 0) {
      uniqueOwner = 'N/A';
    } else {
      const uniqueOwnerValue = Number(
        Math.round((uniqueOwnerAddresses.length / +totalItems) * 100),
      );
      if (uniqueOwnerValue == 0) {
        uniqueOwner = 'N/A';
      } else {
        uniqueOwner = uniqueOwnerValue + ' %';
      }
    }

    let finalFloorPrice;
    if (floorPrice <= 0.0000001) {
      finalFloorPrice = floorPrice.toFixed(floorPrice.toString().split('-')[1]);
    } else {
      finalFloorPrice = Math.min(...mergedFloorPrices);
      finalFloorPrice = floorPrice;
    }

    return {
      listings,
      floorPrice: finalFloorPrice,
      lastSale,
      lastSaleTimestamp,
      volume: finalVolume,
      uniqueOwner,
    };
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
      percentChanges = Math.ceil(
        ((+totalVolumeNow - +totalVolumePrevious) / +totalVolumePrevious) * 100,
      );
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
    if (sortData == SortBy.VOLUME) {
      sortByData = 'totalVolumeNow';
    }
    if (sortData == SortBy.PERCENT_CHANGES) {
      sortByData = 'percentChanges';
    }
    if (sortData == SortBy.FLOOR_PRICE) {
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
      where: { id: +collectionId },
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

    const result = await this.getActivities(tokenIdsArray, page, event);

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

  /**
   * This queue is processed by worker package
   */
  async importQueue({ contractAddress, categoryId }: ImportDto) {
    await this.prisma.category
      .findFirstOrThrow({ where: { id: +categoryId } })
      .catch((err) => {
        throw new HttpException('Category not found', HttpStatus.NOT_FOUND);
      });
    const job = await this.importCollectionQueue.add(
      'import-collection',
      {
        contractAddress,
        categoryId,
      },
      {},
    );
    return job;
  }

  async clearImportQueue() {
    await this.importCollectionQueue.clean(0, 'delayed');
    await this.importCollectionQueue.clean(0, 'wait');
    await this.importCollectionQueue.clean(0, 'active');
    await this.importCollectionQueue.clean(0, 'completed');
    await this.importCollectionQueue.clean(0, 'failed');
    return true;
  }

  async getJobStatus(jobId: number) {
    const job = await this.importCollectionQueue.getJob(jobId);
    return job;
  }

  async deleteImportJob(jobId: number) {
    const job = await this.importCollectionQueue.getJob(jobId);
    await job.moveToFailed({ message: 'Deliberately stopped' }, true);
    // await job.releaseLock();
    await job.remove();
    return job;
  }

  async deleteImportedCollection(collectionId: number) {
    await this.prisma.importedContracts.delete({ where: { id: collectionId } });

    const itemsByCollection = await this.prisma.item.findMany({
      where: { collection_id: collectionId },
    });
    await this.prisma.itemViews.deleteMany({
      where: {
        itemId: {
          in: itemsByCollection.map((it) => it.id),
        },
      },
    });
    const deleted = await this.prisma.collection.delete({
      where: { id: collectionId },
    });

    return deleted;
  }

  async getActivities(tokenIds: number[], page: number, event: string) {
    const limit = 10;
    const offset = limit * (page - 1);
    if (!tokenIds)
      return {
        status: HttpStatus.OK,
        message: 'success',
        metadata: {
          page: Number(page),
          perPage: 10,
          pageCount: 1,
          totalCount: 0,
        },
        records: [],
      };
    const tokenIdsArrayOfNumber = tokenIds.map((i) => Number(i));

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
            bid."createdAt",
            "totalPrice" as price,
            "bidder" as from,
            listing."lister" as to,
            listing."tokenId" as tokenId
          FROM
            public."Bid" bid
            JOIN public."MarketplaceListing" listing
            ON bid."listingId" = listing."id"
        UNION
          SELECT
            'offer' AS event,
            offer."createdAt",
            "totalPrice" as price,
            offer."offeror" as from,
            '-' as to,
            offer."tokenId"
          FROM
            public."MarketplaceOffer" offer
        UNION
          SELECT
            'sale' AS event,
            "createdAt",
            "totalPricePaid" as price,
            "offeror" as from,
            "seller" as to,
            "tokenId"
          FROM
            public."AcceptedOffer"
        UNION
          SELECT
            'sale' AS event,
            sale."createdAt",
            "totalPricePaid" as price,
            "buyer" as from,
            'listing."lister"' as to,
            listing."tokenId"
          FROM
            public."MarketplaceSale" sale
            JOIN public."MarketplaceListing" listing
            ON sale."listingId" = listing."id"
        ) X
        WHERE X."tokenId" IN (${Prisma.join(tokenIdsArrayOfNumber)})
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
          bid."createdAt",
          "totalPrice" as price,
          "bidder" as from,
          listing."lister" as to,
          listing."tokenId" as tokenId
        FROM
          public."Bid" bid
          JOIN public."MarketplaceListing" listing
          ON bid."listingId" = listing."id"
      UNION
        SELECT
          'offer' AS event,
          offer."createdAt",
          "totalPrice" as price,
          offer."offeror" as from,
          '-' as to,
          offer."tokenId"
        FROM
          public."MarketplaceOffer" offer
      UNION
        SELECT
          'sale' AS event,
          "createdAt",
          "totalPricePaid" as price,
          "offeror" as from,
          "seller" as to,
          "tokenId"
        FROM
          public."AcceptedOffer"
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
          ON sale."listingId" = listing."id"
      ) X
    WHERE X."tokenId" IN (${Prisma.join(tokenIdsArrayOfNumber)})
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
  // async refreshMetadataQueue({}: RefreshMetadataDto) {
  //   // TODO:
  // }

  // async syncOwnershipQueue({}: SyncOwnershipDto) {
  //   // TODO:
  // }
}
