-- AlterEnum
ALTER TYPE "CommitState" ADD VALUE 'orphaned';

-- AlterTable
ALTER TABLE "monad_token_trades" ADD COLUMN     "block_hash" TEXT,
ADD COLUMN     "observed_at" TIMESTAMP(3),
ADD COLUMN     "orphaned_at" TIMESTAMP(3),
ADD COLUMN     "parent_block_hash" TEXT,
ADD COLUMN     "promoted_at" TIMESTAMP(3);
