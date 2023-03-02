/*
  Warnings:

  - Added the required column `status` to the `MarketplaceListing` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('UNSET', 'CREATED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "MarketplaceListing" ADD COLUMN     "status" "ListingStatus" NOT NULL;
