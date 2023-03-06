/*
  Warnings:

  - Made the column `listingId` on table `NotificationDetailBid` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "NotificationDetailBid" ALTER COLUMN "listingId" SET NOT NULL,
ALTER COLUMN "listingId" SET DATA TYPE DECIMAL(78,0);
