/*
  Warnings:

  - You are about to drop the column `token_decimals` on the `monad_token_trades` table. All the data in the column will be lost.
  - You are about to drop the column `wmon_decimals` on the `monad_token_trades` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "monad_token_trades" DROP COLUMN "token_decimals",
DROP COLUMN "wmon_decimals";
