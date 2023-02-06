import {
  Attributes,
  Collection,
  Item,
  ItemViews,
  ListingType,
  TokenType,
  User,
} from '@prisma/client';

export interface ItemOwnership {
  address: string; // 0xabcabcbacbadcbabacbacbacbacbab
  quantity: number; // 5
  is_minted: false;
}

export interface OnChainListing {
  id: number;
  listingId: number | null;
  lister: string | null;
  tokenOwner: string | null;
  assetContract: string | null;
  tokenId: number | null;
  startTime: number | null;
  endTime: number | null;
  quantity: number | null;
  currency: string | null;
  reservePricePerToken: string | null;
  buyoutPricePerToken: string | null;
  tokenType: TokenType;
  listingType: ListingType;
  createdAt: number | null;
  updatedAt: number | null;
  isCancelled: boolean;
  isClosedByLister: boolean | null;
  isClosedByBidder: boolean | null;
}

export interface Listing {
  id: number;
  listingId?: number; // For querying onchain listing data
  isLazyMint: boolean;
  itemId?: number;
  tokenId?: number;
  assetContract: string;
  startTime: number;
  endTime: number;
  quantity: number;
  currency: string; // token address
  reservePricePerToken: string;
  buyoutPricePerToken: string;
  tokenType: TokenType;
  listingType: ListingType;
  isCancelled: boolean;
  lister: {
    wallet_address: string;
    username?: string;
    profile_picture?: string;
  };
  offers?: any[];
  highestOffer?: any;
  isClosedByLister?: boolean;
  isClosedByBidder?: boolean;
}

export interface ItemOwner {
  wallet_address: string;
  username: string;
  profile_picture: string;
  quantity: number;
}

export interface ItemDetail extends Item {
  Creator: User;
  Collection: Collection;
  attributes: Attributes[];
  ItemViews: (ItemViews & {
    User: User;
  })[];
  owners: ItemOwner[];
  isLiked: boolean;
  relatedItems: Partial<ItemDetail>[];
  listings: Listing[];
  creatorEarnings: number;
}

export interface ItemListResponse {
  status: number;
  message: string;
  metadata: {
    page: number;
    perPage: number;
    pageCount: number;
    totalCount: number;
  };
  records: ItemDetail[];
}
