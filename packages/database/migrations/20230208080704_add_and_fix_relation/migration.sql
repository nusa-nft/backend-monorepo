/*
  Warnings:

  - You are about to drop the column `notification_id` on the `NotificationDetailOffer` table. All the data in the column will be lost.
  - You are about to drop the column `notification_id` on the `NotificationDetailSale` table. All the data in the column will be lost.
  - Added the required column `notification_detail_offer_id` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `notification_detail_sale_id` to the `Notification` table without a default value. This is not possible if the table is not empty.

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
ALTER TABLE "Notification" ADD COLUMN     "notification_detail_offer_id" INTEGER NOT NULL,
ADD COLUMN     "notification_detail_sale_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "NotificationDetailOffer" DROP COLUMN "notification_id";

-- AlterTable
ALTER TABLE "NotificationDetailSale" DROP COLUMN "notification_id";

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_notification_detail_sale_id_fkey" FOREIGN KEY ("notification_detail_sale_id") REFERENCES "NotificationDetailSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_notification_detail_offer_id_fkey" FOREIGN KEY ("notification_detail_offer_id") REFERENCES "NotificationDetailOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
