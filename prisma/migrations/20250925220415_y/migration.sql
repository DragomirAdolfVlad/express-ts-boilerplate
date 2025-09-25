-- CreateTable
CREATE TABLE "public"."monad_launched_tokens" (
    "id" SERIAL NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'monad',
    "signature" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "bonding_curve" TEXT NOT NULL,
    "block_number" TEXT NOT NULL,
    "block_id" TEXT NOT NULL,
    "commit_state" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "symbol" TEXT,
    "metadata_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monad_launched_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."monad_token_metadata" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "show_name" BOOLEAN DEFAULT false,
    "created_on" TEXT,
    "website" JSONB,
    "telegram" TEXT,
    "twitter" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monad_token_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."monad_token_trades" (
    "id" SERIAL NOT NULL,
    "token_address" TEXT NOT NULL,
    "signature" TEXT,
    "block_number" TEXT NOT NULL,
    "block_id" TEXT NOT NULL,
    "commit_state" TEXT NOT NULL,
    "trader" TEXT NOT NULL,
    "is_buy" BOOLEAN NOT NULL,
    "wmon_amount" DECIMAL(20,9) NOT NULL,
    "token_amount" DECIMAL(30,9) NOT NULL,
    "price_per_token" DECIMAL(20,9) NOT NULL,
    "usd_amount" DECIMAL(20,2) NOT NULL,
    "is_creator_trade" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "curve_progress" DOUBLE PRECISION,
    "market_cap" DECIMAL(20,2),
    "liquidity_usd" DECIMAL(20,2),
    "reserve1" TEXT,
    "reserve2" TEXT,
    "reserve3" TEXT,
    "reserve4" TEXT,
    "usd_spot_price" DECIMAL(20,9),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monad_token_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."monad_token_trade_stats" (
    "id" SERIAL NOT NULL,
    "token_address" TEXT NOT NULL,
    "total_tx_count" INTEGER NOT NULL DEFAULT 0,
    "total_wmon_volume" DECIMAL(30,9) NOT NULL DEFAULT 0,
    "total_usd_volume" DECIMAL(30,2) NOT NULL DEFAULT 0,
    "buy_count" INTEGER NOT NULL DEFAULT 0,
    "sell_count" INTEGER NOT NULL DEFAULT 0,
    "buy_volume_usd" DECIMAL(30,2) NOT NULL DEFAULT 0,
    "sell_volume_usd" DECIMAL(30,2) NOT NULL DEFAULT 0,
    "creator_holdings" DECIMAL(30,9) NOT NULL DEFAULT 0,
    "creator_sold" BOOLEAN NOT NULL DEFAULT false,
    "last_trade_time" TIMESTAMP(3) NOT NULL,
    "proposed_trades" INTEGER NOT NULL DEFAULT 0,
    "finalized_trades" INTEGER NOT NULL DEFAULT 0,
    "verified_trades" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monad_token_trade_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."archived_monad_token_trades" (
    "id" SERIAL NOT NULL,
    "token_address" TEXT NOT NULL,
    "signature" TEXT,
    "block_number" TEXT NOT NULL,
    "block_id" TEXT NOT NULL,
    "commit_state" TEXT NOT NULL,
    "trader" TEXT NOT NULL,
    "is_buy" BOOLEAN NOT NULL,
    "wmon_amount" DECIMAL(20,9) NOT NULL,
    "token_amount" DECIMAL(30,9) NOT NULL,
    "price_per_token" DECIMAL(20,9) NOT NULL,
    "usd_amount" DECIMAL(20,2) NOT NULL,
    "is_creator_trade" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "curve_progress" DOUBLE PRECISION,
    "market_cap" DECIMAL(20,2),
    "reserve1" TEXT,
    "reserve2" TEXT,
    "reserve3" TEXT,
    "reserve4" TEXT,
    "usd_spot_price" DECIMAL(20,9),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "archived_monad_token_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."archived_monad_launched_tokens" (
    "id" SERIAL NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'monad',
    "signature" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "bonding_curve" TEXT NOT NULL,
    "block_number" TEXT NOT NULL,
    "block_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "symbol" TEXT,
    "metadata_snapshot" JSONB,
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archive_reason" TEXT NOT NULL,
    "last_activity_at" TIMESTAMP(3),
    "final_market_cap" DECIMAL(20,2),
    "total_volume_usd" DECIMAL(30,2) DEFAULT 0,
    "total_trades" INTEGER DEFAULT 0,
    "original_created_at" TIMESTAMP(3) NOT NULL,
    "original_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "archived_monad_launched_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monad_launched_tokens_signature_key" ON "public"."monad_launched_tokens"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "monad_launched_tokens_token_key" ON "public"."monad_launched_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "monad_launched_tokens_metadata_id_key" ON "public"."monad_launched_tokens"("metadata_id");

-- CreateIndex
CREATE INDEX "monad_launched_tokens_creator_idx" ON "public"."monad_launched_tokens"("creator");

-- CreateIndex
CREATE INDEX "monad_launched_tokens_timestamp_idx" ON "public"."monad_launched_tokens"("timestamp");

-- CreateIndex
CREATE INDEX "monad_launched_tokens_signature_idx" ON "public"."monad_launched_tokens"("signature");

-- CreateIndex
CREATE INDEX "monad_launched_tokens_token_idx" ON "public"."monad_launched_tokens"("token");

-- CreateIndex
CREATE INDEX "monad_launched_tokens_bonding_curve_idx" ON "public"."monad_launched_tokens"("bonding_curve");

-- CreateIndex
CREATE INDEX "monad_launched_tokens_platform_idx" ON "public"."monad_launched_tokens"("platform");

-- CreateIndex
CREATE INDEX "monad_launched_tokens_block_number_idx" ON "public"."monad_launched_tokens"("block_number");

-- CreateIndex
CREATE INDEX "monad_launched_tokens_commit_state_idx" ON "public"."monad_launched_tokens"("commit_state");

-- CreateIndex
CREATE INDEX "monad_token_metadata_name_idx" ON "public"."monad_token_metadata"("name");

-- CreateIndex
CREATE INDEX "monad_token_metadata_symbol_idx" ON "public"."monad_token_metadata"("symbol");

-- CreateIndex
CREATE INDEX "monad_token_trades_token_address_idx" ON "public"."monad_token_trades"("token_address");

-- CreateIndex
CREATE INDEX "monad_token_trades_trader_idx" ON "public"."monad_token_trades"("trader");

-- CreateIndex
CREATE INDEX "monad_token_trades_timestamp_idx" ON "public"."monad_token_trades"("timestamp");

-- CreateIndex
CREATE INDEX "monad_token_trades_signature_idx" ON "public"."monad_token_trades"("signature");

-- CreateIndex
CREATE INDEX "monad_token_trades_is_creator_trade_idx" ON "public"."monad_token_trades"("is_creator_trade");

-- CreateIndex
CREATE INDEX "monad_token_trades_commit_state_idx" ON "public"."monad_token_trades"("commit_state");

-- CreateIndex
CREATE INDEX "monad_token_trades_block_number_idx" ON "public"."monad_token_trades"("block_number");

-- CreateIndex
CREATE INDEX "monad_token_trades_token_address_timestamp_idx" ON "public"."monad_token_trades"("token_address", "timestamp");

-- CreateIndex
CREATE INDEX "monad_token_trades_trader_timestamp_idx" ON "public"."monad_token_trades"("trader", "timestamp");

-- CreateIndex
CREATE INDEX "monad_token_trades_token_address_commit_state_idx" ON "public"."monad_token_trades"("token_address", "commit_state");

-- CreateIndex
CREATE UNIQUE INDEX "monad_token_trade_stats_token_address_key" ON "public"."monad_token_trade_stats"("token_address");

-- CreateIndex
CREATE INDEX "monad_token_trade_stats_token_address_idx" ON "public"."monad_token_trade_stats"("token_address");

-- CreateIndex
CREATE INDEX "monad_token_trade_stats_last_trade_time_idx" ON "public"."monad_token_trade_stats"("last_trade_time");

-- CreateIndex
CREATE INDEX "monad_token_trade_stats_total_usd_volume_idx" ON "public"."monad_token_trade_stats"("total_usd_volume");

-- CreateIndex
CREATE INDEX "monad_token_trade_stats_creator_sold_idx" ON "public"."monad_token_trade_stats"("creator_sold");

-- CreateIndex
CREATE INDEX "monad_token_trade_stats_finalized_trades_idx" ON "public"."monad_token_trade_stats"("finalized_trades");

-- CreateIndex
CREATE INDEX "archived_monad_token_trades_token_address_idx" ON "public"."archived_monad_token_trades"("token_address");

-- CreateIndex
CREATE INDEX "archived_monad_token_trades_trader_idx" ON "public"."archived_monad_token_trades"("trader");

-- CreateIndex
CREATE INDEX "archived_monad_token_trades_timestamp_idx" ON "public"."archived_monad_token_trades"("timestamp");

-- CreateIndex
CREATE INDEX "archived_monad_token_trades_signature_idx" ON "public"."archived_monad_token_trades"("signature");

-- CreateIndex
CREATE INDEX "archived_monad_token_trades_is_creator_trade_idx" ON "public"."archived_monad_token_trades"("is_creator_trade");

-- CreateIndex
CREATE INDEX "archived_monad_token_trades_commit_state_idx" ON "public"."archived_monad_token_trades"("commit_state");

-- CreateIndex
CREATE INDEX "archived_monad_token_trades_token_address_timestamp_idx" ON "public"."archived_monad_token_trades"("token_address", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "archived_monad_launched_tokens_token_key" ON "public"."archived_monad_launched_tokens"("token");

-- CreateIndex
CREATE INDEX "archived_monad_launched_tokens_token_idx" ON "public"."archived_monad_launched_tokens"("token");

-- CreateIndex
CREATE INDEX "archived_monad_launched_tokens_creator_idx" ON "public"."archived_monad_launched_tokens"("creator");

-- CreateIndex
CREATE INDEX "archived_monad_launched_tokens_archived_at_idx" ON "public"."archived_monad_launched_tokens"("archived_at");

-- CreateIndex
CREATE INDEX "archived_monad_launched_tokens_archive_reason_idx" ON "public"."archived_monad_launched_tokens"("archive_reason");

-- CreateIndex
CREATE INDEX "archived_monad_launched_tokens_last_activity_at_idx" ON "public"."archived_monad_launched_tokens"("last_activity_at");

-- CreateIndex
CREATE INDEX "archived_monad_launched_tokens_platform_idx" ON "public"."archived_monad_launched_tokens"("platform");

-- CreateIndex
CREATE INDEX "archived_monad_launched_tokens_total_volume_usd_idx" ON "public"."archived_monad_launched_tokens"("total_volume_usd");

-- CreateIndex
CREATE INDEX "archived_monad_launched_tokens_block_number_idx" ON "public"."archived_monad_launched_tokens"("block_number");

-- AddForeignKey
ALTER TABLE "public"."monad_launched_tokens" ADD CONSTRAINT "monad_launched_tokens_metadata_id_fkey" FOREIGN KEY ("metadata_id") REFERENCES "public"."monad_token_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."monad_token_trades" ADD CONSTRAINT "monad_token_trades_token_address_fkey" FOREIGN KEY ("token_address") REFERENCES "public"."monad_launched_tokens"("token") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."monad_token_trade_stats" ADD CONSTRAINT "monad_token_trade_stats_token_address_fkey" FOREIGN KEY ("token_address") REFERENCES "public"."monad_launched_tokens"("token") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."archived_monad_token_trades" ADD CONSTRAINT "archived_monad_token_trades_token_address_fkey" FOREIGN KEY ("token_address") REFERENCES "public"."monad_launched_tokens"("token") ON DELETE RESTRICT ON UPDATE CASCADE;
