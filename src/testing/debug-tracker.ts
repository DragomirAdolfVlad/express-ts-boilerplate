import 'dotenv/config';

console.log('=== Environment Variables ===');
console.log('MONAD_WS_URL:', process.env['MONAD_WS_URL']);
console.log('MONAD_HTTP_URL:', process.env['MONAD_HTTP_URL']);
console.log('NAD_BONDING_CURVE_ADDRESS:', process.env['NAD_BONDING_CURVE_ADDRESS']);
console.log('FACTORY:', process.env['FACTORY']);
console.log('WMON:', process.env['WMON']);
console.log('REDIS_URL:', process.env['REDIS_URL'] || 'redis://localhost:6379');

console.log('\n=== Testing Redis Connection ===');
import Redis from 'ioredis';

const redis = new Redis(process.env['REDIS_URL'] || 'redis://localhost:6379');

redis.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redis.on('error', (err) => {
  console.log('❌ Redis connection error:', err.message);
});

// Test ping
setTimeout(async () => {
  try {
    const result = await redis.ping();
    console.log('✅ Redis ping result:', result);
  } catch (err) {
    console.log('❌ Redis ping failed:', err);
  }
}, 1000);

console.log('\n=== Testing WebSocket Connection ===');
import WebSocket from 'ws';

const wsUrl = process.env['MONAD_WS_URL'];
if (wsUrl) {
  const ws = new WebSocket(wsUrl);
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected to:', wsUrl);
    ws.close();
  });
  
  ws.on('error', (err) => {
    console.log('❌ WebSocket connection error:', err.message);
  });
} else {
  console.log('❌ MONAD_WS_URL not set');
}