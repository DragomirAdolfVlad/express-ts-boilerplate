import WebSocket from 'ws';

console.log('Testing WebSocket connection to Monad testnet...');

const wsUrl = 'wss://testnet-rpc.monad.xyz';

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');
  
  // Test basic subscription
  const testSub = {
    id: 1,
    jsonrpc: '2.0',
    method: 'eth_subscribe',
    params: ['newHeads']
  };
  
  ws.send(JSON.stringify(testSub));
  console.log('📡 Sent test subscription request');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('📨 Received message:', msg);
});

ws.on('error', (error) => {
  console.log('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
  console.log('🔌 WebSocket closed:', { code, reason: reason.toString() });
});

// Close after 10 seconds
setTimeout(() => {
  ws.close();
  process.exit(0);
}, 10000);