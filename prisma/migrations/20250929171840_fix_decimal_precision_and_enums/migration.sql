-- AlterTable
ALTER TABLE "public"."monad_token_trades" ALTER COLUMN "usd_amount" SET DATA TYPE DECIMAL(30,2),
ALTER COLUMN "market_cap" SET DATA TYPE DECIMAL(30,2),
ALTER COLUMN "liquidity_usd" SET DATA TYPE DECIMAL(30,2);
