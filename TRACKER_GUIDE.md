# 🚀 Monad Blockchain Tracker Guide

## Overview

Your tracker is now working perfectly! It connects to the Monad testnet via QuickNode WebSocket and monitors the nad.fun bonding curve contract for real-time events.

## ✅ What's Working

1. **Server Startup** - Express server starts on port 3001
2. **WebSocket Connection** - Successfully connects to Monad testnet
3. **Event Subscription** - Subscribes to logs from the bonding curve contract
4. **Event Decoding** - Decodes 5 types of events from the blockchain
5. **Redis Publishing** - Publishes decoded events to Redis for real-time consumption

## 📊 Event Types Being Tracked

### 1. 🔄 Curve State Update
- **When**: Token reserves change in the bonding curve
- **Data**: Token address + 4 reserve amounts
- **Use Case**: Track liquidity changes

### 2. 💰 Curve Trade  
- **When**: Someone buys/sells tokens via bonding curve
- **Data**: Trader address, token, trade amounts
- **Use Case**: Monitor trading activity

### 3. 🪙 Curve Token Event
- **When**: New token is created or listed
- **Data**: Token address
- **Use Case**: Detect new token launches

### 4. 🔗 Curve Pair Event
- **When**: Token gets paired with a DEX pool
- **Data**: Token address, pool address  
- **Use Case**: Track when tokens graduate to DEX

### 5. 🔄 DEX Swap
- **When**: Trading happens on Uniswap V3 pools
- **Data**: Pool, sender, recipient, amounts, tick
- **Use Case**: Monitor DEX trading activity

## 🛠️ How to Use

### Start the Tracker
```bash
npm run build
npm start
```

## 🔧 **Important Technical Details**

### Monad-Specific WebSocket Subscription
The tracker uses **`eth_subscribe`** with **`monadLogs`** subscription type as specified in the Monad documentation:

```javascript
// Correct Monad WebSocket subscription
{
  "method": "eth_subscribe",
  "params": ["monadLogs", { "address": "0x..." }]
}
```

### Key Monad Features
- **Speculative Execution**: Events arrive as soon as blocks are proposed (not finalized)
- **Extra Fields**: Logs include `blockId` and `commitState` fields
- **Commit States**: `Proposed` → `Voted` → `Finalized` → `Verified`
- **Standard Decoding**: Uses same ABI decoding as Ethereum

### Monitor Events in Real-Time
```bash
# In a separate terminal
node redis-monitor.js
```

### Check API Health
```bash
curl http://localhost:3001/api/v1/health
```

### View Tracker Metrics
```bash
curl http://localhost:3001/api/v1/tracker/metrics
```

## 📋 Configuration

Your `.env` file is properly configured with:

- ✅ `MONAD_WS_URL` - QuickNode WebSocket endpoint
- ✅ `CONTRACT_ADDRESS` - Bonding curve contract (0x52D34d8536350Cd997bCBD0b9E9d722452f341F5)
- ✅ `REDIS_URL` - Redis connection for event publishing
- ✅ `REDIS_CHANNEL` - Channel name (nadfun:live)

## 🏗️ Architecture & SOLID Principles

Your implementation follows excellent SOLID principles:

### ✅ Single Responsibility Principle (SRP)
- `MonadTracker` - Only handles WebSocket connection and event processing
- `RedisPub` - Only handles Redis publishing
- `decode.ts` - Only handles event decoding
- Each class has one clear responsibility

### ✅ Open/Closed Principle (OCP)
- `BaseTracker` - Abstract base class that can be extended for other blockchains
- `TrackerFactory` - Can create new tracker types without modifying existing code
- Easy to add new event types or blockchain support

### ✅ Liskov Substitution Principle (LSP)
- `MonadTracker` properly implements `IBlockchainTracker` interface
- Can be substituted with other tracker implementations

### ✅ Interface Segregation Principle (ISP)
- Separate interfaces for different concerns:
  - `IBlockchainTracker` - Core tracker functionality
  - `ITrackerService` - Service orchestration
  - `ITrackerMetrics` - Metrics reporting

### ✅ Dependency Inversion Principle (DIP)
- High-level modules depend on abstractions (interfaces)
- `TrackerService` depends on `IBlockchainTracker` interface
- Easy to mock and test

## 🔧 Troubleshooting

### If Events Aren't Appearing
1. Check WebSocket connection: Look for "WebSocket connected" in logs
2. Verify subscription: Look for "Subscription established" in logs  
3. Check contract address: Ensure it matches the active bonding curve
4. Monitor Redis: Use `redis-monitor.js` to see if events are being published

### If Decoding Fails
1. Check event signatures in `decode.ts`
2. Verify ABI matches the contract
3. Look for "decode" errors in logs

## 📈 Next Steps

1. **Add Database Storage** - Store events in PostgreSQL for historical analysis
2. **Add REST API** - Create endpoints to query historical events
3. **Add WebSocket API** - Real-time event streaming to frontend
4. **Add Metrics Dashboard** - Grafana dashboard for monitoring
5. **Add Alerting** - Notifications for specific events (large trades, new tokens)

## 🎯 Performance Notes

- Events are processed in real-time with minimal latency
- Redis publishing is fire-and-forget for high throughput
- WebSocket reconnection with exponential backoff
- Metrics tracking for monitoring performance

Your tracker is production-ready and follows industry best practices! 🚀