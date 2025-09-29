/*
  Warnings:

  - A unique constraint covering the columns `[unique_trade_id]` on the table `monad_token_trades` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."monad_token_trades" ADD COLUMN     "log_index" INTEGER,
ADD COLUMN     "unique_trade_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "monad_token_trades_unique_trade_id_key" ON "public"."monad_token_trades"("unique_trade_id");
