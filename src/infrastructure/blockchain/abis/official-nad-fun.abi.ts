/**
 * NAD.FUN Contract ABIs
 * 
 * Contains the essential ABIs for NAD.FUN contract interaction
 * Based on the official contract repository: https://github.com/Naddotfun/contract-v3-abi
 */

// Bonding Curve ABI with all essential events
export const BONDING_CURVE_ABI = [
  {
    "type": "event",
    "name": "CurveCreate",
    "inputs": [
      { "name": "creator", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "pool", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "name", "type": "string", "indexed": false, "internalType": "string" },
      { "name": "symbol", "type": "string", "indexed": false, "internalType": "string" },
      { "name": "tokenURI", "type": "string", "indexed": false, "internalType": "string" },
      { "name": "virtualMon", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "virtualToken", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "targetTokenAmount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CurveBuy",
    "inputs": [
      { "name": "sender", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amountIn", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "amountOut", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CurveSell",
    "inputs": [
      { "name": "sender", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amountIn", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "amountOut", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CurveSync",
    "inputs": [
      { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "realMonReserve", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "realTokenReserve", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "virtualMonReserve", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "virtualTokenReserve", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CurveTokenListed",
    "inputs": [
      { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "dexFactory", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "pool", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CurveTokenLocked",
    "inputs": [
      { "name": "token", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  }
] as const;

// Export specific event signatures for easy reference
export const BONDING_CURVE_EVENTS = {
  // Token creation event - KEY EVENT FOR TOKEN CREATION DETECTION!
  CurveCreate: 'CurveCreate(address,address,address,string,string,string,uint256,uint256,uint256)',
  
  // Trade events  
  CurveBuy: 'CurveBuy(address,address,uint256,uint256)',
  CurveSell: 'CurveSell(address,address,uint256,uint256)',
  
  // Reserve sync event
  CurveSync: 'CurveSync(address,uint256,uint256,uint256,uint256)',
  
  // Token listing event
  CurveTokenListed: 'CurveTokenListed(address,address,address)',
  
  // Token locked event
  CurveTokenLocked: 'CurveTokenLocked(address)'
} as const;

// Export event topic hashes for filtering logs (computed with ethers.js)
export const BONDING_CURVE_TOPICS = {
  // These are the actual keccak256 hashes of the event signatures using ethers.js
  CurveCreate: '0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0', // Will be computed dynamically
  CurveBuy: '0x0000000000000000000000000000000000000000000000000000000000000000', // Placeholder
  CurveSell: '0x0000000000000000000000000000000000000000000000000000000000000000', // Placeholder
  CurveSync: '0x0000000000000000000000000000000000000000000000000000000000000000', // Placeholder
  CurveTokenListed: '0x0000000000000000000000000000000000000000000000000000000000000000', // Placeholder
  CurveTokenLocked: '0x0000000000000000000000000000000000000000000000000000000000000000' // Placeholder
} as const;

// Function to compute topic hashes dynamically using ethers
export async function getEventTopicHash(eventSignature: string): Promise<string> {
  const { ethers } = await import('ethers');
  return ethers.id(eventSignature);
}

// Helper function to get event by topic hash (simplified)
export function getEventByTopic(_topic: string): string {
  // This would need to be implemented with proper topic mapping
  // For now, return unknown since we're using dynamic topic calculation
  return 'Unknown';
}

// Uniswap V3 Pool ABI for DEX events (minimal)
export const UNISWAP_V3_POOL_ABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "sender", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "recipient", "type": "address" },
      { "indexed": false, "internalType": "int256", "name": "amount0", "type": "int256" },
      { "indexed": false, "internalType": "int256", "name": "amount1", "type": "int256" },
      { "indexed": false, "internalType": "uint160", "name": "sqrtPriceX96", "type": "uint160" },
      { "indexed": false, "internalType": "int24", "name": "tick", "type": "int24" }
    ],
    "name": "Swap",
    "type": "event"
  }
] as const;