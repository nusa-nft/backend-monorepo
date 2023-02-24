import { Controller, Get, Query, Param } from '@nestjs/common';
import {
  CollectionStatusQueryParams,
  OnSaleQueryParams,
  PriceHistorySortBy,
  SaleHistoryQueryParams,
} from './dto/marketplace.dto';
import { MarketplaceService } from './marketplace.service';

@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('active-listing')
  getActiveListing(
    @Query('assetContractAddress') assetContractAddress: string,
    @Query('tokenId') tokenId: number,
  ) {
    return this.marketplaceService.getActiveListings(
      assetContractAddress,
      +tokenId,
    );
  }

  @Get('listings')
  getMarketplaceListings(@Query() onSaleQueryParams: OnSaleQueryParams) {
    return this.marketplaceService.getMarketplaceListings(onSaleQueryParams);
  }

  @Get('collection-status')
  getMarketplaceCollectionVolume(
    @Query() collectionStatus: CollectionStatusQueryParams,
  ) {
    return this.marketplaceService.getCollectionStatus(collectionStatus);
  }

  @Get('offer-history')
  getMarketplaceOfferHistory(
    @Query('tokenId') tokenId: number,
    @Query('floorPrice') floorPrice: number,
    @Query('page') page?: number,
  ) {
    // return this.marketplaceService.getMarketplaceOfferHistory(
    //   tokenId,
    //   page,
    //   floorPrice,
    // );
    return {
      metadata: {},
      records: [],
    };
  }

  @Get('offers/:listingId')
  getMarketplaceListingOffers(@Param('listingId') listingId: number) {
    // return this.marketplaceService.getMarketplaceListingOffers(+listingId);
    return [];
  }

  @Get('sale-history/:tokenId')
  getItemPriceHistory(
    @Param('tokenId') tokenId: number,
    @Query() sortRange: SaleHistoryQueryParams,
  ) {
    return this.marketplaceService.getPriceHistory(tokenId, sortRange);
  }

  @Get('get-lister/:listingId')
  getMarketplaceListerAddress(@Param('listingId') listingId: number) {
    return this.marketplaceService.getMarketplaceListerAddress(listingId);
  }
}
