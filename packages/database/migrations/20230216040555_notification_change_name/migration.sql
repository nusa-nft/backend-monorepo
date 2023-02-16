/*
  Warnings:

  - You are about to drop the column `offer_id` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `sale_id` on the `Notification` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_offer_id_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_sale_id_fkey";

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "offer_id",
DROP COLUMN "sale_id",
ADD COLUMN     "notification_detail_offer_id" INTEGER,
ADD COLUMN     "notification_detail_sale_id" INTEGER;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_notification_detail_sale_id_fkey" FOREIGN KEY ("notification_detail_sale_id") REFERENCES "NotificationDetailSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_notification_detail_offer_id_fkey" FOREIGN KEY ("notification_detail_offer_id") REFERENCES "NotificationDetailOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
