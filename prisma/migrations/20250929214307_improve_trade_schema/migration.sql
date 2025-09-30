/*
  Warnings:

  - You are about to drop the column `reserve1` on the `monad_token_trades` table. All the data in the column will be lost.
  - You are about to drop the column `reserve2` on the `monad_token_trades` table. All the data in the column will be lost.
  - You are about to drop the column `reserve3` on the `monad_token_trades` table. All the data in the column will be lost.
  - You are about to drop the column `reserve4` on the `monad_token_trades` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."monad_token_trades" DROP COLUMN "reserve1",
DROP COLUMN "reserve2",
DROP COLUMN "reserve3",
DROP COLUMN "reserve4",
ADD COLUMN     "amount_in" DECIMAL(38,18),
ADD COLUMN     "amount_out" DECIMAL(38,18),
ADD COLUMN     "amount_token_raw" DECIMAL(38,18),
ADD COLUMN     "amount_wmon_raw" DECIMAL(38,18),
ADD COLUMN     "event_signature" TEXT,
ADD COLUMN     "in_asset" TEXT,
ADD COLUMN     "pool_address" TEXT,
ADD COLUMN     "source" TEXT DEFAULT 'curve',
ADD COLUMN     "token_decimals" INTEGER DEFAULT 18,
ADD COLUMN     "virtual_token_reserve" DECIMAL(38,18),
ADD COLUMN     "virtual_wmon_reserve" DECIMAL(38,18),
ADD COLUMN     "wmon_decimals" INTEGER DEFAULT 18;
