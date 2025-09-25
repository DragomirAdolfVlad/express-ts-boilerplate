import { keccak256, toHex } from 'viem';

// Let me systematically try all possible combinations for bonding curve events
const eventPatterns = [
  // Pattern 1: (address indexed, uint256, uint256, uint256, uint256) - seems to be state update
  'CurveStateUpdated(address,uint256,uint256,uint256,uint256)',
  'ReserveUpdated(address,uint256,uint256,uint256,uint256)',
  'StateUpdate(address,uint256,uint256,uint256,uint256)',
  'Update(address,uint256,uint256,uint256,uint256)',
  'CurveUpdate(address,uint256,uint256,uint256,uint256)',
  'Sync(address,uint256,uint256,uint256,uint256)',
  
  // Pattern 2: (address indexed, address indexed, uint256, uint256) - seems to be trade
  'Buy(address,address,uint256,uint256)',
  'Sell(address,address,uint256,uint256)',
  'Trade(address,address,uint256,uint256)',
  'Swap(address,address,uint256,uint256)',
  'Purchase(address,address,uint256,uint256)',
  'Sale(address,address,uint256,uint256)',
  'Exchange(address,address,uint256,uint256)',
  'TokenBought(address,address,uint256,uint256)',
  'TokenSold(address,address,uint256,uint256)',
  'TokenTraded(address,address,uint256,uint256)'
];

const target1 = '0xfd4bb47bd45abdbdb2ecd61052c9571773f9cde876e2a7745f488c20b30ab10a';
const target2 = '0x0eb25df0e2137de8ce042eeaf39080d25f0c8d451372c99db69a4c0a298d0fa1';

console.log('Systematically testing all bonding curve patterns...\n');

eventPatterns.forEach(event => {
  const hash = keccak256(toHex(event));
  if (hash === target1) {
    console.log(`✅ FOUND Topic 1: ${event}`);
    console.log(`   Hash: ${hash}\n`);
  } else if (hash === target2) {
    console.log(`✅ FOUND Topic 2: ${event}`);
    console.log(`   Hash: ${hash}\n`);
  }
});

// Also check for less common patterns
const uncommonPatterns = [
  'BuyTokens(address,address,uint256,uint256)',
  'SellTokens(address,address,uint256,uint256)',
  'TokensPurchased(address,address,uint256,uint256)',
  'TokensSold(address,address,uint256,uint256)',
  'BondingCurveBuy(address,address,uint256,uint256)',
  'BondingCurveSell(address,address,uint256,uint256)',
  'CurveTrade(address,address,uint256,uint256)',
];

uncommonPatterns.forEach(event => {
  const hash = keccak256(toHex(event));
  if (hash === target1 || hash === target2) {
    console.log(`✅ FOUND UNCOMMON: ${event} -> ${hash}`);
  }
});