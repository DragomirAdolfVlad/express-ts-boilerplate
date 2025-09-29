/*
  Warnings:

  - You are about to alter the column `token_amount` on the `archived_monad_token_trades` table. The data in that column could be lost. The data in that column will be cast from `Decimal(30,9)` to `Decimal(38,18)`.
  - The `reserve1` column on the `archived_monad_token_trades` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `reserve2` column on the `archived_monad_token_trades` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `reserve3` column on the `archived_monad_token_trades` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `reserve4` column on the `archived_monad_token_trades` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `total_wmon_volume` on the `monad_token_trade_stats` table. The data in that column could be lost. The data in that column will be cast from `Decimal(30,9)` to `Decimal(38,18)`.
  - You are about to alter the column `creator_holdings` on the `monad_token_trade_stats` table. The data in that column could be lost. The data in that column will be cast from `Decimal(30,9)` to `Decimal(38,18)`.
  - You are about to alter the column `token_amount` on the `monad_token_trades` table. The data in that column could be lost. The data in that column will be cast from `Decimal(30,9)` to `Decimal(38,18)`.
  - The `reserve1` column on the `monad_token_trades` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `reserve2` column on the `monad_token_trades` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `reserve3` column on the `monad_token_trades` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `reserve4` column on the `monad_token_trades` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `commit_state` on the `archived_monad_token_trades` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `commit_state` on the `monad_launched_tokens` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `commit_state` on the `monad_token_trades` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "public"."CommitState" AS ENUM ('proposed', 'finalized', 'verified');

-- AlterTable
ALTER TABLE "public"."archived_monad_token_trades" DROP COLUMN "commit_state",
ADD COLUMN     "commit_state" "public"."CommitState" NOT NULL,
ALTER COLUMN "wmon_amount" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "token_amount" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "price_per_token" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "usd_amount" SET DATA TYPE DECIMAL(28,2),
ALTER COLUMN "market_cap" SET DATA TYPE DECIMAL(28,2),
DROP COLUMN "reserve1",
ADD COLUMN     "reserve1" DECIMAL(38,18),
DROP COLUMN "reserve2",
ADD COLUMN     "reserve2" DECIMAL(38,18),
DROP COLUMN "reserve3",
ADD COLUMN     "reserve3" DECIMAL(38,18),
DROP COLUMN "reserve4",
ADD COLUMN     "reserve4" DECIMAL(38,18),
ALTER COLUMN "usd_spot_price" SET DATA TYPE DECIMAL(38,18);

-- AlterTable
ALTER TABLE "public"."monad_launched_tokens" DROP COLUMN "commit_state",
ADD COLUMN     "commit_state" "public"."CommitState" NOT NULL;

-- AlterTable
ALTER TABLE "public"."monad_token_trade_stats" ALTER COLUMN "total_wmon_volume" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "creator_holdings" SET DATA TYPE DECIMAL(38,18);

-- AlterTable
ALTER TABLE "public"."monad_token_trades" DROP COLUMN "commit_state",
ADD COLUMN     "commit_state" "public"."CommitState" NOT NULL,
ALTER COLUMN "wmon_amount" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "token_amount" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "price_per_token" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "usd_amount" SET DATA TYPE DECIMAL(28,2),
ALTER COLUMN "market_cap" SET DATA TYPE DECIMAL(28,2),
ALTER COLUMN "liquidity_usd" SET DATA TYPE DECIMAL(28,2),
DROP COLUMN "reserve1",
ADD COLUMN     "reserve1" DECIMAL(38,18),
DROP COLUMN "reserve2",
ADD COLUMN     "reserve2" DECIMAL(38,18),
DROP COLUMN "reserve3",
ADD COLUMN     "reserve3" DECIMAL(38,18),
DROP COLUMN "reserve4",
ADD COLUMN     "reserve4" DECIMAL(38,18),
ALTER COLUMN "usd_spot_price" SET DATA TYPE DECIMAL(38,18);

-- CreateIndex
CREATE INDEX "archived_monad_token_trades_commit_state_idx" ON "public"."archived_monad_token_trades"("commit_state");

-- CreateIndex
CREATE INDEX "monad_launched_tokens_commit_state_idx" ON "public"."monad_launched_tokens"("commit_state");

-- CreateIndex
CREATE INDEX "monad_token_trades_commit_state_idx" ON "public"."monad_token_trades"("commit_state");

-- CreateIndex
CREATE INDEX "monad_token_trades_token_address_commit_state_idx" ON "public"."monad_token_trades"("token_address", "commit_state");
