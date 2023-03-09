/*
  Warnings:

  - A unique constraint covering the columns `[offerId]` on the table `RoyaltyPaid` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "MarketplaceSale" DROP CONSTRAINT "MarketplaceSale_offerId_fkey";

-- DropForeignKey
ALTER TABLE "RoyaltyPaid" DROP CONSTRAINT "RoyaltyPaid_offerId_fkey";

-- AlterTable
ALTER TABLE "MarketplaceOffer" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE DECIMAL(78,0);
DROP SEQUENCE "MarketplaceOffer_id_seq";

-- AlterTable
ALTER TABLE "MarketplaceSale" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE DECIMAL(78,0),
ALTER COLUMN "offerId" SET DATA TYPE DECIMAL(78,0);
DROP SEQUENCE "MarketplaceSale_id_seq";

-- AlterTable
ALTER TABLE "RoyaltyPaid" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE DECIMAL(78,0),
ALTER COLUMN "offerId" SET DATA TYPE DECIMAL(78,0);
DROP SEQUENCE "RoyaltyPaid_id_seq";

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

-- CreateIndex
CREATE UNIQUE INDEX "AcceptedOffer_offerId_key" ON "AcceptedOffer"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "RoyaltyPaid_offerId_key" ON "RoyaltyPaid"("offerId");

-- AddForeignKey
ALTER TABLE "MarketplaceSale" ADD CONSTRAINT "MarketplaceSale_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "MarketplaceOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyPaid" ADD CONSTRAINT "RoyaltyPaid_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "MarketplaceOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
