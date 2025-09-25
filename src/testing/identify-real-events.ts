import { keccak256, toHex } from 'viem';

// From observing the logs, we have these main event topic patterns:
const observedTopics = {
  // Most common - appears to be state/reserves update (1 indexed address + 4 uint256 in data)
  stateUpdate: '0xfd4bb47bd45abdbdb2ecd61052c9571773f9cde876e2a7745f488c20b30ab10a',
  
  // Trade event (2 indexed addresses + 2 uint256 in data) 
  trade: '0x00a7ba871905cb955432583640b5c9fc6bdd27d36884ab2b5420839224638862',
  
  // Single indexed address, no data - possibly Lock/Create
  singleEvent: '0xa9aaee0c81575bef307b11099af1a555ba16588e3b35cf930ee8c08f979b1a4a',
  
  // Two indexed addresses, no data - possibly Listed  
  doubleEvent: '0xaa090437ef524cee1d4e0825c0caff2203af3b38ab39624d8ff7fab67e219704'
};

// Let's try some systematic naming for bonding curve events
const possibleEventNames = [
  // State/reserves update events
  'CurveStateUpdated(address,uint256,uint256,uint256,uint256)',
  'ReservesUpdated(address,uint256,uint256,uint256,uint256)', 
  'StateChanged(address,uint256,uint256,uint256,uint256)',
  'CurveUpdated(address,uint256,uint256,uint256,uint256)',
  'Sync(address,uint256,uint256,uint256,uint256)',
  'Update(address,uint256,uint256,uint256,uint256)',
  
  // Trade events  
  'Buy(address,address,uint256,uint256)',
  'Sell(address,address,uint256,uint256)',
  'Trade(address,address,uint256,uint256)',
  'Purchase(address,address,uint256,uint256)',
  'Sale(address,address,uint256,uint256)',
  'Swap(address,address,uint256,uint256)',
  'TokenTraded(address,address,uint256,uint256)',
  'TokenBought(address,address,uint256,uint256)',
  'TokenSold(address,address,uint256,uint256)',
  
  // Single address events
  'TokenCreated(address)',
  'CurveCreated(address)', 
  'Created(address)',
  'Lock(address)',
  'Locked(address)',
  'TokenLocked(address)',
  'Initialize(address)',
  'Initialized(address)',
  
  // Double address events
  'Listed(address,address)',
  'TokenListed(address,address)',
  'CurveListed(address,address)',
  'PoolCreated(address,address)',
  'Paired(address,address)'
];

console.log('Testing all possible event signatures against observed topics...\n');

for (const eventSig of possibleEventNames) {
  const hash = keccak256(toHex(eventSig));
  
  if (hash === observedTopics.stateUpdate) {
    console.log(`✅ STATE UPDATE MATCH: ${eventSig}`);
    console.log(`   Topic: ${hash}\n`);
  } else if (hash === observedTopics.trade) {
    console.log(`✅ TRADE MATCH: ${eventSig}`);
    console.log(`   Topic: ${hash}\n`);
  } else if (hash === observedTopics.singleEvent) {
    console.log(`✅ SINGLE EVENT MATCH: ${eventSig}`);
    console.log(`   Topic: ${hash}\n`);
  } else if (hash === observedTopics.doubleEvent) {
    console.log(`✅ DOUBLE EVENT MATCH: ${eventSig}`);
    console.log(`   Topic: ${hash}\n`);
  }
}

console.log('If no matches found, we\'ll need to use generic event names for the unknown signatures.');