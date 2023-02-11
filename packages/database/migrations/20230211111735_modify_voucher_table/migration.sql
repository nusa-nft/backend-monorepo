/*
  Warnings:

  - You are about to drop the column `expTime` on the `Voucher` table. All the data in the column will be lost.
  - You are about to drop the column `hash` on the `Voucher` table. All the data in the column will be lost.
  - Added the required column `rootHash` to the `Voucher` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
CREATE SEQUENCE "voucher_id_seq";
ALTER TABLE "Voucher" DROP COLUMN "expTime",
DROP COLUMN "hash",
ADD COLUMN     "rootHash" TEXT NOT NULL,
ADD COLUMN     "tokenId" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "id" SET DEFAULT nextval('voucher_id_seq');
ALTER SEQUENCE "voucher_id_seq" OWNED BY "Voucher"."id";

-- CreateTable
CREATE TABLE "VoucherLeaf" (
    "id" SERIAL NOT NULL,
    "hash" TEXT NOT NULL,
    "num" INTEGER NOT NULL DEFAULT 0,
    "tokenId" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false
);

-- CreateIndex
CREATE UNIQUE INDEX "VoucherLeaf_id_key" ON "VoucherLeaf"("id");
