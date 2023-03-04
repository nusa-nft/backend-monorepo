/*
  Warnings:

  - Added the required column `currency` to the `RoyaltyPaid` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RoyaltyPaid" ADD COLUMN     "currency" CITEXT NOT NULL;
