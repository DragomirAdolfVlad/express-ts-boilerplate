import Redis from 'ioredis';

const redis = new Redis('redis://localhost:6379');
console.log('🔄 Subscribing to nadfun:live channel...');

redis.subscribe('nadfun:live', (err, count) => {
  if (err) {
    console.error('❌ Failed to subscribe:', err);
    process.exit(1);
  }
  console.log(`✅ Subscribed to ${count} channel(s)`);
});

redis.on('message', (channel, message) => {
  console.log(`\n📨 [${channel}] Received event:`);
  try {
    const parsed = JSON.parse(message);
    console.log(JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.log('Raw message:', message);
  }
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

console.log('Waiting for events... (Press Ctrl+C to exit)');