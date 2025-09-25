import { keccak256, toHex } from 'viem';

// Calculate expected topic hashes for our events
const events = [
  'Create(address,address,string,string)',
  'Buy(address,address,uint256,uint256)', 
  'Sell(address,address,uint256,uint256)',
  'Listed(address,address)',
  'Lock(address)'
];

console.log('Expected event topic hashes:');
events.forEach(event => {
  const hash = keccak256(toHex(event));
  console.log(`${event}: ${hash}`);
});

console.log('\nActual topics from logs:');
console.log('Topic 1: 0xfd4bb47bd45abdbdb2ecd61052c9571773f9cde876e2a7745f488c20b30ab10a');
console.log('Topic 2: 0x0eb25df0e2137de8ce042eeaf39080d25f0c8d451372c99db69a4c0a298d0fa1');