-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'Bid';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "notification_detail_bid_id" INTEGER;

-- CreateTable
CREATE TABLE "NotificationDetailBid" (
    "id" SERIAL NOT NULL,
    "notification_type" "NotificationType" NOT NULL DEFAULT 'Offer',
    "listingId" INTEGER,
    "lister_wallet_address" CITEXT,
    "bidder_wallet_address" CITEXT,
    "listing_type" "ListingType" NOT NULL,
    "quantity_wanted" DECIMAL(78,0),
    "total_offer_ammount" DECIMAL(78,0) NOT NULL,
    "currency" CITEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt_timestamp" INTEGER,
    "expiration_timestamp" DECIMAL(78,0) NOT NULL,
    "transaction_hash" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDetailBid_id_key" ON "NotificationDetailBid"("id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDetailBid_id_notification_type_key" ON "NotificationDetailBid"("id", "notification_type");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_notification_detail_bid_id_fkey" FOREIGN KEY ("notification_detail_bid_id") REFERENCES "NotificationDetailBid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailBid" ADD CONSTRAINT "NotificationDetailBid_lister_wallet_address_fkey" FOREIGN KEY ("lister_wallet_address") REFERENCES "User"("wallet_address") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailBid" ADD CONSTRAINT "NotificationDetailBid_bidder_wallet_address_fkey" FOREIGN KEY ("bidder_wallet_address") REFERENCES "User"("wallet_address") ON DELETE SET NULL ON UPDATE CASCADE;
