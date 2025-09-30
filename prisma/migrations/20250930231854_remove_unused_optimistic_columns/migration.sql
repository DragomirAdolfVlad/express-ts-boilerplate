/*
  Warnings:

  - You are about to drop the column `block_hash` on the `monad_token_trades` table. All the data in the column will be lost.
  - You are about to drop the column `observed_at` on the `monad_token_trades` table. All the data in the column will be lost.
  - You are about to drop the column `orphaned_at` on the `monad_token_trades` table. All the data in the column will be lost.
  - You are about to drop the column `parent_block_hash` on the `monad_token_trades` table. All the data in the column will be lost.
  - You are about to drop the column `promoted_at` on the `monad_token_trades` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "monad_token_trades" DROP COLUMN "block_hash",
DROP COLUMN "observed_at",
DROP COLUMN "orphaned_at",
DROP COLUMN "parent_block_hash",
DROP COLUMN "promoted_at";
