# Token Metadata Scripts

This directory contains scripts for managing token metadata in the Monad tracker system.

## 🚀 Available Scripts

### 1. Populate Token Metadata

Fetches and populates metadata for existing tokens in the database.

```bash
# Populate metadata for all tokens without metadata
npm run populate-metadata

# Process specific token
npm run populate-metadata -- --token 0x1234...abcd

# Limit number of tokens (useful for testing)
npm run populate-metadata -- --limit 10

# Overwrite existing metadata
npm run populate-metadata -- --force

# Dry run (show what would be done without saving)
npm run populate-metadata -- --dry-run --verbose

# Verbose output with detailed logs
npm run populate-metadata -- --verbose
```

### 2. Test Metadata Fetching

Quick test for a specific token address.

```bash
# Test metadata fetching for a specific token
npm run test-metadata 0x1234...abcd
```

## 📋 Script Options

### populate-metadata Options:

- `--token <address>` - Process specific token address
- `--limit <number>` - Limit number of tokens to process  
- `--force` - Overwrite existing metadata
- `--dry-run` - Show what would be done without saving
- `--verbose` - Show detailed logs
- `--help` - Show help message

## 🔍 What the Scripts Do

### Metadata Population Process:

1. **Query Database** - Finds tokens without metadata (or all if `--force`)
2. **Fetch Contract Data** - Calls ERC-20 methods (`name`, `symbol`, `decimals`, etc.)
3. **Fetch Off-chain Data** - If `tokenURI` exists, fetches IPFS/HTTP metadata
4. **Extract Social Links** - Parses Twitter, Telegram, website from metadata
5. **Save to Database** - Updates `monad_token_metadata` table
6. **Progress Tracking** - Shows real-time progress and summary

### Metadata Sources:

- ✅ **ERC-20 Contract**: `name()`, `symbol()`, `decimals()`, `totalSupply()`, `owner()`
- ✅ **TokenURI**: IPFS and HTTP metadata with images and descriptions
- ✅ **Social Links**: Twitter, Telegram, website extraction
- ✅ **IPFS Gateway**: Automatic conversion of `ipfs://` URLs

## 📊 Example Output

```
🚀 Starting Token Metadata Population Script
Options: { limit: 5, verbose: true }

✅ Connected to database
📊 Found 5 tokens to process

[1/5] Processing: 0x1234...abcd
✅ Updated metadata for 0x1234...abcd
   Metadata: {
     name: 'MyToken',
     symbol: 'MTK', 
     hasImage: true,
     hasDescription: true,
     hasWebsite: true,
     hasSocials: true
   }

[2/5] Processing: 0x5678...efgh
⏭️  Skipped 0x5678...efgh (no enhanced metadata found)

📈 Summary:
   Processed: 5/5
   Updated: 3
   Errors: 0
   Skipped: 2
```

## 🛠️ Troubleshooting

### Common Issues:

1. **RPC Rate Limits**: The script includes 100ms delays between requests
2. **Network Timeouts**: IPFS/HTTP requests have 10-second timeouts
3. **Missing Contract Methods**: Script gracefully handles missing ERC-20 methods
4. **Database Constraints**: Uses upsert to handle duplicate metadata

### Debug Steps:

1. Test single token first: `npm run test-metadata 0x...`
2. Use dry-run mode: `npm run populate-metadata -- --dry-run --verbose`
3. Check database connection and Prisma schema
4. Verify RPC endpoint is accessible

## 🔧 Customization

To modify the metadata sources or add new fields:

1. Edit `src/infrastructure/metadata/token-metadata.service.ts`
2. Update the database schema in `prisma/schema.prisma`
3. Run `npx prisma db push` to apply schema changes
4. Update the repository methods if needed

## 📝 Notes

- **Safe to Re-run**: Scripts handle duplicates gracefully
- **Incremental**: Only processes tokens without metadata (unless `--force`)
- **Resumable**: Can be stopped and restarted without issues
- **Production Ready**: Includes proper error handling and logging