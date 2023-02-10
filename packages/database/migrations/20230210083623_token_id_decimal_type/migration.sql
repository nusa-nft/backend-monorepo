/*
  Warnings:

  - The primary key for the `TokenOwnerships` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Made the column `tokenId` on table `Erc1155TransferHistory` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tokenId` on table `LazyMintSale` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tokenId` on table `MarketplaceListing` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tokenId` on table `TokenTransferHistory` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "MarketplaceListing" DROP CONSTRAINT "MarketplaceListing_tokenId_assetContract_chainId_fkey";

-- AlterTable
ALTER TABLE "Erc1155TransferHistory" ALTER COLUMN "tokenId" SET NOT NULL,
ALTER COLUMN "tokenId" SET DATA TYPE DECIMAL(78,0);

-- AlterTable
ALTER TABLE "Item" ALTER COLUMN "tokenId" SET DEFAULT -1,
ALTER COLUMN "tokenId" SET DATA TYPE DECIMAL(78,0),
ALTER COLUMN "supply" SET DATA TYPE DECIMAL(78,0);

-- AlterTable
ALTER TABLE "LazyMintSale" ALTER COLUMN "tokenId" SET NOT NULL,
ALTER COLUMN "tokenId" SET DATA TYPE DECIMAL(78,0);

-- AlterTable
ALTER TABLE "MarketplaceListing" ALTER COLUMN "tokenId" SET NOT NULL,
ALTER COLUMN "tokenId" SET DATA TYPE DECIMAL(78,0);

-- AlterTable
ALTER TABLE "TokenOwnerships" DROP CONSTRAINT "TokenOwnerships_pkey",
ALTER COLUMN "tokenId" SET DATA TYPE DECIMAL(78,0),
ADD CONSTRAINT "TokenOwnerships_pkey" PRIMARY KEY ("contractAddress", "chainId", "tokenId", "ownerAddress");

-- AlterTable
ALTER TABLE "TokenTransferHistory" ALTER COLUMN "tokenId" SET NOT NULL,
ALTER COLUMN "tokenId" SET DATA TYPE DECIMAL(78,0);

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_tokenId_assetContract_chainId_fkey" FOREIGN KEY ("tokenId", "assetContract", "chainId") REFERENCES "Item"("tokenId", "contract_address", "chainId") ON DELETE RESTRICT ON UPDATE CASCADE;
