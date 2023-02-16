-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "uuid" UUID;

-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN     "itemUuid" UUID;

-- AlterTable
ALTER TABLE "VoucherLeaf" ADD COLUMN     "itemUuid" UUID;
