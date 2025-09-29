@echo off
echo 🧹 Cleaning up debugging scripts and MD files...

REM Remove debugging scripts (keep essential ones)
del /q scripts\check-contract-events.ts
del /q scripts\check-db-activity.ts
del /q scripts\check-token-activity.ts
del /q scripts\clear-bad-data.ts
del /q scripts\debug-nad-fun-api.ts
del /q scripts\fetch-token-data.ts
del /q scripts\find-token-network.ts
del /q scripts\find-uniswap-pool.ts
del /q scripts\get-active-tokens.ts
del /q scripts\import-historical-token.ts
del /q scripts\inspect-token-response.ts
del /q scripts\monitor-specific-token.ts
del /q scripts\monitor-uniswap-pool.ts
del /q scripts\populate-all-metadata.ts
del /q scripts\test-calculations.ts
del /q scripts\test-corrected-calculations.ts
del /q scripts\test-nadfun-calculations.ts
del /q scripts\test-no-drops.ts
del /q scripts\test-safe-calculations.ts
del /q scripts\README.md

REM Remove debugging MD files
del /q CALCULATION_FIXES_SUMMARY.md
del /q DATABASE_INTEGRATION_SUMMARY.md
del /q DATABASE_OVERFLOW_FIXES.md
del /q DECIMAL_FIXES_COMPLETE.md
del /q FINAL_REFACTORING_SUMMARY.md
del /q MONAD_ENHANCED_TRACKER.md
del /q MONAD_INTEGRATION_SUMMARY.md
del /q MONAD_WEBSOCKET_GUIDE.md
del /q NAD_FUN_ONLY_SUMMARY.md
del /q PRODUCTION_METADATA_FLOW.md
del /q SCHEMA_MIGRATION_GUIDE.md
del /q TRACKER_GUIDE.md

echo ✅ Local cleanup complete!

echo 📝 Staging changes for git...
git add -A

echo 💾 Committing cleanup...
git commit -m "Clean up debugging scripts and documentation files"

echo 🚀 Pushing to remote...
git push

echo 🎉 Cleanup complete! Ready for tracker expansion.
pause