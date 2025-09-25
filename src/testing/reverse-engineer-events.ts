import { keccak256, toHex } from 'viem';

// Try to reverse engineer the actual events by testing common variations
const possibleEvents = [
  // Different Buy variations
  'Buy(address,address,uint256,uint256)',
  'BuyToken(address,address,uint256,uint256)',
  'TokenBought(address,address,uint256,uint256)',
  'Purchase(address,address,uint256,uint256)',
  
  // Different Sell variations  
  'Sell(address,address,uint256,uint256)',
  'SellToken(address,address,uint256,uint256)',
  'TokenSold(address,address,uint256,uint256)',
  
  // Swap variations
  'Swap(address,address,uint256,uint256)',
  'Trade(address,address,uint256,uint256)',
  'Exchange(address,address,uint256,uint256)',
  
  // Transfer variations
  'Transfer(address,address,uint256)',
  
  // Update variations
  'Update(address,uint256,uint256,uint256,uint256)',
  'CurveUpdate(address,uint256,uint256,uint256,uint256)',
  'ReserveUpdate(address,uint256,uint256,uint256,uint256)',
  
  // State change variations
  'StateChanged(address,uint256,uint256,uint256,uint256)',
  'CurveStateChanged(address,uint256,uint256,uint256,uint256)'
];

const target1 = '0xfd4bb47bd45abdbdb2ecd61052c9571773f9cde876e2a7745f488c20b30ab10a';
const target2 = '0x0eb25df0e2137de8ce042eeaf39080d25f0c8d451372c99db69a4c0a298d0fa1';

console.log('Looking for matches...');
possibleEvents.forEach(event => {
  const hash = keccak256(toHex(event));
  if (hash === target1) {
    console.log(`✅ MATCH Topic 1: ${event} -> ${hash}`);
  } else if (hash === target2) {
    console.log(`✅ MATCH Topic 2: ${event} -> ${hash}`);
  }
});

console.log('\nTrying to decode the actual event data lengths...');
console.log('Topic 1 has 1 indexed param (0x732758...)');
console.log('Data 1 has 4 uint256 values (128 bytes / 32 = 4)');
console.log('Topic 2 has 2 indexed params (0x0c8c74... and 0x732758...)');  
console.log('Data 2 has 2 uint256 values (64 bytes / 32 = 2)');

console.log('\nLikely patterns:');
console.log('Event 1: someEvent(address indexed token, uint256, uint256, uint256, uint256)');
console.log('Event 2: someEvent(address indexed, address indexed token, uint256, uint256)');