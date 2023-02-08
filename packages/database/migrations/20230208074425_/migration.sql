-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "wallet_address" TEXT NOT NULL DEFAULT 'null';

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "User"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;
