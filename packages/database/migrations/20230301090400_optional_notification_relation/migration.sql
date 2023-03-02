-- AlterTable
ALTER TABLE "NotificationDetailOffer" ALTER COLUMN "lister_wallet_address" DROP NOT NULL,
ALTER COLUMN "offeror_wallet_address" DROP NOT NULL;

-- AlterTable
ALTER TABLE "NotificationDetailSale" ALTER COLUMN "lister_wallet_address" DROP NOT NULL,
ALTER COLUMN "buyer_wallet_address" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "NotificationDetailSale" ADD CONSTRAINT "NotificationDetailSale_lister_wallet_address_fkey" FOREIGN KEY ("lister_wallet_address") REFERENCES "User"("wallet_address") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailSale" ADD CONSTRAINT "NotificationDetailSale_buyer_wallet_address_fkey" FOREIGN KEY ("buyer_wallet_address") REFERENCES "User"("wallet_address") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailOffer" ADD CONSTRAINT "NotificationDetailOffer_lister_wallet_address_fkey" FOREIGN KEY ("lister_wallet_address") REFERENCES "User"("wallet_address") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDetailOffer" ADD CONSTRAINT "NotificationDetailOffer_offeror_wallet_address_fkey" FOREIGN KEY ("offeror_wallet_address") REFERENCES "User"("wallet_address") ON DELETE SET NULL ON UPDATE CASCADE;
