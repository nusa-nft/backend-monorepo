-- DropForeignKey
ALTER TABLE "NotificationDetailOffer" DROP CONSTRAINT "NotificationDetailOffer_notification_id_fkey";

-- DropForeignKey
ALTER TABLE "NotificationDetailSale" DROP CONSTRAINT "NotificationDetailSale_notification_id_fkey";

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "wallet_address" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "sale" FOREIGN KEY ("id") REFERENCES "NotificationDetailSale"("notification_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "offer" FOREIGN KEY ("id") REFERENCES "NotificationDetailOffer"("notification_id") ON DELETE RESTRICT ON UPDATE CASCADE;
