/*
  Warnings:

  - You are about to drop the column `notification_id` on the `NotificationDetailOffer` table. All the data in the column will be lost.
  - You are about to drop the column `notification_id` on the `NotificationDetailSale` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "offer";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "sale";

-- DropIndex
DROP INDEX "NotificationDetailOffer_notification_id_key";

-- DropIndex
DROP INDEX "NotificationDetailSale_notification_id_key";

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "offer_id" INTEGER,
ADD COLUMN     "sale_id" INTEGER;

-- AlterTable
ALTER TABLE "NotificationDetailOffer" DROP COLUMN "notification_id";

-- AlterTable
ALTER TABLE "NotificationDetailSale" DROP COLUMN "notification_id";

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "NotificationDetailSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "NotificationDetailOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
