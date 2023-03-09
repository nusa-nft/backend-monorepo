/*
  Warnings:

  - You are about to drop the column `id` on the `MarketplaceSale` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[listingId]` on the table `MarketplaceSale` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "MarketplaceSale_id_key";

-- AlterTable
ALTER TABLE "MarketplaceSale" DROP COLUMN "id";

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceSale_listingId_key" ON "MarketplaceSale"("listingId");