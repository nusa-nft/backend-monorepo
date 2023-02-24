/*
  Warnings:

  - You are about to drop the column `listingId` on the `MarketplaceOffer` table. All the data in the column will be lost.
  - You are about to drop the column `listingType` on the `MarketplaceOffer` table. All the data in the column will be lost.
  - You are about to drop the column `quantityWanted` on the `MarketplaceOffer` table. All the data in the column will be lost.
  - You are about to drop the column `totalOfferAmount` on the `MarketplaceOffer` table. All the data in the column will be lost.
  - Added the required column `assetContract` to the `MarketplaceOffer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantity` to the `MarketplaceOffer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `royaltyInfoId` to the `MarketplaceOffer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `MarketplaceOffer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tokenId` to the `MarketplaceOffer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalPrice` to the `MarketplaceOffer` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('UNSET', 'CREATED', 'COMPLETED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "MarketplaceOffer" DROP CONSTRAINT "MarketplaceOffer_listingId_fkey";

-- AlterTable
ALTER TABLE "MarketplaceOffer" DROP COLUMN "listingId",
DROP COLUMN "listingType",
DROP COLUMN "quantityWanted",
DROP COLUMN "totalOfferAmount",
ADD COLUMN     "assetContract" CITEXT NOT NULL,
ADD COLUMN     "quantity" DECIMAL(78,0) NOT NULL,
ADD COLUMN     "royaltyInfoId" INTEGER NOT NULL,
ADD COLUMN     "status" "OfferStatus" NOT NULL,
ADD COLUMN     "tokenId" DECIMAL(78,0) NOT NULL,
ADD COLUMN     "totalPrice" DECIMAL(78,0) NOT NULL;
