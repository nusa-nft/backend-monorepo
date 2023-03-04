/*
  Warnings:

  - A unique constraint covering the columns `[offerId]` on the table `MarketplaceSale` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "MarketplaceSale_listingId_key";

-- AlterTable
ALTER TABLE "MarketplaceSale" ADD COLUMN     "offerId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceSale_offerId_key" ON "MarketplaceSale"("offerId");

-- AddForeignKey
ALTER TABLE "MarketplaceSale" ADD CONSTRAINT "MarketplaceSale_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "MarketplaceOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
