/**
 * Bonding Curve ABI
 * 
 * Real event signatures observed from live BondingCurve contract
 */

export const BONDING_CURVE_ABI = [
  // Topic: 0xfd4bb47bd45abdbdb2ecd61052c9571773f9cde876e2a7745f488c20b30ab10a
  // Pattern: 1 indexed address + 4 uint256 in data (likely state/reserves update)  
  {
    "type": "event",
    "name": "StateUpdate",
    "inputs": [
      { "name": "token", "type": "address", "indexed": true },
      { "name": "reserve1", "type": "uint256", "indexed": false },
      { "name": "reserve2", "type": "uint256", "indexed": false },
      { "name": "reserve3", "type": "uint256", "indexed": false },
      { "name": "reserve4", "type": "uint256", "indexed": false }
    ]
  },
  
  // Topic: 0x00a7ba871905cb955432583640b5c9fc6bdd27d36884ab2b5420839224638862
  // Pattern: 2 indexed addresses + 2 uint256 in data (likely trade event)
  {
    "type": "event", 
    "name": "Trade",
    "inputs": [
      { "name": "trader", "type": "address", "indexed": true },
      { "name": "token", "type": "address", "indexed": true },
      { "name": "amount1", "type": "uint256", "indexed": false },
      { "name": "amount2", "type": "uint256", "indexed": false }
    ]
  },
  
  // Topic: 0xa9aaee0c81575bef307b11099af1a555ba16588e3b35cf930ee8c08f979b1a4a  
  // Pattern: 1 indexed address + no data (likely lock/create event)
  {
    "type": "event",
    "name": "TokenEvent",
    "inputs": [
      { "name": "token", "type": "address", "indexed": true }
    ]
  },
  
  // Topic: 0xaa090437ef524cee1d4e0825c0caff2203af3b38ab39624d8ff7fab67e219704
  // Pattern: 2 indexed addresses + no data (likely listed event)
  {
    "type": "event",
    "name": "PairEvent", 
    "inputs": [
      { "name": "token", "type": "address", "indexed": true },
      { "name": "pool", "type": "address", "indexed": true }
    ]
  }
] as const;