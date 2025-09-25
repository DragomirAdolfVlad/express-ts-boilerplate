import WebSocket from 'ws';

console.log('🔍 Testing ALL log subscriptions to see what events exist...');

const wsUrl = 'wss://testnet-rpc.monad.xyz';
const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('✅ Connected to Monad testnet');
  
  // Subscribe to ALL logs (no filter) to see what's happening
  const allLogsSub = {
    id: 1,
    jsonrpc: '2.0',
    method: 'eth_subscribe',
    params: ['logs', {}] // No address filter - get ALL logs
  };
  
  ws.send(JSON.stringify(allLogsSub));
  console.log('📡 Subscribed to ALL logs on the network');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  
  if (msg.id === 1 && msg.result) {
    console.log('✅ All logs subscription ID:', msg.result);
    return;
  }
  
  if (msg.method === 'eth_subscription') {
    const log = msg.params.result;
    console.log('\n🔥 NEW LOG EVENT DETECTED:');
    console.log('  📍 Contract:', log.address);
    console.log('  📝 Topics:', log.topics);
    console.log('  📦 Data:', log.data);
    console.log('  🧱 Block:', log.blockNumber);
    console.log('  💰 Tx:', log.transactionHash);
    
    // Check if this might be our bonding curve
    const targetAddresses = [
      '0x4F5A3518F082275edf59026f72B66AC2838c0414',
      '0x52D34d8536350Cd997bCBD0b9E9d722452f341F5'
    ];
    
    if (targetAddresses.some(addr => addr.toLowerCase() === log.address.toLowerCase())) {
      console.log('🎯 *** THIS IS FROM ONE OF YOUR BONDING CURVE ADDRESSES! ***');
    }
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

// Keep alive for 2 minutes to catch transactions
setTimeout(() => {
  console.log('\n⏰ Test completed - closing connection');
  ws.close();
  process.exit(0);
}, 120000);

console.log('⏳ Listening for ALL transactions for 2 minutes...');