/*
  Warnings:

  - Made the column `listingId` on table `MarketplaceListing` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "MarketplaceSale" DROP CONSTRAINT "MarketplaceSale_listingId_fkey";

-- DropForeignKey
ALTER TABLE "RoyaltyPaid" DROP CONSTRAINT "RoyaltyPaid_listingId_fkey";

-- AlterTable
ALTER TABLE "MarketplaceListing" ALTER COLUMN "listingId" SET NOT NULL,
ALTER COLUMN "listingId" SET DATA TYPE DECIMAL(78,0);

-- AlterTable
ALTER TABLE "MarketplaceSale" ALTER COLUMN "listingId" SET DATA TYPE DECIMAL(78,0);

-- AlterTable
ALTER TABLE "RoyaltyPaid" ALTER COLUMN "listingId" SET DATA TYPE DECIMAL(78,0);

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("listingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceSale" ADD CONSTRAINT "MarketplaceSale_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("listingId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyPaid" ADD CONSTRAINT "RoyaltyPaid_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("listingId") ON DELETE SET NULL ON UPDATE CASCADE;
