/*
  Warnings:

  - You are about to drop the column `offerId` on the `MarketplaceSale` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "MarketplaceSale" DROP CONSTRAINT "MarketplaceSale_offerId_fkey";

-- DropIndex
DROP INDEX "MarketplaceSale_offerId_key";

-- AlterTable
ALTER TABLE "MarketplaceSale" DROP COLUMN "offerId";
