import { ListingType } from '@prisma/client';

export function parseListingType(listingTypeNumber: number) {
  if (listingTypeNumber == 0) {
    return ListingType.Direct;
  }
  if (listingTypeNumber == 1) {
    return ListingType.Auction;
  }
}
