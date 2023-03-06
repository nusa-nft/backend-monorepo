import { HttpStatus, Injectable } from '@nestjs/common';
import { ListingType } from '@prisma/client';
import { differenceInDays, format, formatDistance, subDays } from 'date-fns';
import { BigNumber, ethers, FixedNumber } from 'ethers';
import { Erc1155Service } from '../erc1155/erc1155.service';
import { toString } from '../lib/toString';
import { PrismaService } from '../prisma/prisma.service';
import {
  OnSaleItemSortBy,
  OnSaleQueryParams,
  CollectionStatusQueryParams,
  PriceHistorySortBy,
  SaleHistoryQueryParams,
} from './dto/marketplace.dto';

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly erc115service: Erc1155Service,
  ) {}

  async getActiveListings(assetContractAddress: string, tokenId: number) {
    return this.prisma.marketplaceListing.findMany({
      where: {
        AND: [
          {
            assetContract: {
              equals: assetContractAddress,
              mode: 'insensitive',
            },
            tokenId,
            isCancelled: false,
          },
          {
            OR: [
              // Direct listing
              {
                listingType: ListingType.Direct,
                endTime: {
                  gt: Math.floor(Date.now() / 1000),
                },
                quantity: { gt: 0 },
                MarketplaceSale: null,
              },
              // Auction Listing
              {
                listingType: ListingType.Auction,
                OR: [{ isClosedByBidder: null }, { isClosedByLister: null }],
              },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMarketplaceListings(onsaleQueryParams: OnSaleQueryParams) {
    const { listerAddress, page, sortBy } = onsaleQueryParams;
    const where: Record<string, any> = {
      lister: { equals: listerAddress, mode: 'insensitive' },
      isCancelled: false,
      quantity: {
        gt: 0,
      },
      startTime: {
        lte: Math.floor(Date.now() / 1000),
      },
      endTime: {
        gt: Math.floor(Date.now() / 1000),
      },
    };

    const orderBy = this.onSaleItemSortBy(sortBy);

    const listings = await this.prisma.marketplaceListing.findMany({
      skip: 10 * (page ? page - 1 : 10 - 1),
      take: 10,
      where,
      orderBy,
    });

    const dataCount = await this.prisma.marketplaceListing.aggregate({
      _count: true,
      where,
    });

    return {
      metadata: {
        page,
        perPage: 10,
        pageCount: Math.ceil(dataCount._count / 10),
      },
      records: listings,
    };
  }

  onSaleItemSortBy(sortBy) {
    let orderBy;
    if (sortBy == OnSaleItemSortBy[0]) {
      orderBy = { createdAt: 'desc' };
    }
    if (sortBy == OnSaleItemSortBy[1]) {
      orderBy = { reservePricePerToken: 'desc' };
    }
    if (sortBy == OnSaleItemSortBy[2]) {
      orderBy = { reservePricePerToken: 'asc' };
    }
    if (sortBy == OnSaleItemSortBy[3]) {
      orderBy = { endTime: 'asc' };
    }
    return orderBy;
  }

  // async getMarketplaceListingOffers(listingId: number) {
  //   const offers = await this.prisma.marketplaceOffer.findMany({
  //     where: { listingId },
  //     orderBy: { createdAt: 'desc' },
  //   });

  //   return offers;
  // }

  async getCollectionStatus(collectionStatus: CollectionStatusQueryParams) {
    const {
      tokenIds,
      totalItems,
      lazyMintedOwners,
      lazyMintedItemPrices,
      soldLazyMintedItemPrices,
    } = collectionStatus;
    const tokenIdsArray = tokenIds.split(',').map(Number);
    const lazyMintedOwnersArray = lazyMintedOwners.split(',');
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
        tokenId: { in: tokenIdsArray },
        AND: {
          MarketplaceSale: null,
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
          tokenId: { in: tokenIdsArray },
        },
      },
      include: {
        listing: true,
      },
      orderBy: {
        id: 'desc',
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

    const volume = (mintedVolume + lazyMintedVolume);

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
      lastSale = ethers.utils.formatEther(soldListingData[0].totalPricePaid.toString());
      lastSaleTimestamp = soldListingData[0].createdAt;
    }

    // geting unique owner
    const mintedOwners = [];
    for (const tokenId of tokenIdsArray) {
      const owner = await this.erc115service.getTokenOwners(tokenId);
      Object.assign(mintedOwners, owner);
    }

    const uniqueMintedOwner = Object.keys(mintedOwners);
    const ownerAddresses = [...uniqueMintedOwner, ...lazyMintedOwnersArray];
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

  // FIXME: 
  // async getMarketplaceOfferHistory(
  //   tokenId: number,
  //   page: number,
  //   floorPrice: number,
  // ) {
  //   const offerHistory = await this.prisma.marketplaceOffer.findMany({
  //     skip: 10 * (+page - 1),
  //     take: 10,
  //     where: {
  //       listing: {
  //         tokenId: +tokenId,
  //         quantity: {
  //           gt: 0,
  //         },
  //       },
  //     },
  //     orderBy: {
  //       createdAt: 'desc',
  //     },
  //     include: {
  //       listing: true,
  //     },
  //   });
  //   const histories = [];

  //   const metadata = {
  //     page,
  //     perPage: 10,
  //   };

  //   if (!offerHistory.length) {
  //     histories;
  //   } else {
  //     for (const offer of offerHistory) {
  //       const {
  //         totalOfferAmount,
  //         expirationTimestamp,
  //         listing,
  //         offeror,
  //         quantityWanted,
  //         currency,
  //       } = offer;

  //       let _expirationTimestamp;
  //       if (expirationTimestamp == 0) {
  //         _expirationTimestamp = listing.endTime * 1000;
  //       } else {
  //         _expirationTimestamp = expirationTimestamp * 1000;
  //       }

  //       const weiPrice = ethers.BigNumber.from(totalOfferAmount.toString()).div(
  //         +quantityWanted,
  //       );

  //       const maticPrice = ethers.utils.formatEther(weiPrice.toString());
  //       const buyoutPriceBigNumber = ethers.BigNumber.from(
  //         toString(listing.buyoutPricePerToken),
  //       );
  //       const maticBuyoutPricePerToken = ethers.utils.formatEther(
  //         buyoutPriceBigNumber.toString(),
  //       );
  //       const price = `${maticPrice} MATIC`;

  //       let _floorPrice;
  //       if (floorPrice == 0) {
  //         _floorPrice = +maticBuyoutPricePerToken;
  //       } else {
  //         _floorPrice = +floorPrice;
  //       }

  //       const floorDifferenceValue =
  //         ((+maticPrice - _floorPrice) / _floorPrice) * 100;

  //       let floorDifference;
  //       if (Math.sign(floorDifferenceValue) == -1) {
  //         floorDifference = `${Math.abs(
  //           Math.floor(floorDifferenceValue),
  //         )}% below`;
  //       }
  //       if (floorDifferenceValue == 0) {
  //         floorDifference = `equal`;
  //       }
  //       if (Math.sign(floorDifferenceValue) == 1) {
  //         floorDifference = `${Math.round(floorDifferenceValue)}% above`;
  //       }

  //       let expiration;
  //       if (_expirationTimestamp - Date.now() <= 0) {
  //         expiration = `${formatDistance(Date.now(), _expirationTimestamp)} ago`;
  //       } else {
  //         expiration = formatDistance(Date.now(), _expirationTimestamp);
  //       }

  //       const fromAddress = offeror;

  //       histories.push({
  //         price,
  //         floorDifference,
  //         expiration,
  //         fromAddress,
  //         listing,
  //         totalOfferAmount,
  //         expirationTimestamp,
  //         quantityWanted,
  //         currency,
  //       });
  //     }
  //   }

  //   return {
  //     metadata,
  //     records: histories,
  //   };
  // }

  async getPriceHistory(tokenId: number, sortRange: SaleHistoryQueryParams) {
    let rangeInSecond;
    let rangeInDays;
    const range = sortRange.sortRange.toString();
    const secondPerDay = 86400;
    const data = [];
    let totalVolumeNow = 0;
    let totalVolumePrevious = 0;

    if (range == PriceHistorySortBy[0]) {
      rangeInSecond = secondPerDay * 7;
      rangeInDays = 6;
    }

    if (range == PriceHistorySortBy[1]) {
      rangeInSecond = secondPerDay * 30;
      rangeInDays = 29;
    }

    if (range == PriceHistorySortBy[2]) {
      rangeInSecond = secondPerDay * 60;
      rangeInDays = 59;
    }

    if (range == PriceHistorySortBy[3]) {
      rangeInSecond = secondPerDay * 90;
      rangeInDays = 89;
    }

    if (range == PriceHistorySortBy[4]) {
      rangeInSecond = secondPerDay * 1;
      rangeInDays = 0;
    }

    const comparisonRangeSeconds = rangeInSecond * 2;
    const comparisonRangeDays = rangeInDays * 2;

    const lt = Math.ceil(Date.now() / 1000);
    const gt = Math.ceil(Date.now() / 1000 - rangeInSecond);

    const comparisonLt = gt;
    const comparisonGt = Math.ceil(Date.now() / 1000 - comparisonRangeSeconds);

    const sales = await this.getSalesByRange(lt, gt, +tokenId);
    if (!sales.length) {
      totalVolumeNow = 0;
    }

    const comparisonSales = await this.getSalesByRange(
      comparisonLt,
      comparisonGt,
      tokenId,
    );
    if (!sales.length) {
      totalVolumePrevious = 0;
    }

    for (let i = rangeInDays; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'dd - MM - yyyy');
      const prices = [];
      for (const s of sales) {
        if (
          differenceInDays(new Date(), new Date(s.createdAt * 1000)) == i &&
          s.totalPricePaid
        ) {
          const maticTotalPricePaid = ethers.utils.formatEther(
            s.totalPricePaid.toString(),
          );

          totalVolumeNow = totalVolumeNow + +maticTotalPricePaid;

          prices.push(maticTotalPricePaid);
        } else {
          continue;
        }
      }

      for (const data of comparisonSales) {
        const maticTotalPricePaid = ethers.utils.formatEther(
          data.totalPricePaid.toString(),
        );
        totalVolumePrevious = totalVolumePrevious + +maticTotalPricePaid;
      }

      data.push({
        date,
        prices,
      });
    }

    const reversedData = data.reverse();

    reversedData.push({
      totalVolumeNow,
      totalVolumePrevious,
    });

    return reversedData;
  }

  async getMarketplaceListerAddress(listingId: number) {
    const listing = await this.prisma.marketplaceListing.findFirst({
      where: {
        id: +listingId,
      },
    });
    return listing.lister;
  }

  async getSalesByRange(lt: number, gt: number, tokenId: number) {
    const sales = await this.prisma.marketplaceSale.findMany({
      where: {
        listing: {
          tokenId: +tokenId,
        },
        AND: {
          createdAt: {
            lt,
            gt,
          },
        },
      },
    });

    return sales;
  }
}
