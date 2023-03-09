-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "Display" AS ENUM ('PADDED', 'CONTAINED', 'COVERED');

-- CreateEnum
CREATE TYPE "AttributeType" AS ENUM ('PROPERTIES', 'LEVELS', 'STATS');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('ERC1155', 'ERC721');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('Direct', 'Auction');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('Sale', 'Offer', 'Bid');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('UNSET', 'CREATED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('UNSET', 'CREATED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IndexerStatus" AS ENUM ('SYNCING', 'SYNCED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "wallet_address" CITEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "first_name" TEXT,
    "last_name" TEXT,
    "username" TEXT,
    "email" TEXT,
    "twitter_link" TEXT,
    "instagram_link" TEXT,
    "website_link" TEXT,
    "profile_picture" TEXT,
    "description" TEXT,
    "cover_picture" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id","wallet_address")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" SERIAL NOT NULL,
    "logo_image" TEXT,
    "featured_image" TEXT,
    "banner_image" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "url" TEXT,
    "description" TEXT,
    "contract_address" CITEXT,
    "website_link" TEXT,
    "discord_link" TEXT,
    "telegram_link" TEXT,
    "medium_link" TEXT,
    "display_theme" "Display" NOT NULL DEFAULT 'COVERED',
    "chainId" INTEGER NOT NULL DEFAULT 0,
    "payment_token" CITEXT,
    "creator_address" CITEXT NOT NULL,
    "category_id" INTEGER NOT NULL,
    "explicit_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "watchCount" INTEGER DEFAULT 0,
    "isImported" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" SERIAL NOT NULL,
    "uuid" UUID,
    "tokenId" DECIMAL(78,0) DEFAULT -1,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "external_link" TEXT,
    "image" TEXT,
    "collection_id" INTEGER NOT NULL,
    "creator_address" CITEXT NOT NULL,
    "contract_address" CITEXT,
    "metadata" TEXT,
    "unlockable" BOOLEAN DEFAULT false,
    "explicit_sensitive" BOOLEAN DEFAULT false,
    "supply" INTEGER NOT NULL,
    "chainId" INTEGER NOT NULL,
    "is_metadata_freeze" BOOLEAN DEFAULT false,
    "quantity_minted" INTEGER NOT NULL DEFAULT 0,
    "token_standard" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "itemLikeCount" INTEGER DEFAULT 0,
    "itemViewCount" INTEGER DEFAULT 0
);

-- CreateTable
CREATE TABLE "Royalty" (
    "id" SERIAL NOT NULL,
    "collection_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "wallet_address" CITEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL
);

-- CreateTable
CREATE TABLE "Attributes" (
    "id" SERIAL NOT NULL,
    "trait_type" TEXT,
    "nusa_attribute_type" "AttributeType",
    "value" TEXT,
    "max_value" TEXT,
    "opensea_display_type" TEXT,
    "itemId" INTEGER
);

-- CreateTable
CREATE TABLE "ItemLikes" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER,
    "userId" INTEGER
);

-- CreateTable
CREATE TABLE "ItemViews" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "userId" INTEGER,
    "ip" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "WatchList" (
    "id" SERIAL NOT NULL,
    "collectionId" INTEGER,
    "userId" INTEGER
);

-- CreateTable
CREATE TABLE "LazyMintListing" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "assetContract" CITEXT NOT NULL,
    "startTime" INTEGER NOT NULL,
    "endTime" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "currency" CITEXT NOT NULL,
    "reservePricePerToken" DECIMAL(78,0) NOT NULL,
    "buyoutPricePerToken" DECIMAL(78,0) NOT NULL,
    "tokenType" "TokenType" NOT NULL,
    "listingType" "ListingType" NOT NULL,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "isFulfilled" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "LazyMintSale" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "lazyMintListingId" INTEGER NOT NULL,
    "tokenId" DECIMAL(78,0) NOT NULL,
    "tokenType" "TokenType" NOT NULL,
    "listingType" "ListingType" NOT NULL,
    "quantityBought" INTEGER,
    "totalPricePaid" DECIMAL(78,0) NOT NULL,
    "createdAt" INTEGER
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "notification_type" "NotificationType" NOT NULL,
    "is_seen" BOOLEAN NOT NULL DEFAULT false,
    "wallet_address" CITEXT NOT NULL,
    "notification_detail_sale_id" INTEGER,
    "notification_detail_offer_id" INTEGER,
    "notification_detail_bid_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NotificationDetailSale" (
    "id" SERIAL NOT NULL,
    "notification_type" "NotificationType" NOT NULL DEFAULT 'Sale',
    "listingId" DECIMAL(78,0),
    "asset_contract" CITEXT NOT NULL,
    "lister_wallet_address" CITEXT,
    "buyer_wallet_address" CITEXT,
    "quantity_bought" DECIMAL(78,0),
    "total_price_paid" DECIMAL(78,0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt_timestamp" INTEGER,
    "transaction_hash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "NotificationDetailOffer" (
    "id" SERIAL NOT NULL,
    "notification_type" "NotificationType" NOT NULL DEFAULT 'Offer',
    "token_owner_wallet_address" CITEXT,
    "offeror_wallet_address" CITEXT,
    "tokenId" INTEGER,
    "listing_type" "ListingType" NOT NULL,
    "quantity_wanted" DECIMAL(78,0),
    "total_offer_ammount" DECIMAL(78,0) NOT NULL,
    "currency" CITEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt_timestamp" INTEGER,
    "expiration_timestamp" DECIMAL(78,0) NOT NULL,
    "transaction_hash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "NotificationDetailBid" (
    "id" SERIAL NOT NULL,
    "notification_type" "NotificationType" NOT NULL DEFAULT 'Bid',
    "listingId" DECIMAL(78,0),
    "lister_wallet_address" CITEXT,
    "bidder_wallet_address" CITEXT,
    "listing_type" "ListingType" NOT NULL,
    "quantity_wanted" DECIMAL(78,0),
    "total_offer_ammount" DECIMAL(78,0) NOT NULL,
    "currency" CITEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt_timestamp" INTEGER,
    "transaction_hash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "TokenTransferHistory" (
    "id" SERIAL NOT NULL,
    "block" INTEGER,
    "operator" CITEXT,
    "from" CITEXT,
    "to" CITEXT,
    "contractAddress" CITEXT NOT NULL,
    "chainId" INTEGER NOT NULL DEFAULT 0,
    "tokenId" DECIMAL(78,0) NOT NULL,
    "value" INTEGER,
    "createdAt" INTEGER,
    "transactionHash" TEXT NOT NULL,
    "isBatch" BOOLEAN NOT NULL DEFAULT false,
    "txIndex" INTEGER NOT NULL DEFAULT 0,
    "logIndex" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "TokenOwnerships" (
    "contractAddress" CITEXT NOT NULL,
    "chainId" INTEGER NOT NULL DEFAULT 0,
    "tokenId" DECIMAL(78,0) NOT NULL,
    "ownerAddress" CITEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "transactionHash" TEXT NOT NULL,

    CONSTRAINT "TokenOwnerships_pkey" PRIMARY KEY ("contractAddress","chainId","tokenId","ownerAddress")
);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" DECIMAL(78,0) NOT NULL,
    "lister" CITEXT,
    "tokenOwner" CITEXT,
    "assetContract" CITEXT,
    "tokenId" DECIMAL(78,0) NOT NULL,
    "startTime" INTEGER,
    "endTime" INTEGER,
    "quantity" INTEGER,
    "currency" CITEXT,
    "chainId" INTEGER NOT NULL DEFAULT 0,
    "reservePricePerToken" DECIMAL(78,0) NOT NULL,
    "buyoutPricePerToken" DECIMAL(78,0) NOT NULL,
    "tokenType" "TokenType" NOT NULL,
    "listingType" "ListingType" NOT NULL,
    "createdAt" INTEGER,
    "updatedAt" INTEGER,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "isClosedByLister" BOOLEAN,
    "isClosedByBidder" BOOLEAN,
    "royaltyInfoId" INTEGER NOT NULL,
    "status" "ListingStatus" NOT NULL
);

-- CreateTable
CREATE TABLE "MarketplaceOffer" (
    "id" DECIMAL(78,0) NOT NULL,
    "offeror" CITEXT NOT NULL,
    "assetContract" CITEXT NOT NULL,
    "tokenId" DECIMAL(78,0) NOT NULL,
    "quantity" DECIMAL(78,0) NOT NULL,
    "currency" CITEXT,
    "totalPrice" DECIMAL(78,0) NOT NULL,
    "expirationTimestamp" DECIMAL(78,0) NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL,
    "royaltyInfoId" INTEGER NOT NULL,
    "createdAt" INTEGER
);

-- CreateTable
CREATE TABLE "AcceptedOffer" (
    "offerId" DECIMAL(78,0) NOT NULL,
    "offeror" CITEXT NOT NULL,
    "assetContract" CITEXT NOT NULL,
    "tokenId" DECIMAL(78,0) NOT NULL,
    "seller" CITEXT NOT NULL,
    "quantityBought" DECIMAL(78,0) NOT NULL,
    "totalPricePaid" DECIMAL(78,0) NOT NULL
);

-- CreateTable
CREATE TABLE "Bid" (
    "listingId" DECIMAL(78,0) NOT NULL,
    "bidder" CITEXT NOT NULL,
    "quantityWanted" DECIMAL(78,0) NOT NULL,
    "currency" CITEXT NOT NULL,
    "pricePerToken" DECIMAL(78,0) NOT NULL,
    "totalPrice" DECIMAL(78,0) NOT NULL,
    "transactionHash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "MarketplaceSale" (
    "listingId" DECIMAL(78,0),
    "assetContract" CITEXT,
    "lister" CITEXT,
    "buyer" CITEXT,
    "quantityBought" INTEGER,
    "totalPricePaid" DECIMAL(78,0),
    "createdAt" INTEGER,
    "transactionHash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "RoyaltyPaid" (
    "id" DECIMAL(78,0) NOT NULL,
    "listingId" DECIMAL(78,0),
    "offerId" DECIMAL(78,0),
    "payer" CITEXT NOT NULL,
    "recipient" CITEXT NOT NULL,
    "bps" INTEGER NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "currency" CITEXT NOT NULL,
    "createdAt" INTEGER NOT NULL,
    "transactionHash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "IndexerState" (
    "lastBlockProcessed" INTEGER NOT NULL,
    "status" "IndexerStatus" NOT NULL
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" SERIAL NOT NULL,
    "tokenId" INTEGER NOT NULL DEFAULT 0,
    "itemUuid" UUID,
    "rootHash" TEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "VoucherLeaf" (
    "id" SERIAL NOT NULL,
    "hash" TEXT NOT NULL,
    "num" INTEGER NOT NULL DEFAULT 0,
    "tokenId" INTEGER NOT NULL,
    "itemUuid" UUID,
    "deleted" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "CuratedCollection" (
    "id" SERIAL NOT NULL,
    "collectionId" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "ImportedContracts" (
    "id" SERIAL NOT NULL,
    "contractAddress" CITEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "tokenType" "TokenType" NOT NULL,
    "deployedAtBlock" INTEGER NOT NULL,
    "lastIndexedBlock" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "isImportFinish" BOOLEAN NOT NULL DEFAULT false
);

-- CreateIndex
CREATE UNIQUE INDEX "User_id_key" ON "User"("id");

-- CreateIndex
CREATE UNIQUE INDEX "User_wallet_address_key" ON "User"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_key" ON "Category"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "Collection_name_idx" ON "Collection" USING HASH ("name");

-- CreateIndex
CREATE UNIQUE INDEX "Item_id_key" ON "Item"("id");

-- CreateIndex
CREATE INDEX "Item_name_idx" ON "Item" USING HASH ("name");

-- CreateIndex
CREATE UNIQUE INDEX "Item_tokenId_contract_address_chainId_key" ON "Item"("tokenId", "contract_address", "chainId");

-- CreateIndex
CREATE UNIQUE INDEX "Royalty_id_key" ON "Royalty"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Attributes_id_key" ON "Attributes"("id");

-- CreateIndex
CREATE UNIQUE INDEX "ItemLikes_id_key" ON "ItemLikes"("id");

-- CreateIndex
CREATE UNIQUE INDEX "ItemViews_id_key" ON "ItemViews"("id");

-- CreateIndex
CREATE UNIQUE INDEX "WatchList_id_key" ON "WatchList"("id");

-- CreateIndex
CREATE UNIQUE INDEX "LazyMintListing_id_key" ON "LazyMintListing"("id");

-- CreateIndex
CREATE UNIQUE INDEX "LazyMintSale_id_key" ON "LazyMintSale"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_id_key" ON "Notification"("id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDetailSale_id_key" ON "NotificationDetailSale"("id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDetailSale_id_notification_type_key" ON "NotificationDetailSale"("id", "notification_type");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDetailOffer_id_key" ON "NotificationDetailOffer"("id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDetailOffer_id_notification_type_key" ON "NotificationDetailOffer"("id", "notification_type");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDetailBid_id_key" ON "NotificationDetailBid"("id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDetailBid_id_notification_type_key" ON "NotificationDetailBid"("id", "notification_type");

-- CreateIndex
CREATE UNIQUE INDEX "TokenTransferHistory_id_key" ON "TokenTransferHistory"("id");

-- CreateIndex
CREATE UNIQUE INDEX "TokenTransferHistory_transactionHash_chainId_txIndex_logInd_key" ON "TokenTransferHistory"("transactionHash", "chainId", "txIndex", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_id_key" ON "MarketplaceListing"("id");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceOffer_id_key" ON "MarketplaceOffer"("id");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceOffer_transactionHash_key" ON "MarketplaceOffer"("transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "AcceptedOffer_offerId_key" ON "AcceptedOffer"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_listingId_bidder_transactionHash_key" ON "Bid"("listingId", "bidder", "transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceSale_transactionHash_key" ON "MarketplaceSale"("transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "RoyaltyPaid_id_key" ON "RoyaltyPaid"("id");

-- CreateIndex
CREATE UNIQUE INDEX "RoyaltyPaid_offerId_key" ON "RoyaltyPaid"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "IndexerState_lastBlockProcessed_key" ON "IndexerState"("lastBlockProcessed");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_id_key" ON "Voucher"("id");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherLeaf_id_key" ON "VoucherLeaf"("id");

-- CreateIndex
CREATE UNIQUE INDEX "CuratedCollection_id_key" ON "CuratedCollection"("id");

-- CreateIndex
CREATE UNIQUE INDEX "CuratedCollection_collectionId_key" ON "CuratedCollection"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedContracts_id_key" ON "ImportedContracts"("id");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedContracts_contractAddress_chainId_key" ON "ImportedContracts"("contractAddress", "chainId");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_creator_address_fkey" FOREIGN KEY ("creator_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "Collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_creator_address_fkey" FOREIGN KEY ("creator_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Royalty" ADD CONSTRAINT "Royalty_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "Collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Royalty" ADD CONSTRAINT "Royalty_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attributes" ADD CONSTRAINT "Attributes_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLikes" ADD CONSTRAINT "ItemLikes_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLikes" ADD CONSTRAINT "ItemLikes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemViews" ADD CONSTRAINT "ItemViews_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemViews" ADD CONSTRAINT "ItemViews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchList" ADD CONSTRAINT "WatchList_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchList" ADD CONSTRAINT "WatchList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LazyMintListing" ADD CONSTRAINT "LazyMintListing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LazyMintSale" ADD CONSTRAINT "LazyMintSale_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LazyMintSale" ADD CONSTRAINT "LazyMintSale_lazyMintListingId_fkey" FOREIGN KEY ("lazyMintListingId") REFERENCES "LazyMintListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_notification_detail_sale_id_fkey" FOREIGN KEY ("notification_detail_sale_id") REFERENCES "NotificationDetailSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_notification_detail_offer_id_fkey" FOREIGN KEY ("notification_detail_offer_id") REFERENCES "NotificationDetailOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_notification_detail_bid_id_fkey" FOREIGN KEY ("notification_detail_bid_id") REFERENCES "NotificationDetailBid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailSale" ADD CONSTRAINT "NotificationDetailSale_lister_wallet_address_fkey" FOREIGN KEY ("lister_wallet_address") REFERENCES "User"("wallet_address") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailSale" ADD CONSTRAINT "NotificationDetailSale_buyer_wallet_address_fkey" FOREIGN KEY ("buyer_wallet_address") REFERENCES "User"("wallet_address") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailOffer" ADD CONSTRAINT "NotificationDetailOffer_token_owner_wallet_address_fkey" FOREIGN KEY ("token_owner_wallet_address") REFERENCES "User"("wallet_address") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailOffer" ADD CONSTRAINT "NotificationDetailOffer_offeror_wallet_address_fkey" FOREIGN KEY ("offeror_wallet_address") REFERENCES "User"("wallet_address") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailBid" ADD CONSTRAINT "NotificationDetailBid_lister_wallet_address_fkey" FOREIGN KEY ("lister_wallet_address") REFERENCES "User"("wallet_address") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailBid" ADD CONSTRAINT "NotificationDetailBid_bidder_wallet_address_fkey" FOREIGN KEY ("bidder_wallet_address") REFERENCES "User"("wallet_address") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_tokenId_assetContract_chainId_fkey" FOREIGN KEY ("tokenId", "assetContract", "chainId") REFERENCES "Item"("tokenId", "contract_address", "chainId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcceptedOffer" ADD CONSTRAINT "AcceptedOffer_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "MarketplaceOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_bidder_fkey" FOREIGN KEY ("bidder") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceSale" ADD CONSTRAINT "MarketplaceSale_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyPaid" ADD CONSTRAINT "RoyaltyPaid_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyPaid" ADD CONSTRAINT "RoyaltyPaid_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "MarketplaceOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuratedCollection" ADD CONSTRAINT "CuratedCollection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
