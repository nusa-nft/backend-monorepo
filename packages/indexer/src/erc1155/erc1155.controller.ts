import { Controller, Get, Query } from '@nestjs/common';
import { CollectionActivitiesParams, OnSaleParams, PaginationParams, TokenActivitiesParams } from './erc1155.dto';
import { Erc1155Service } from './erc1155.service';

@Controller('erc1155')
export class Erc1155Controller {
  constructor(
    private erc1155Service: Erc1155Service,
  ){}

  @Get('token-owner')
  getTokenOwner(
    @Query('tokenId') tokenId: number
  ) {
    return this.erc1155Service.getTokenOwners(+tokenId);
  }

  @Get('owned-by-wallet')
  getOwnedByWallet(
    @Query('walletAddress') walletAddress: string
  ) {
    return this.erc1155Service.getOwnedByWallet(walletAddress);
  }

  @Get('activities')
  getTokenActivities(
    @Query() params: TokenActivitiesParams
  ) {
    return this.erc1155Service.getActivities(params);
  }

  @Get('on-sale')
  getOnSale(
    @Query() params: OnSaleParams
  ) {
    return this.erc1155Service.getOnSale({
      ...params,
      // @ts-ignore
      hasOffers: params.hasOffers == 'true' // ToBoolean transformer not working
    });
  }

  @Get('collection-activities')
  getCollectionActivities(
    @Query() params: CollectionActivitiesParams
  ) {
    return this.erc1155Service.getCollectionActivities(params);
  }
}
