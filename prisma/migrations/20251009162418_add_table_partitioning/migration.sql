-- Migration: Add table partitioning for monad_token_trades
-- This migration converts the monad_token_trades table to a partitioned table
-- and creates optimized indexes for high-performance queries

-- Step 1: Drop the existing unique constraint (incompatible with partitioning)
DROP INDEX IF EXISTS "monad_token_trades_unique_trade_id_key";

-- Step 2: Create a new partitioned table
CREATE TABLE monad_token_trades_new (
  id                   SERIAL,
  token_address        TEXT NOT NULL,
  signature            TEXT,
  log_index            INTEGER,
  unique_trade_id      TEXT,
  block_number         TEXT NOT NULL,
  block_id             TEXT NOT NULL,
  commit_state         "CommitState" NOT NULL,
  trader               TEXT NOT NULL,
  is_buy               BOOLEAN NOT NULL,
  wmon_amount          DECIMAL(38, 18) NOT NULL,
  token_amount         DECIMAL(38, 18) NOT NULL,
  price_per_token      DECIMAL(38, 18) NOT NULL,
  usd_amount           DECIMAL(30, 2) NOT NULL,
  amount_in            DECIMAL(38, 18),
  amount_out           DECIMAL(38, 18),
  in_asset             TEXT,
  event_signature      TEXT,
  source               TEXT DEFAULT 'curve',
  is_creator_trade     BOOLEAN DEFAULT false NOT NULL,
  timestamp            TIMESTAMP(3) NOT NULL,
  curve_progress       DOUBLE PRECISION,
  market_cap           DECIMAL(30, 2),
  liquidity_usd        DECIMAL(30, 2),
  amount_wmon_raw      DECIMAL(38, 18),
  amount_token_raw     DECIMAL(38, 18),
  virtual_wmon_reserve DECIMAL(38, 18),
  virtual_token_reserve DECIMAL(38, 18),
  usd_spot_price       DECIMAL(38, 18),
  created_at           TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at           TIMESTAMP(3) NOT NULL,
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Step 3: Create initial partitions for current and future dates
-- Create a default partition for all data (we'll create specific partitions via script)
CREATE TABLE monad_token_trades_default
  PARTITION OF monad_token_trades_new
  DEFAULT;

-- Step 4: Copy data from old table to new partitioned table
-- Note: Explicitly list columns to ensure proper type mapping
INSERT INTO monad_token_trades_new (
  id, token_address, signature, log_index, unique_trade_id,
  block_number, block_id, commit_state, trader, is_buy,
  wmon_amount, token_amount, price_per_token, usd_amount,
  amount_in, amount_out, in_asset, event_signature, source,
  is_creator_trade, timestamp, curve_progress, market_cap,
  liquidity_usd, amount_wmon_raw, amount_token_raw,
  virtual_wmon_reserve, virtual_token_reserve, usd_spot_price,
  created_at, updated_at
)
SELECT 
  id, token_address, signature, log_index, unique_trade_id,
  block_number, block_id, commit_state, trader, is_buy,
  wmon_amount, token_amount, price_per_token, usd_amount,
  amount_in, amount_out, in_asset, event_signature, source,
  is_creator_trade, timestamp, curve_progress, market_cap,
  liquidity_usd, amount_wmon_raw, amount_token_raw,
  virtual_wmon_reserve, virtual_token_reserve, usd_spot_price,
  created_at, updated_at
FROM monad_token_trades;

-- Step 5: Drop old table and rename new table
DROP TABLE monad_token_trades CASCADE;
ALTER TABLE monad_token_trades_new RENAME TO monad_token_trades;

-- Step 6: Recreate foreign key constraint
ALTER TABLE monad_token_trades
  ADD CONSTRAINT monad_token_trades_token_address_fkey
  FOREIGN KEY (token_address)
  REFERENCES monad_launched_tokens(token)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Step 7: Create unique index on unique_trade_id with timestamp
-- Note: Partitioned tables require the partition key (timestamp) in unique constraints
-- This ensures uniqueness within each partition, which is sufficient since
-- unique_trade_id is derived from signature:logIndex which are already unique per transaction
CREATE UNIQUE INDEX idx_trades_unique_trade_id 
  ON monad_token_trades (unique_trade_id, timestamp)
  WHERE unique_trade_id IS NOT NULL;

-- Step 7b: Create non-unique index on unique_trade_id alone for lookups
CREATE INDEX idx_trades_unique_trade_id_lookup
  ON monad_token_trades (unique_trade_id)
  WHERE unique_trade_id IS NOT NULL;

-- Step 8: Create optimized composite indexes
-- Composite index for token queries with timestamp ordering
CREATE INDEX idx_trades_token_timestamp 
  ON monad_token_trades (token_address, timestamp DESC);

-- Composite index for trader queries with timestamp ordering
CREATE INDEX idx_trades_trader_timestamp 
  ON monad_token_trades (trader, timestamp DESC);

-- Step 9: Create index for recent trades
-- Note: Cannot use NOW() in index predicate as it's not immutable
-- Instead, we create a regular index on timestamp which will be efficient
-- for recent trade queries due to partition pruning
CREATE INDEX idx_trades_timestamp_desc 
  ON monad_token_trades (timestamp DESC);

-- Step 10: Create additional performance indexes
CREATE INDEX idx_trades_token_address ON monad_token_trades (token_address);
CREATE INDEX idx_trades_trader ON monad_token_trades (trader);
CREATE INDEX idx_trades_timestamp ON monad_token_trades (timestamp);
CREATE INDEX idx_trades_signature ON monad_token_trades (signature);
CREATE INDEX idx_trades_is_creator_trade ON monad_token_trades (is_creator_trade);
CREATE INDEX idx_trades_commit_state ON monad_token_trades (commit_state);
CREATE INDEX idx_trades_block_number ON monad_token_trades (block_number);
CREATE INDEX idx_trades_token_commit_state ON monad_token_trades (token_address, commit_state);

-- Step 11: Create materialized view for token statistics
-- This view aggregates trade data for fast queries
CREATE MATERIALIZED VIEW token_stats_mv AS
SELECT 
  token_address,
  COUNT(*) as total_trades,
  SUM(CASE WHEN is_buy THEN 1 ELSE 0 END) as buy_count,
  SUM(CASE WHEN NOT is_buy THEN 1 ELSE 0 END) as sell_count,
  SUM(wmon_amount) as total_wmon_volume,
  SUM(usd_amount) as total_usd_volume,
  SUM(CASE WHEN is_buy THEN usd_amount ELSE 0 END) as buy_volume_usd,
  SUM(CASE WHEN NOT is_buy THEN usd_amount ELSE 0 END) as sell_volume_usd,
  MAX(timestamp) as last_trade_time,
  MIN(timestamp) as first_trade_time,
  AVG(price_per_token) as avg_price,
  MAX(price_per_token) as max_price,
  MIN(price_per_token) as min_price,
  MAX(market_cap) as current_market_cap,
  COUNT(DISTINCT trader) as unique_traders
FROM monad_token_trades
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY token_address;

-- Create unique index on materialized view for fast lookups
CREATE UNIQUE INDEX idx_token_stats_mv_token_address 
  ON token_stats_mv (token_address);

-- Create index for sorting by volume
CREATE INDEX idx_token_stats_mv_volume 
  ON token_stats_mv (total_usd_volume DESC);

-- Create index for sorting by trade count
CREATE INDEX idx_token_stats_mv_trades 
  ON token_stats_mv (total_trades DESC);

-- Step 12: Create function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_token_stats_mv()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY token_stats_mv;
END;
$$ LANGUAGE plpgsql;

-- Step 13: Add comment to document the partitioning strategy
COMMENT ON TABLE monad_token_trades IS 
  'Partitioned table by timestamp (daily partitions). Use automatic partition creation script to maintain partitions.';
