/*
  Warnings:

  - Added the required column `royaltyInfoId` to the `MarketplaceListing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `offerId` to the `RoyaltyPaid` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MarketplaceListing" ADD COLUMN     "royaltyInfoId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "RoyaltyPaid" ADD COLUMN     "offerId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "RoyaltyPaid" ADD CONSTRAINT "RoyaltyPaid_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "MarketplaceOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
