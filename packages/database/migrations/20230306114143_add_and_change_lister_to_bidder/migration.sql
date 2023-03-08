/*
  Warnings:

  - You are about to drop the column `lister_wallet_address` on the `NotificationDetailOffer` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "NotificationDetailOffer" DROP CONSTRAINT "NotificationDetailOffer_lister_wallet_address_fkey";

-- AlterTable
ALTER TABLE "NotificationDetailOffer" DROP COLUMN "lister_wallet_address",
ADD COLUMN     "token_owner_wallet_address" CITEXT;

-- AddForeignKey
ALTER TABLE "NotificationDetailOffer" ADD CONSTRAINT "NotificationDetailOffer_token_owner_wallet_address_fkey" FOREIGN KEY ("token_owner_wallet_address") REFERENCES "User"("wallet_address") ON DELETE SET NULL ON UPDATE CASCADE;
