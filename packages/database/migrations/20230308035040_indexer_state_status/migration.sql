/*
  Warnings:

  - Added the required column `status` to the `IndexerState` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "IndexerStatus" AS ENUM ('SYNCING', 'SYNCED');

-- AlterTable
ALTER TABLE "IndexerState" ADD COLUMN     "status" "IndexerStatus" NOT NULL;
