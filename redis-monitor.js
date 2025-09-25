const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CHANNEL = process.env.REDIS_CHANNEL || 'nadfun:live';

console.log('🔍 Starting Redis Event Monitor...');
console.log(`📡 Connecting to: ${REDIS_URL}`);
console.log(`📻 Listening to channel: ${CHANNEL}`);
console.log('─'.repeat(80));

const redis = new Redis(REDIS_URL);

redis.subscribe(CHANNEL, (err, count) => {
  if (err) {
    console.error('❌ Failed to subscribe:', err);
    process.exit(1);
  }
  console.log(`✅ Subscribed to ${count} channel(s)`);
  console.log('🎧 Waiting for events...\n');
});

redis.on('message', (channel, message) => {
  try {
    const event = JSON.parse(message);
    const timestamp = new Date(event.t).toLocaleString();
    const block = parseInt(event.blk, 16);
    
    console.log('🎯 NEW EVENT RECEIVED');
    console.log('─'.repeat(50));
    console.log(`⏰ Time: ${timestamp}`);
    console.log(`🧱 Block: ${block}`);
    console.log(`📋 Phase: ${event.phase}`);
    console.log(`🔗 TX: ${event.tx}`);
    console.log(`📊 Type: ${event.type}`);
    
    // Event-specific details
    switch (event.type) {
      case 'curve_state_update':
        console.log(`🪙 Token: ${event.token}`);
        console.log(`💰 Reserves: ${formatAmount(event.reserve1)} | ${formatAmount(event.reserve2)} | ${formatAmount(event.reserve3)} | ${formatAmount(event.reserve4)}`);
        break;
        
      case 'curve_trade':
        console.log(`👤 Trader: ${event.trader}`);
        console.log(`🪙 Token: ${event.token}`);
        console.log(`💱 Trade: ${formatAmount(event.amount1)} ↔ ${formatAmount(event.amount2)}`);
        break;
        
      case 'curve_token_event':
        console.log(`🪙 Token: ${event.token}`);
        break;
        
      case 'curve_pair_event':
        console.log(`🪙 Token: ${event.token}`);
        console.log(`🏊 Pool: ${event.pool}`);
        break;
        
      case 'dex_swap':
        console.log(`🏊 Pool: ${event.pool}`);
        console.log(`👤 Sender: ${event.sender}`);
        console.log(`🎯 Recipient: ${event.recipient}`);
        console.log(`💱 Swap: ${formatAmount(event.amount0)} ↔ ${formatAmount(event.amount1)}`);
        console.log(`📊 Tick: ${event.tick}`);
        break;
    }
    
    console.log('─'.repeat(50));
    console.log('');
    
  } catch (error) {
    console.error('❌ Error parsing event:', error);
    console.log('📄 Raw message:', message);
  }
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

function formatAmount(amount) {
  if (!amount) return '0';
  
  try {
    const num = BigInt(amount);
    if (num === 0n) return '0';
    
    // Convert to readable format (assuming 18 decimals)
    const divisor = 10n ** 18n;
    const whole = num / divisor;
    const fraction = num % divisor;
    
    if (whole > 0n) {
      const fractionStr = fraction.toString().padStart(18, '0').slice(0, 4);
      return `${whole.toString()}.${fractionStr}`;
    } else {
      const fractionStr = fraction.toString().padStart(18, '0').slice(0, 8);
      return `0.${fractionStr}`;
    }
  } catch (error) {
    return amount.toString();
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Redis monitor...');
  redis.disconnect();
  process.exit(0);
});

console.log('💡 Press Ctrl+C to stop monitoring');