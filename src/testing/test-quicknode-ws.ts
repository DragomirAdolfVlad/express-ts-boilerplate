import 'dotenv/config';
import WebSocket from 'ws';

const WS_URL = process.env['MONAD_WS_URL']!;

console.log('Testing WebSocket connection to:', WS_URL);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');
  
  // Test a simple JSON-RPC call
  const testRequest = {
    jsonrpc: '2.0',
    method: 'eth_chainId',
    params: [],
    id: 1
  };
  
  console.log('Sending test request:', testRequest);
  ws.send(JSON.stringify(testRequest));
});

ws.on('message', (data) => {
  console.log('📨 Received message:', data.toString());
  
  // Close after receiving response
  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 1000);
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log('🔌 WebSocket closed:', code, reason.toString());
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('⏰ Connection timeout');
  ws.close();
  process.exit(1);
}, 10000);