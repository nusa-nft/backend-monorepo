/*
  Warnings:

  - You are about to alter the column `supply` on the `Item` table. The data in that column could be lost. The data in that column will be cast from `Decimal(78,0)` to `Integer`.

*/
-- AlterTable
ALTER TABLE "Item" ALTER COLUMN "supply" SET DATA TYPE INTEGER;
