-- CreateTable
CREATE TABLE "Bid" (
    "listingId" DECIMAL(78,0) NOT NULL,
    "bidder" CITEXT NOT NULL,
    "quantityWanted" DECIMAL(78,0) NOT NULL,
    "currency" CITEXT NOT NULL,
    "pricePerToken" DECIMAL(78,0) NOT NULL,
    "totalPrice" DECIMAL(78,0) NOT NULL,
    "transactionHash" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Bid_listingId_key" ON "Bid"("listingId");
