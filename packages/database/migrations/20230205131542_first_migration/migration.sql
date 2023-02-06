-- CreateEnum
CREATE TYPE "Display" AS ENUM ('PADDED', 'CONTAINED', 'COVERED');

-- CreateEnum
CREATE TYPE "AttributeType" AS ENUM ('PROPERTIES', 'LEVELS', 'STATS');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('ERC1155', 'ERC721');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('Direct', 'Auction');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('Sale', 'Offer');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "wallet_address" TEXT NOT NULL,
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
    "contract_address" TEXT,
    "website_link" TEXT,
    "discord_link" TEXT,
    "telegram_link" TEXT,
    "medium_link" TEXT,
    "display_theme" "Display" NOT NULL DEFAULT 'COVERED',
    "chainId" INTEGER NOT NULL DEFAULT 0,
    "payment_token" TEXT,
    "creator_address" TEXT NOT NULL,
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
    "tokenId" INTEGER DEFAULT -1,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "external_link" TEXT,
    "image" TEXT,
    "collection_id" INTEGER NOT NULL,
    "creator_address" TEXT NOT NULL,
    "contract_address" TEXT,
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
    "wallet_address" TEXT NOT NULL,
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
    "assetContract" TEXT NOT NULL,
    "startTime" INTEGER NOT NULL,
    "endTime" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
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
    "tokenId" INTEGER,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NotificationDetailSale" (
    "id" SERIAL NOT NULL,
    "notification_type" "NotificationType" NOT NULL DEFAULT 'Sale',
    "listingId" INTEGER,
    "asset_contract" TEXT NOT NULL,
    "lister_wallet_address" TEXT NOT NULL,
    "buyer_wallet_address" TEXT NOT NULL,
    "quantity_bought" INTEGER,
    "total_price_paid" DECIMAL(78,0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt_timestamp" INTEGER,
    "transaction_hash" TEXT NOT NULL,
    "notification_id" INTEGER
);

-- CreateTable
CREATE TABLE "NotificationDetailOffer" (
    "id" SERIAL NOT NULL,
    "notification_type" "NotificationType" NOT NULL DEFAULT 'Offer',
    "listingId" INTEGER,
    "lister_wallet_address" TEXT NOT NULL,
    "offeror_wallet_address" TEXT NOT NULL,
    "listing_type" "ListingType" NOT NULL,
    "quantity_wanted" INTEGER,
    "total_offer_ammount" DECIMAL(78,0) NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt_timestamp" INTEGER,
    "expiration_timestamp" INTEGER,
    "transaction_hash" TEXT NOT NULL,
    "notification_id" INTEGER
);

-- CreateTable
CREATE TABLE "Erc1155TransferHistory" (
    "id" SERIAL NOT NULL,
    "block" INTEGER,
    "operator" TEXT,
    "from" TEXT,
    "to" TEXT,
    "tokenId" INTEGER,
    "value" INTEGER,
    "createdAt" INTEGER,
    "transactionHash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "TokenTransferHistory" (
    "id" SERIAL NOT NULL,
    "block" INTEGER,
    "operator" TEXT,
    "from" TEXT,
    "to" TEXT,
    "contractAddress" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL DEFAULT 0,
    "tokenId" INTEGER,
    "value" INTEGER,
    "createdAt" INTEGER,
    "transactionHash" TEXT NOT NULL,
    "isBatch" BOOLEAN NOT NULL DEFAULT false,
    "txIndex" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "TokenOwnerships" (
    "contractAddress" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL DEFAULT 0,
    "tokenId" INTEGER NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "timestamp" INTEGER NOT NULL,

    CONSTRAINT "TokenOwnerships_pkey" PRIMARY KEY ("contractAddress","chainId","tokenId","ownerAddress")
);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER,
    "lister" TEXT,
    "tokenOwner" TEXT,
    "assetContract" TEXT,
    "tokenId" INTEGER,
    "startTime" INTEGER,
    "endTime" INTEGER,
    "quantity" INTEGER,
    "currency" TEXT,
    "chainId" INTEGER NOT NULL DEFAULT 0,
    "reservePricePerToken" DECIMAL(78,0) NOT NULL,
    "buyoutPricePerToken" DECIMAL(78,0) NOT NULL,
    "tokenType" "TokenType" NOT NULL,
    "listingType" "ListingType" NOT NULL,
    "createdAt" INTEGER,
    "updatedAt" INTEGER,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "isClosedByLister" BOOLEAN,
    "isClosedByBidder" BOOLEAN
);

-- CreateTable
CREATE TABLE "MarketplaceOffer" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER,
    "offeror" TEXT NOT NULL,
    "listingType" "ListingType" NOT NULL,
    "quantityWanted" INTEGER,
    "totalOfferAmount" DECIMAL(78,0) NOT NULL,
    "createdAt" INTEGER,
    "currency" TEXT,
    "expirationTimestamp" INTEGER NOT NULL,
    "transactionHash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "MarketplaceSale" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER,
    "assetContract" TEXT,
    "lister" TEXT,
    "buyer" TEXT,
    "quantityBought" INTEGER,
    "totalPricePaid" DECIMAL(78,0),
    "createdAt" INTEGER,
    "transactionHash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "RoyaltyPaid" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER NOT NULL,
    "recipient" TEXT NOT NULL,
    "bps" INTEGER NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "createdAt" INTEGER NOT NULL,
    "transactionHash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "IndexerState" (
    "lastBlockProcessed" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "expTime" INTEGER NOT NULL,
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
    "contractAddress" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "tokenType" "TokenType" NOT NULL,
    "deployedAtBlock" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL
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
CREATE UNIQUE INDEX "NotificationDetailSale_notification_id_key" ON "NotificationDetailSale"("notification_id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDetailSale_id_notification_type_key" ON "NotificationDetailSale"("id", "notification_type");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDetailOffer_id_key" ON "NotificationDetailOffer"("id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDetailOffer_notification_id_key" ON "NotificationDetailOffer"("notification_id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDetailOffer_id_notification_type_key" ON "NotificationDetailOffer"("id", "notification_type");

-- CreateIndex
CREATE UNIQUE INDEX "Erc1155TransferHistory_id_key" ON "Erc1155TransferHistory"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Erc1155TransferHistory_transactionHash_key" ON "Erc1155TransferHistory"("transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "TokenTransferHistory_id_key" ON "TokenTransferHistory"("id");

-- CreateIndex
CREATE UNIQUE INDEX "TokenTransferHistory_transactionHash_chainId_txIndex_key" ON "TokenTransferHistory"("transactionHash", "chainId", "txIndex");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_id_key" ON "MarketplaceListing"("id");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_listingId_key" ON "MarketplaceListing"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceOffer_id_key" ON "MarketplaceOffer"("id");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceOffer_transactionHash_key" ON "MarketplaceOffer"("transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceSale_id_key" ON "MarketplaceSale"("id");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceSale_listingId_key" ON "MarketplaceSale"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceSale_transactionHash_key" ON "MarketplaceSale"("transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "RoyaltyPaid_id_key" ON "RoyaltyPaid"("id");

-- CreateIndex
CREATE UNIQUE INDEX "IndexerState_lastBlockProcessed_key" ON "IndexerState"("lastBlockProcessed");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_id_key" ON "Voucher"("id");

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
ALTER TABLE "NotificationDetailSale" ADD CONSTRAINT "NotificationDetailSale_lister_wallet_address_fkey" FOREIGN KEY ("lister_wallet_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailSale" ADD CONSTRAINT "NotificationDetailSale_buyer_wallet_address_fkey" FOREIGN KEY ("buyer_wallet_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailSale" ADD CONSTRAINT "NotificationDetailSale_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailOffer" ADD CONSTRAINT "NotificationDetailOffer_lister_wallet_address_fkey" FOREIGN KEY ("lister_wallet_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailOffer" ADD CONSTRAINT "NotificationDetailOffer_offeror_wallet_address_fkey" FOREIGN KEY ("offeror_wallet_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailOffer" ADD CONSTRAINT "NotificationDetailOffer_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_tokenId_assetContract_chainId_fkey" FOREIGN KEY ("tokenId", "assetContract", "chainId") REFERENCES "Item"("tokenId", "contract_address", "chainId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOffer" ADD CONSTRAINT "MarketplaceOffer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("listingId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceSale" ADD CONSTRAINT "MarketplaceSale_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("listingId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyPaid" ADD CONSTRAINT "RoyaltyPaid_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("listingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuratedCollection" ADD CONSTRAINT "CuratedCollection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
