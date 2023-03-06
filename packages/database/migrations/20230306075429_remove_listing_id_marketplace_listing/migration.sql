/*
  Warnings:

  - You are about to drop the column `listingId` on the `MarketplaceListing` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Bid" DROP CONSTRAINT "Bid_listingId_fkey";

-- DropForeignKey
ALTER TABLE "MarketplaceSale" DROP CONSTRAINT "MarketplaceSale_listingId_fkey";

-- DropForeignKey
ALTER TABLE "RoyaltyPaid" DROP CONSTRAINT "RoyaltyPaid_listingId_fkey";

-- DropIndex
DROP INDEX "MarketplaceListing_listingId_key";

-- AlterTable
ALTER TABLE "MarketplaceListing" DROP COLUMN "listingId",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE DECIMAL(78,0);
DROP SEQUENCE "MarketplaceListing_id_seq";

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceSale" ADD CONSTRAINT "MarketplaceSale_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyPaid" ADD CONSTRAINT "RoyaltyPaid_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
