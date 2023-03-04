-- DropForeignKey
ALTER TABLE "RoyaltyPaid" DROP CONSTRAINT "RoyaltyPaid_listingId_fkey";

-- DropForeignKey
ALTER TABLE "RoyaltyPaid" DROP CONSTRAINT "RoyaltyPaid_offerId_fkey";

-- AlterTable
ALTER TABLE "RoyaltyPaid" ALTER COLUMN "listingId" DROP NOT NULL,
ALTER COLUMN "offerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "RoyaltyPaid" ADD CONSTRAINT "RoyaltyPaid_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("listingId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyPaid" ADD CONSTRAINT "RoyaltyPaid_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "MarketplaceOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
