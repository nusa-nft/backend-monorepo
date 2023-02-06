import { BigNumber } from "ethers";

export interface MarketplaceNewOffer {
  listingId: BigNumber,
  offeror: string,
  listingType: number,
  quantityWanted: BigNumber,
  totalOfferAmount: BigNumber,
  currency: string,
  createdAt: number,
  expirationTimestamp: BigNumber,
  transactionHash: string,
}

export interface MarkeplaceListing {
  listingId: BigNumber,
  tokenOwner: string,
  assetContract: string,
  tokenId: BigNumber,
  startTime: BigNumber,
  endTime: BigNumber,
  quantity: BigNumber,
  currency: string,
  reservePricePerToken: BigNumber,
  buyoutPricePerToken: BigNumber,
  updatedAt: number,
  isClosedByLister?: boolean,
  isClosedByBidder?: boolean,
}

export interface MarketplaceSale {
  listingId: BigNumber,
  assetContract: string,
  lister: string,
  buyer: string,
  quantityBought: number,
  totalPricePaid: BigNumber,
  createdAt: number,
  transactionHash: string,
}
