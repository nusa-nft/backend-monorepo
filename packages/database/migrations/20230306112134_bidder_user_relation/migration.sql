-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_bidder_fkey" FOREIGN KEY ("bidder") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;
