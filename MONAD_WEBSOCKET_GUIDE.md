# 🔗 Monad WebSocket Implementation Guide

## ✅ **Correct Implementation**

Based on the official Monad documentation, here's the proper way to subscribe to Monad logs:

### 1. **WebSocket Subscription**
```javascript
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_subscribe",
  "params": [
    "monadLogs",           // Subscription type (Monad-specific)
    {
      "address": "0x..."   // Contract address to monitor
    }
  ]
}
```

### 2. **Response Handling**
```javascript
// Subscription notifications come as:
{
  "method": "eth_subscription",
  "params": {
    "subscription": "0x...",
    "result": {
      // Standard Ethereum log fields
      "address": "0x...",
      "topics": ["0x..."],
      "data": "0x...",
      "blockNumber": "0x...",
      "blockHash": "0x...",
      "transactionHash": "0x...",
      "logIndex": "0x...",
      
      // Monad-specific fields
      "blockId": "...",
      "commitState": "Proposed" | "Voted" | "Finalized" | "Verified"
    }
  }
}
```

## 🎯 **Key Monad Features**

### **Speculative Execution**
- Events arrive **immediately** when blocks are proposed
- Some events may not appear in finalized blocks
- Handle speculative data appropriately

### **Commit States**
1. **Proposed** - Block just proposed
2. **Voted** - Block received votes  
3. **Finalized** - Block finalized
4. **Verified** - Block verified

### **Standard Compatibility**
- Use same ABI decoding as Ethereum
- Compatible with `viem`, `ethers.js`, `web3.js`
- Just ignore extra Monad fields if not needed

## 🏗️ **Our Implementation**

### **Clean Architecture Benefits**
```typescript
// Domain Layer - Business logic
class CurveTradeEvent extends BlockchainEvent { ... }

// Application Layer - Use cases  
interface IBlockchainTracker { ... }

// Infrastructure Layer - Monad-specific adapter
class MonadTrackerAdapter implements IBlockchainTracker {
  // Handles Monad WebSocket protocol
  // Converts to standard format for domain layer
}
```

### **Monad-Specific Handling**
```typescript
private extractMonadLogData(logData: any) {
  const commitState = logData.commitState || 'unknown';
  const blockId = logData.blockId;
  
  // Convert to standard format for decoder
  const standardLog = {
    ...standardEthereumFields,
    monad: { blockId, commitState }
  };
  
  return { log: standardLog, phase: this.mapCommitState(commitState) };
}
```

## 🚀 **Production Ready**

Your tracker now correctly:
- ✅ Uses proper `eth_subscribe` with `monadLogs`
- ✅ Handles Monad-specific fields (`blockId`, `commitState`)
- ✅ Processes speculative execution properly
- ✅ Maintains clean architecture principles
- ✅ Compatible with standard Ethereum tooling

The implementation follows Monad documentation exactly while maintaining enterprise-grade code organization! 🎉