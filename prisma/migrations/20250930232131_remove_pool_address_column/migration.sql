/*
  Warnings:

  - You are about to drop the column `pool_address` on the `monad_token_trades` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "monad_token_trades" DROP COLUMN "pool_address";
