/*
  Warnings:

  - The primary key for the `TokenOwnerships` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the `Erc1155TransferHistory` table. If the table is not empty, all the data it contains will be lost.

*/
CREATE EXTENSION IF NOT EXISTS citext;

-- DropForeignKey
ALTER TABLE "Collection" DROP CONSTRAINT "Collection_creator_address_fkey";

-- DropForeignKey
ALTER TABLE "Item" DROP CONSTRAINT "Item_creator_address_fkey";

-- DropForeignKey
ALTER TABLE "MarketplaceListing" DROP CONSTRAINT "MarketplaceListing_tokenId_assetContract_chainId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_wallet_address_fkey";

-- DropForeignKey
ALTER TABLE "NotificationDetailOffer" DROP CONSTRAINT "NotificationDetailOffer_lister_wallet_address_fkey";

-- DropForeignKey
ALTER TABLE "NotificationDetailOffer" DROP CONSTRAINT "NotificationDetailOffer_offeror_wallet_address_fkey";

-- DropForeignKey
ALTER TABLE "NotificationDetailSale" DROP CONSTRAINT "NotificationDetailSale_buyer_wallet_address_fkey";

-- DropForeignKey
ALTER TABLE "NotificationDetailSale" DROP CONSTRAINT "NotificationDetailSale_lister_wallet_address_fkey";

-- DropForeignKey
ALTER TABLE "Royalty" DROP CONSTRAINT "Royalty_wallet_address_fkey";

-- AlterTable
ALTER TABLE "Collection" ALTER COLUMN "contract_address" SET DATA TYPE CITEXT,
ALTER COLUMN "payment_token" SET DATA TYPE CITEXT,
ALTER COLUMN "creator_address" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "ImportedContracts" ALTER COLUMN "contractAddress" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "Item" ALTER COLUMN "creator_address" SET DATA TYPE CITEXT,
ALTER COLUMN "contract_address" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "LazyMintListing" ALTER COLUMN "assetContract" SET DATA TYPE CITEXT,
ALTER COLUMN "currency" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "MarketplaceListing" ALTER COLUMN "lister" SET DATA TYPE CITEXT,
ALTER COLUMN "tokenOwner" SET DATA TYPE CITEXT,
ALTER COLUMN "assetContract" SET DATA TYPE CITEXT,
ALTER COLUMN "currency" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "MarketplaceOffer" ALTER COLUMN "offeror" SET DATA TYPE CITEXT,
ALTER COLUMN "currency" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "MarketplaceSale" ALTER COLUMN "assetContract" SET DATA TYPE CITEXT,
ALTER COLUMN "lister" SET DATA TYPE CITEXT,
ALTER COLUMN "buyer" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "wallet_address" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "NotificationDetailOffer" ALTER COLUMN "lister_wallet_address" SET DATA TYPE CITEXT,
ALTER COLUMN "offeror_wallet_address" SET DATA TYPE CITEXT,
ALTER COLUMN "currency" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "NotificationDetailSale" ALTER COLUMN "asset_contract" SET DATA TYPE CITEXT,
ALTER COLUMN "lister_wallet_address" SET DATA TYPE CITEXT,
ALTER COLUMN "buyer_wallet_address" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "Royalty" ALTER COLUMN "wallet_address" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "RoyaltyPaid" ALTER COLUMN "recipient" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "TokenOwnerships" DROP CONSTRAINT "TokenOwnerships_pkey",
ALTER COLUMN "contractAddress" SET DATA TYPE CITEXT,
ALTER COLUMN "ownerAddress" SET DATA TYPE CITEXT,
ADD CONSTRAINT "TokenOwnerships_pkey" PRIMARY KEY ("contractAddress", "chainId", "tokenId", "ownerAddress");

-- AlterTable
ALTER TABLE "TokenTransferHistory" ALTER COLUMN "operator" SET DATA TYPE CITEXT,
ALTER COLUMN "from" SET DATA TYPE CITEXT,
ALTER COLUMN "to" SET DATA TYPE CITEXT,
ALTER COLUMN "contractAddress" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "User" DROP CONSTRAINT "User_pkey",
ALTER COLUMN "wallet_address" SET DATA TYPE CITEXT,
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id", "wallet_address");

-- DropTable
DROP TABLE "Erc1155TransferHistory";

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_creator_address_fkey" FOREIGN KEY ("creator_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_creator_address_fkey" FOREIGN KEY ("creator_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Royalty" ADD CONSTRAINT "Royalty_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailSale" ADD CONSTRAINT "NotificationDetailSale_lister_wallet_address_fkey" FOREIGN KEY ("lister_wallet_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailSale" ADD CONSTRAINT "NotificationDetailSale_buyer_wallet_address_fkey" FOREIGN KEY ("buyer_wallet_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailOffer" ADD CONSTRAINT "NotificationDetailOffer_lister_wallet_address_fkey" FOREIGN KEY ("lister_wallet_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailOffer" ADD CONSTRAINT "NotificationDetailOffer_offeror_wallet_address_fkey" FOREIGN KEY ("offeror_wallet_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_tokenId_assetContract_chainId_fkey" FOREIGN KEY ("tokenId", "assetContract", "chainId") REFERENCES "Item"("tokenId", "contract_address", "chainId") ON DELETE RESTRICT ON UPDATE CASCADE;
