/*
  Warnings:

  - You are about to alter the column `listingId` on the `NotificationDetailBid` table. The data in that column could be lost. The data in that column will be cast from `Decimal(78,0)` to `Integer`.

*/
-- AlterTable
ALTER TABLE "NotificationDetailBid" ALTER COLUMN "listingId" SET DATA TYPE INTEGER;
