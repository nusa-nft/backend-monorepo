/*
  Warnings:

  - A unique constraint covering the columns `[listingId,bidder,transactionHash]` on the table `Bid` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Bid_listingId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Bid_listingId_bidder_transactionHash_key" ON "Bid"("listingId", "bidder", "transactionHash");
