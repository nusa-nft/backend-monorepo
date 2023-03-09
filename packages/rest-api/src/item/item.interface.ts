import {
  Attributes,
  Collection,
  Item,
  ItemViews,
  ListingStatus,
  ListingType,
  MarketplaceOffer,
  TokenType,
  User,
} from '@prisma/client';

export enum MintStatus {
  LAZY_MINT = 'LAZY_MINT',
  MINTED = 'NOT_MINTED',
}

export interface ItemOwnership {
  address: string; // 0xabcabcbacbadcbabacbacbacbacbab
  quantity: number; // 5
  is_minted: false;
}

export interface Listing {
  id?: number;
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
  username?: string;
  profile_picture?: string;
  quantity: number;
  mintStatus: MintStatus;
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
  // offers: MarketplaceOffer[];
  creatorEarnings: number;
  voucherRedeemable?: {
    supply: number;
    redeemed: number;
  };
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
