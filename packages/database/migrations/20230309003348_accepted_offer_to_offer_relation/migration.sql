-- AddForeignKey
ALTER TABLE "AcceptedOffer" ADD CONSTRAINT "AcceptedOffer_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "MarketplaceOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
