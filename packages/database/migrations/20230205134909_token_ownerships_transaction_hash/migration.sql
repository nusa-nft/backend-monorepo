/*
  Warnings:

  - Added the required column `transactionHash` to the `TokenOwnerships` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TokenOwnerships" ADD COLUMN     "transactionHash" TEXT NOT NULL;
