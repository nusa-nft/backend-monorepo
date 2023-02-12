/*
  Warnings:

  - A unique constraint covering the columns `[transactionHash,chainId,txIndex,logIndex]` on the table `TokenTransferHistory` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "TokenTransferHistory_transactionHash_chainId_txIndex_key";

-- AlterTable
ALTER TABLE "TokenTransferHistory" ADD COLUMN     "logIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "TokenTransferHistory_transactionHash_chainId_txIndex_logInd_key" ON "TokenTransferHistory"("transactionHash", "chainId", "txIndex", "logIndex");
