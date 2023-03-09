/*
  Warnings:

  - Added the required column `payer` to the `RoyaltyPaid` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RoyaltyPaid" ADD COLUMN     "payer" CITEXT NOT NULL;
