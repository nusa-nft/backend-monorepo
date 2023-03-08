import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { IpfsService } from '../ipfs/ipfs.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  Collection,
  Item,
  LazyMintListing,
  ListingType,
  Prisma,
  Royalty,
  TokenType,
  User,
} from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ethers } from 'ethers';
import { ConfigService } from '@nestjs/config';
import { IndexerService } from '../indexer/indexer.service';
import { UsersService } from '../users/users.service';
import { NATIVE_CURRENCY } from './web3/constants';
import { CollectionService } from '../collection/collection.service';
import { MintRequestStruct, signMintRequest } from './web3/erc1155-lazy-mint';
import { isArray, isObject } from 'class-validator';
import {
  ItemDetail,
  ItemListResponse,
  ItemOwner,
  Listing,
} from './item.interface';
import { HttpStatusCode } from 'axios';
import { ItemDto, ItemQueryParamsV2, PaginationQueryParams } from './dto/item.dto';
import { RecentlySoldItem } from '../interfaces';
import { toString } from '../lib/toString';
import { v4 as uuidV4 } from 'uuid';
import standardizeMetadataAttribute from '../lib/standardizeMetadataAttributes';
import {
  AttributeType,
  ListingStatus,
  MarketplaceListing,
  OfferStatus,
} from '@nusa-nft/database';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class ItemServiceV2 {
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
    private notificationService: NotificationService,
  ) {}

  async getItems(
    filter: ItemQueryParamsV2,
    token: string | null,
  ): Promise<ItemListResponse> {
    let userId = null;
    if (token) {
      const user = this.jwtService.decode(token);
      userId = user.sub;
    }
    const {
      attributes,
      page,
      name,
      collectionId,
      isFavorited,
      isOnSale,
      owner,
      creator,
      listingType,
      hasOffers,
      priceMin,
      priceMax,
      isMultiple,
      isSingle,
      isRecentlySold,
      categoryId,
    } = filter;
    let query: Prisma.ItemFindManyArgs = {
      skip: 10 * (page ? page - 1 : 10 - 1),
      take: 10,
      where: {
        deleted: false,
      },
      include: {
        attributes: true,
        Collection: {
          include: {
            royalty: true,
            Category: true,
          },
        },
        LazyMintListing: {
          where: {
            isCancelled: false,
            isFulfilled: false,
            endTime: { gt: Math.floor(Date.now() / 1000) },
          },
          orderBy: { id: 'desc' },
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
      orderBy: { id: 'desc' },
    };

    if (isOnSale) {
      query = await this.filterIsOnSale({
        filter: query,
        listingType,
        hasOffers,
        priceMin,
        priceMax,
      });
    }

    if (attributes) {
      query = this.filterAttributes(attributes, query);
    }

    if (name) {
      query = this.filterName(name, query);
    }

    if (categoryId) {
      query = this.filterCategoryId(+categoryId, query);
    }

    if (isMultiple) {
      query = this.filterMultiple(query);
    }

    if (isSingle) {
      query = this.filterSingle(query);
    }

    if (isFavorited && userId) {
      query = this.filterIsLiked(userId, query);
    }

    if (collectionId) {
      query = this.filterCollectionId(collectionId, query);
    }

    if (owner) {
      query = await this.filterOwner(owner, query);
    }

    if (creator) {
      query = this.filterCreator(creator, query);
    }

    if (isRecentlySold) {
      query = this.filterIsRecentlySold(query);
    }

    const dataCount = await this.prisma.item.aggregate({
      _count: true,
      where: query.where,
    });

    const items = await this.prisma.item.findMany(query);

    const records: ItemDetail[] = await Promise.all(
      items.map(
        async (item: Item & { LazyMintListing } & Partial<ItemDetail>) => {
          const isLiked = await this.isItemLiked(item, userId);
          // TODO:
          // Get owners can be optimized by retrieving from database
          // Since backend database and indexer database is now merged into 1
          // This is now possible
          const owners = await this.getItemOwners(item);
          const relatedItems = await this.getRelatedItems(item, userId);
          // TODO:
          // Aggregate Listing should be from item.MarketplaceListing and item.LazyMintListing
          // Since backend database and indexer database is now merged into 1
          // This is now possible
          const onChainListings = await this.getOnChainListings(item);
          const listings = await this.aggregateListings(
            onChainListings,
            item.LazyMintListing,
            item.Creator,
          );
          return {
            ...item,
            tokenId: toString(item.tokenId),
            isLiked,
            owners,
            relatedItems,
            listings: listings,
            creatorEarnings: (
              item.Collection as Collection & { royalty: Royalty[] }
            ).royalty.reduce((accum, val) => accum + val.percentage, 0),
          } as ItemDetail;
        },
      ),
    );

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

  filterAttributes(
    attributes: Map<string, string | number>,
    filter: Prisma.ItemFindManyArgs,
  ): Prisma.ItemFindManyArgs {
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

    filter = {
      ...filter,
      where: {
        ...filter.where,
        attributes: {
          some: {
            OR: attributesFilter,
          },
        },
      },
    };

    return filter;
  }

  filterName(
    name: string,
    filter: Prisma.ItemFindManyArgs,
  ): Prisma.ItemFindManyArgs {
    filter = {
      ...filter,
      where: {
        ...filter.where,
        name: {
          contains: name,
          mode: 'insensitive',
        },
      },
    };

    return filter;
  }

  filterCategoryId(
    categoryId: number,
    filter: Prisma.ItemFindManyArgs,
  ): Prisma.ItemFindManyArgs {
    return {
      ...filter,
      where: {
        ...filter.where,
        Collection: {
          category_id: categoryId,
        },
      },
    };
  }

  filterSingle(filter: Prisma.ItemFindManyArgs): Prisma.ItemFindManyArgs {
    return {
      ...filter,
      where: {
        ...filter.where,
        supply: { equals: 1 },
      },
    };
  }

  filterMultiple(filter: Prisma.ItemFindManyArgs): Prisma.ItemFindManyArgs {
    return {
      ...filter,
      where: {
        ...filter.where,
        supply: { gt: 1 },
      },
    };
  }

  filterIsLiked(
    userId: number,
    filter: Prisma.ItemFindManyArgs,
  ): Prisma.ItemFindManyArgs {
    filter = {
      ...filter,
      where: {
        ...filter.where,
        ItemLikes: {
          some: {
            userId,
          },
        },
      },
    };
    return filter;
  }

  filterCollectionId(
    collectionId: number,
    filter: Prisma.ItemFindManyArgs,
  ): Prisma.ItemFindManyArgs {
    return {
      ...filter,
      where: {
        ...filter.where,
        collection_id: Number(collectionId),
      },
    };
  }

  filterIsRecentlySold(
    filter: Prisma.ItemFindManyArgs,
  ): Prisma.ItemFindManyArgs {
    return {
      ...filter,
      where: {
        OR: [
          {
            MarketplaceListing: {
              some: {
                MarketplaceSale: {
                  // id: { gt: 0 },
                },
              },
            },
          },
          {
            LazyMintSale: {
              some: {
                id: { gt: 0 },
              },
            },
          },
        ],
      },
      orderBy: { id: 'desc' },
      take: 10,
      include: {
        ...filter.include,
        MarketplaceListing: {
          select: {
            MarketplaceSale: true,
          },
        },
        LazyMintSale: true,
      },
    };
  }

  async filterIsOnSale({
    filter,
    listingType,
    hasOffers,
    priceMin,
    priceMax,
  }: {
    filter: Prisma.ItemFindManyArgs;
    listingType: ListingType;
    hasOffers?: boolean;
    priceMin?: number | Prisma.Decimal;
    priceMax?: number | Prisma.Decimal;
  }): Promise<Prisma.ItemFindManyArgs> {
    if (priceMin) {
      priceMin = new Prisma.Decimal(
        ethers.utils.parseEther(priceMin.toString()).toString(),
      );
    }
    if (priceMax) {
      priceMax = new Prisma.Decimal(
        ethers.utils.parseEther(priceMax.toString()).toString(),
      );
    }

    let lazyMintListingFilter: Prisma.LazyMintListingListRelationFilter = {
      some: {
        isCancelled: false,
        isFulfilled: false,
        endTime: { gt: Math.floor(Date.now() / 1000) },
      },
    };

    let marketplaceListingFilter: Prisma.MarketplaceListingListRelationFilter =
      {
        some: {
          endTime: {
            gt: Math.floor(Date.now() / 1000),
          },
          quantity: { gt: 0 },
        },
      };

    if (hasOffers) {
      // FIXME:
      // marketplaceListingFilter = {
      //   some: {
      //     ...marketplaceListingFilter.some,
      //     MarketplaceOffer: { some: {} },
      //   },
      // };
    }

    if (priceMin) {
      lazyMintListingFilter = {
        some: {
          ...lazyMintListingFilter.some,
          buyoutPricePerToken: { gte: priceMin },
        },
      };
      marketplaceListingFilter = {
        some: {
          ...marketplaceListingFilter.some,
          OR: [
            {
              listingType: ListingType.Direct,
              buyoutPricePerToken: { gte: priceMin },
            },
            {
              listingType: ListingType.Auction,
              reservePricePerToken: { gte: priceMin },
            },
          ],
        },
      };
    }

    if (priceMax) {
      lazyMintListingFilter = {
        some: {
          ...lazyMintListingFilter.some,
          buyoutPricePerToken: { lte: priceMax },
        },
      };
      marketplaceListingFilter = {
        some: {
          ...marketplaceListingFilter.some,
          OR: [
            {
              listingType: ListingType.Direct,
              buyoutPricePerToken: { lte: priceMax },
            },
            {
              listingType: ListingType.Auction,
              reservePricePerToken: { lte: priceMax },
            },
          ],
        },
      };
    }

    if (priceMin && priceMax) {
      lazyMintListingFilter = {
        some: {
          ...lazyMintListingFilter.some,
          buyoutPricePerToken: {
            gte: priceMin,
            lte: priceMax,
          },
        },
      };
      marketplaceListingFilter = {
        some: {
          ...marketplaceListingFilter.some,
          OR: [
            {
              listingType: ListingType.Direct,
              buyoutPricePerToken: { gte: priceMin, lte: priceMax },
            },
            {
              listingType: ListingType.Auction,
              reservePricePerToken: { gte: priceMin, lte: priceMax },
            },
          ],
        },
      };
    }

    if (listingType) {
      marketplaceListingFilter = {
        some: {
          ...marketplaceListingFilter.some,
          listingType,
        },
      };
    }

    filter = {
      ...filter,
      where: {
        ...filter.where,
        OR: [
          { LazyMintListing: lazyMintListingFilter },
          { MarketplaceListing: marketplaceListingFilter },
        ],
      },
    };

    if (listingType == ListingType.Auction) {
      filter = {
        ...filter,
        where: {
          ...filter.where,
          MarketplaceListing: marketplaceListingFilter,
        },
      };
    }

    return filter;
  }

  async filterOwner(
    owner: string,
    filter: Prisma.ItemFindManyArgs,
  ): Promise<Prisma.ItemFindManyArgs> {
    const tokenOwnerships = await this.prisma.tokenOwnerships.findMany({
      where: {
        ownerAddress: owner,
      },
    });

    const itemsOwnedOnChain = await this.prisma.item.findMany({
      where: {
        OR: tokenOwnerships.map((to) => ({
          contract_address: to.contractAddress,
          chainId: to.chainId,
          tokenId: to.tokenId,
        })),
      },
    });

    const itemIdsOwnedOnChain = itemsOwnedOnChain
      .map((item) => item.id)
      .sort((a: number, b: number) => a - b);


    const itemsLazyMinted = await this.prisma.item.findMany({
      where: {
        creator_address: owner,
        quantity_minted: 0,
      },
    });
    const itemIdsLazyMinted = itemsLazyMinted.map((item) => item.id);

    console.log({ itemIdsOwnedOnChain, itemIdsLazyMinted });

    const itemIdsOwned = [
      ...new Set([...itemIdsOwnedOnChain, ...itemIdsLazyMinted]),
    ].sort((a: number, b: number) => a - b);

    return {
      ...filter,
      where: {
        ...filter.where,
        id: { in: itemIdsOwned },
      },
    };
  }

  filterCreator(
    creator: string,
    filter: Prisma.ItemFindManyArgs,
  ): Prisma.ItemFindManyArgs {
    return {
      ...filter,
      where: {
        ...filter.where,
        creator_address: creator,
      },
    };
  }

  async getItem(id: number, jwtToken: string | null): Promise<ItemDetail> {
    let userId = null;
    if (jwtToken) {
      const user = this.jwtService.decode(jwtToken);
      userId = user.sub;
    }

    const item = await this.prisma.item.findUnique({
      where: { id: +id },
      include: {
        attributes: true,
        Collection: {
          include: {
            royalty: true,
          },
        },
        LazyMintListing: {
          where: {
            isCancelled: false,
            isFulfilled: false,
            endTime: { gt: Math.floor(Date.now() / 1000) },
          },
          orderBy: { id: 'desc' },
          // take: 1,
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
    // Get item.isLiked true/false
    const isLiked = await this.isItemLiked(item, userId);
    const owners = await this.getItemOwners(item);
    const relatedItems = await this.getRelatedItems(item);
    const onChainListings = await this.getOnChainListings(item);
    const listings = await this.aggregateListings(
      onChainListings,
      item.LazyMintListing,
      item.Creator,
    );

    return {
      ...item,
      isLiked,
      owners,
      relatedItems,
      listings,
      creatorEarnings: item.Collection.royalty.reduce(
        (accum, val) => accum + val.percentage,
        0,
      ),
    };
  }

  async aggregateListings(
    onChainListings: MarketplaceListing[],
    offChainListings: LazyMintListing[],
    creator: User,
  ) {
    const listings: Listing[] = [];

    for (const l of onChainListings) {
      const user = await this.usersService.findWalletOne(l.lister);
      if (user) {
        const lister = {
          wallet_address: user.wallet_address,
          username: user.username,
          profile_picture: user.profile_picture,
        };
        listings.push({
          ...l,
          id: l.id.toNumber(),
          tokenId: l.tokenId.toNumber(),
          startTime: l.startTime,
          endTime: l.endTime,
          quantity: l.quantity,
          reservePricePerToken: toString(l.reservePricePerToken),
          buyoutPricePerToken: toString(l.buyoutPricePerToken),
          lister,
          isLazyMint: false,
        });

        continue;
      }

      listings.push({
        ...l,
        id: l.id.toNumber(),
        tokenId: l.tokenId.toNumber(),
        startTime: l.startTime,
        endTime: l.endTime,
        quantity: l.quantity,
        reservePricePerToken: toString(l.reservePricePerToken),
        buyoutPricePerToken: toString(l.buyoutPricePerToken),
        lister: {
          wallet_address: l.lister,
        },
        isLazyMint: false,
      });
    }

    for (const l of offChainListings) {
      listings.push({
        ...l,
        reservePricePerToken: l.reservePricePerToken.toString(),
        buyoutPricePerToken: l.buyoutPricePerToken.toString(),
        lister: {
          wallet_address: creator.wallet_address,
          username: creator.username,
          profile_picture: creator.profile_picture,
        },
        isLazyMint: true,
      });
    }

    listings.sort((a, b) => {
      const aPrice = a.listingType == ListingType.Direct
        ? ethers.BigNumber.from(a.buyoutPricePerToken)
        : ethers.BigNumber.from(a.reservePricePerToken)
      const bPrice = b.listingType == ListingType.Auction
        ? ethers.BigNumber.from(b.buyoutPricePerToken)
        : ethers.BigNumber.from(b.reservePricePerToken)
      if (aPrice.gt(bPrice)) return 1;
      return -1;
    });

    return listings;
  }

  async createLazyMintSale(listingId: number, quantity: number) {
    const lazyMintListing = await this.prisma.lazyMintListing.findFirst({
      where: { id: listingId },
    });
    const item = await this.prisma.item.findFirst({
      where: { id: lazyMintListing.itemId },
    });

    const isFulfilled = lazyMintListing.quantity - quantity == 0;

    if (isFulfilled) {
      await this.prisma.lazyMintListing.update({
        where: { id: listingId },
        data: { isFulfilled },
      });
    }

    const lazyMintListingId = listingId;
    const itemId = lazyMintListing.itemId as number;
    const tokenId = item.tokenId;
    const tokenType = TokenType.ERC1155;
    const listingType = ListingType.Direct;
    const quantityBought = quantity;
    const totalPricePaid = ethers.BigNumber.from(
      lazyMintListing.buyoutPricePerToken.toString(),
    )
      .mul(quantity)
      .toString();
    const createdAt = Math.floor(Date.now() / 1000);

    const lazyMintSale = await this.prisma.lazyMintSale.create({
      data: {
        lazyMintListingId,
        itemId,
        tokenId,
        tokenType,
        listingType,
        quantityBought,
        totalPricePaid: new Prisma.Decimal(totalPricePaid),
        createdAt,
      },
    });

    await this.notificationService.lazyMintNotification(
      lazyMintSale,
      lazyMintListing,
    );

    return lazyMintSale;
  }

  async setMinted(itemId: number, tokenId: number, quantityMinted: number) {
    console.log('setMinted');
    console.log({ itemId, tokenId, quantityMinted });
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
        quantity_minted: quantityMinted,
      },
    });

    return {
      status: HttpStatus.OK,
      message: 'Item updated',
      data: item,
    };
  }

  async isItemLiked(item: any, userId: number): Promise<boolean> {
    if (!item) return false;
    else {
      const liked = await this.prisma.itemLikes.findFirst({
        where: {
          itemId: item.id,
          userId: userId,
        },
      });
      return !!liked;
    }
  }

  async getItemOwners(item: Item & any): Promise<ItemOwner[]> {
    const owners: ItemOwner[] = [];
    if (item.quantity_minted > 0) {
      const ownerships = await this.prisma.tokenOwnerships.findMany({
        where: {
          contractAddress: item.contract_address,
          chainId: item.chainId,
          tokenId: item.tokenId,
          quantity: { gt: 0 },
        },
      });
      console.log(ownerships);
      for (const own of ownerships) {
        const user = await this.prisma.user.findFirst({
          where: {
            wallet_address: own.ownerAddress,
          },
        });
        if (user) {
          owners.push({
            wallet_address: own.ownerAddress,
            username: user.username,
            profile_picture: user.profile_picture,
            quantity: own.quantity,
          });
        } else {
          owners.push({
            wallet_address: own.ownerAddress,
            quantity: own.quantity,
          });
        }
      }
    }
    const quantityNotMinted = item.supply - item.quantity_minted;
    if (quantityNotMinted > 0) {
      owners.push({
        wallet_address: item.Creator.wallet_address,
        username: item.Creator.username,
        profile_picture: item.Creator.profile_picture,
        quantity: quantityNotMinted,
      });
    }
    return owners;
  }

  async getRelatedItems(item: Item & any, userId?: number) {
    const relatedItemsInCollection = await this.pickRandom(
      item.collection_id,
      item.id,
      userId,
    );
    return relatedItemsInCollection;
  }

  async pickRandom(collection_id: number, itemId: number, userId?: number) {
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
      include: {
        attributes: true,
        Collection: {
          include: {
            royalty: true,
            Category: true,
          },
        },
        LazyMintListing: {
          where: {
            isCancelled: false,
            isFulfilled: false,
            endTime: { gt: Math.floor(Date.now() / 1000) },
          },
          orderBy: { id: 'desc' },
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

    const records: Partial<ItemDetail>[] = await Promise.all(
      items.map(
        async (item: Item & { LazyMintListing } & Partial<ItemDetail>) => {
          const isLiked = await this.isItemLiked(item, userId);
          // const owners = await this.getItemOwners(item);
          // TODO:
          // Aggregate Listing should be from item.MarketplaceListing and item.LazyMintListing
          // Since backend database and indexer database is now merged into 1
          // This is now possible
          const onChainListings = await this.getOnChainListings(item);
          const listings = await this.aggregateListings(
            onChainListings,
            item.LazyMintListing,
            item.Creator,
          );
          return {
            ...item,
            isLiked,
            // owners,
            listings: listings,
            creatorEarnings: (
              item.Collection as Collection & { royalty: Royalty[] }
            ).royalty.reduce((accum, val) => accum + val.percentage, 0),
          } as ItemDetail;
        },
      ),
    );

    return records;
  }

  async getOnChainListings(item: Item & any): Promise<MarketplaceListing[]> {
    const onChainListings = await this.prisma.marketplaceListing.findMany({
      where: {
        Item: { id: item.id },
        status: { equals: ListingStatus.CREATED }
      },
      include: {
        bids: {
          orderBy: { totalPrice: 'desc' },
          include: {
            Bidder: true
          }
        },
      },
    });

    return onChainListings;
  }

  async getLazyMintListingSignature(
    listingId: number,
    minterWalletAddress: string,
    quantity: number,
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

    if (listing.quantity < quantity) {
      throw new HttpException(
        'quantity exceeds listing quantity',
        HttpStatusCode.BadRequest,
      );
    }

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
      quantity: quantity,
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

  async getRecentlySold(page: number) {
    const limit = 10;
    const offset = limit * (page - 1);
    const query = Prisma.sql`
    select
      "Item"."id" as "itemId",
      "Item"."name" as "name",
      "Item"."image" as "image",
      "MarketplaceSale"."totalPricePaid" as "pricePaid",
      "MarketplaceSale"."createdAt" as "createdAt"
    from 
      "MarketplaceSale"
    inner join "MarketplaceListing" 
      on "MarketplaceSale"."listingId" = "MarketplaceListing"."id"
      inner join "Item"
      on "MarketplaceListing"."tokenId" = "Item"."tokenId"
    union
    select 
      "Item"."id" as "itemId",
      "Item"."name" as "name",
      "Item"."image" as "image",
      "LazyMintSale"."totalPricePaid" as "pricePaid",
      "LazyMintSale"."createdAt" as "createdAt"
    from
      "LazyMintSale"
      inner join "Item"
      on "LazyMintSale"."tokenId" = "Item"."tokenId"
    order by "createdAt" desc
    limit ${limit}
    offset ${offset}`;

    const sale: RecentlySoldItem[] = await this.prisma.$queryRaw(query);

    return {
      status: HttpStatus.OK,
      message: 'success',
      metadata: {
        page: page,
        perPage: 10,
        pageCount: Math.ceil(sale.length / 10),
        totalCount: sale.length,
      },
      records: sale,
    };
  }

  async uploadIpfsItemMetadata(
    createItemDto: ItemDto,
    file: Express.Multer.File,
    userId: number,
    userWalletAddress: string,
  ) {
    let image = '';
    let ipfsUri = '';
    let attributeData = [];
    const collection_id = +createItemDto.collection_id;
    let collection: Collection;
    const nusa_item_id: string = uuidV4();

    // If no collection, create collection automatically
    if (!collection_id) {
      collection = await this.createDefaultCollection(
        userId,
        userWalletAddress,
        createItemDto.chainId,
      );
    } else {
      collection = await this.prisma.collection.findFirst({
        where: { id: collection_id },
      });
    }

    const ipfsImageData = await this.ipfsService.uploadImage(file.path);
    image = `ipfs://${ipfsImageData.Hash}`;

    if (createItemDto.attributes) {
      try {
        attributeData = JSON.parse(createItemDto.attributes);
      } catch (err) {
        throw new HttpException(
          'Invalid attributes format',
          HttpStatus.BAD_REQUEST,
        );
      }
    } else {
      attributeData = [];
    }

    const standardizedAttributes = standardizeMetadataAttribute(attributeData);
    const ipfsMetadata = await this.ipfsService.uploadMetadata({
      name: createItemDto.name,
      description: createItemDto.description,
      image,
      attributes: standardizedAttributes,
      nusa_collection: {
        name: collection.name,
        slug: collection.slug,
      },
      external_link: createItemDto.external_link,
      explicit_sensitive: createItemDto.explicit_sensitive,
      nusa_item_id,
    });
    ipfsUri = `ipfs://${ipfsMetadata.Hash}`;

    return { ipfsUri, itemUuid: nusa_item_id };
  }

  async createDefaultCollection(
    userId: number,
    userWalletAddress: string,
    chainId: number,
  ) {
    const myCollection = await this.collectionService.findMyCollection(userId, {
      page: 1,
    });
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
        chainId: chainId,
        creator_address: userWalletAddress,
        slug,
        explicit_sensitive: false,
        // TODO: Set default logo image to a variable
        logo_image: 'ipfs://QmaTCGzpQBRy1rmCcwqtY1t8MPj4NkfhjdqLRStoPPbpPC', // default logo image
      },
    );
    return collection.data;
  }

  async getItemByUuid(itemUuid: string) {
    const item = await this.prisma.item.findFirst({
      where: { uuid: itemUuid },
    });
    if (!item) {
      throw new HttpException('Item not found', HttpStatus.NOT_FOUND);
    }
    return item;
  }

  async getBidsByListingId(listingId: number, pagination: PaginationQueryParams) {
    let { page } = pagination;
    if (!page) page = 1;

    const listing = await this.prisma.marketplaceListing.findFirstOrThrow({
      where: { id: listingId },
      include: { Item: true }
    })
    const itemData = await this.prisma.item.findFirst({
      where: {
        id: listing.Item.id,
      },
      include: {
        Collection: true,
      },
    });

    const collectionStatus = await this.collectionService.getCollectionStatus(
      +itemData.Collection.id,
    );
    const floorPrice = collectionStatus.floorPrice || 0;

    const bids = await this.prisma.bid.findMany({
      skip: 10 * (+page - 1),
      take: 10,
      where: {
        listingId: listing.id,
      },
      orderBy: {
        totalPrice: 'desc',
      },
    });
    const records = bids.map((o) => {
      const pricePerTokenWei = o.pricePerToken;
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
        pricePerTokenEth - (_floorPrice / _floorPrice) * 100;
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

      // const expirationTimestamp = o..toNumber() * 1000;
      // let expiration;
      // if (expirationTimestamp - Date.now() <= 0) {
      //   expiration = `${formatDistance(Date.now(), expirationTimestamp)} ago`;
      // } else {
      //   expiration = formatDistance(Date.now(), expirationTimestamp);
      // }

      return {
        ...o,
        floorDifference,
        // expiration,
        fromAddress: o.bidder,
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
}
