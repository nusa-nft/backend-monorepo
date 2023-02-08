/*
  Warnings:

  - You are about to drop the column `notification_detail_offer_id` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `notification_detail_sale_id` on the `Notification` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[notification_id]` on the table `NotificationDetailOffer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[notification_id]` on the table `NotificationDetailSale` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_notification_detail_offer_id_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_notification_detail_sale_id_fkey";

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "notification_detail_offer_id",
DROP COLUMN "notification_detail_sale_id";

-- AlterTable
ALTER TABLE "NotificationDetailOffer" ADD COLUMN     "notification_id" INTEGER;

-- AlterTable
ALTER TABLE "NotificationDetailSale" ADD COLUMN     "notification_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDetailOffer_notification_id_key" ON "NotificationDetailOffer"("notification_id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDetailSale_notification_id_key" ON "NotificationDetailSale"("notification_id");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "sale" FOREIGN KEY ("id") REFERENCES "NotificationDetailSale"("notification_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "offer" FOREIGN KEY ("id") REFERENCES "NotificationDetailOffer"("notification_id") ON DELETE RESTRICT ON UPDATE CASCADE;
