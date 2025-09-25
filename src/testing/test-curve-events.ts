import { keccak256, toHex } from 'viem';

// More specific BondingCurve events based on patterns observed
const curveEvents = [
  // Curve state updates with reserves
  'CurveStateUpdate(address,uint256,uint256,uint256,uint256)',
  'ReserveUpdate(address,uint256,uint256,uint256,uint256)', 
  'StateChange(address,uint256,uint256,uint256,uint256)',
  'Update(address,uint256,uint256,uint256,uint256)',
  
  // Trading events with indexed trader and token
  'TradeExecuted(address,address,uint256,uint256)',
  'TokenTraded(address,address,uint256,uint256)',
  'SwapExecuted(address,address,uint256,uint256)',
  'Purchase(address,address,uint256,uint256)',
  'Sale(address,address,uint256,uint256)',
  
  // Based on data structure - event 1 looks like reserves update
  'ReservesUpdated(address,uint256,uint256,uint256,uint256)',
  'CurveUpdated(address,uint256,uint256,uint256,uint256)',
  
  // Based on data structure - event 2 looks like trade
  'Trade(address,address,uint256,uint256)',
  'TokenPurchased(address,address,uint256,uint256)',
  'TokenSold(address,address,uint256,uint256)'
];

const target1 = '0xfd4bb47bd45abdbdb2ecd61052c9571773f9cde876e2a7745f488c20b30ab10a';
const target2 = '0x0eb25df0e2137de8ce042eeaf39080d25f0c8d451372c99db69a4c0a298d0fa1';

console.log('Testing curve-specific event patterns...');
curveEvents.forEach(event => {
  const hash = keccak256(toHex(event));
  if (hash === target1) {
    console.log(`✅ MATCH Topic 1: ${event}`);
  } else if (hash === target2) {
    console.log(`✅ MATCH Topic 2: ${event}`);
  }
});

// Also try without indexed keywords to see base signatures
console.log('\nTesting base signatures...');
const baseEvents = [
  'CurveStateUpdate(address,uint256,uint256,uint256,uint256)',
  'Trade(address,address,uint256,uint256)'
];

baseEvents.forEach(event => {
  const hash = keccak256(toHex(event));
  console.log(`${event}: ${hash}`);
  if (hash === target1 || hash === target2) {
    console.log(`  ✅ MATCH!`);
  }
});