-- DropForeignKey
ALTER TABLE "NotificationDetailOffer" DROP CONSTRAINT "NotificationDetailOffer_lister_wallet_address_fkey";

-- DropForeignKey
ALTER TABLE "NotificationDetailOffer" DROP CONSTRAINT "NotificationDetailOffer_offeror_wallet_address_fkey";

-- DropForeignKey
ALTER TABLE "NotificationDetailSale" DROP CONSTRAINT "NotificationDetailSale_buyer_wallet_address_fkey";

-- DropForeignKey
ALTER TABLE "NotificationDetailSale" DROP CONSTRAINT "NotificationDetailSale_lister_wallet_address_fkey";
