/*
  Warnings:

  - Made the column `listingId` on table `NotificationDetailOffer` required. This step will fail if there are existing NULL values in that column.
  - Made the column `listingId` on table `NotificationDetailSale` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "NotificationDetailBid" ALTER COLUMN "notification_type" SET DEFAULT 'Bid',
ALTER COLUMN "listingId" SET DATA TYPE DECIMAL(78,0);

-- AlterTable
ALTER TABLE "NotificationDetailOffer" ALTER COLUMN "listingId" SET NOT NULL,
ALTER COLUMN "listingId" SET DATA TYPE DECIMAL(78,0);

-- AlterTable
ALTER TABLE "NotificationDetailSale" ALTER COLUMN "listingId" SET NOT NULL,
ALTER COLUMN "listingId" SET DATA TYPE DECIMAL(78,0);
