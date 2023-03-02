/*
  Warnings:

  - Made the column `expiration_timestamp` on table `NotificationDetailOffer` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "NotificationDetailOffer" ALTER COLUMN "expiration_timestamp" SET NOT NULL,
ALTER COLUMN "expiration_timestamp" SET DATA TYPE DECIMAL(78,0);
