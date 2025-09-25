import type { Hex, Log } from 'viem';
import { decodeEventLog } from 'viem';
import { UNIV3_POOL_ABI } from './abis/UniswapV3Pool';

export type Decoded =
  | { type: 'curve_state_update'; token: string; reserve1: bigint; reserve2: bigint; reserve3: bigint; reserve4: bigint; raw: Log }
  | { type: 'curve_trade'; trader: string; token: string; amount1: bigint; amount2: bigint; raw: Log }
  | { type: 'curve_token_event'; token: string; raw: Log }
  | { type: 'curve_pair_event'; token: string; pool: string; raw: Log }
  | { type: 'dex_swap'; pool: string; sender: string; recipient: string; amount0: bigint; amount1: bigint; tick: number; raw: Log };

export function decodeCurveLog(log: Log): Decoded | null {
  try {
    const topic0 = log.topics?.[0];
    if (!topic0) return null;

    // Direct topic hash matching for known BondingCurve events
    switch (topic0) {
      // StateUpdate: 0xfd4bb47bd45abdbdb2ecd61052c9571773f9cde876e2a7745f488c20b30ab10a
      case '0xfd4bb47bd45abdbdb2ecd61052c9571773f9cde876e2a7745f488c20b30ab10a': {
        // Decode: indexed address + 4 uint256 in data
        const token = log.topics?.[1]?.slice(26).toLowerCase(); // Remove padding
        if (!token || !log.data) return null;
        
        // Parse 4 uint256 values from data (each is 32 bytes)
        const data = log.data.slice(2); // Remove 0x
        const reserve1 = BigInt('0x' + data.slice(0, 64));
        const reserve2 = BigInt('0x' + data.slice(64, 128));
        const reserve3 = BigInt('0x' + data.slice(128, 192));
        const reserve4 = BigInt('0x' + data.slice(192, 256));
        
        return { 
          type: 'curve_state_update', 
          token: '0x' + token, 
          reserve1, 
          reserve2, 
          reserve3, 
          reserve4, 
          raw: log 
        };
      }
      
      // Trade: 0x00a7ba871905cb955432583640b5c9fc6bdd27d36884ab2b5420839224638862
      case '0x00a7ba871905cb955432583640b5c9fc6bdd27d36884ab2b5420839224638862': {
        // Decode: 2 indexed addresses + 2 uint256 in data
        const trader = log.topics?.[1]?.slice(26).toLowerCase();
        const token = log.topics?.[2]?.slice(26).toLowerCase();
        if (!trader || !token || !log.data) return null;
        
        // Parse 2 uint256 values from data
        const data = log.data.slice(2); // Remove 0x
        const amount1 = BigInt('0x' + data.slice(0, 64));
        const amount2 = BigInt('0x' + data.slice(64, 128));
        
        return { 
          type: 'curve_trade', 
          trader: '0x' + trader, 
          token: '0x' + token, 
          amount1, 
          amount2, 
          raw: log 
        };
      }
      
      // TokenEvent: 0xa9aaee0c81575bef307b11099af1a555ba16588e3b35cf930ee8c08f979b1a4a  
      case '0xa9aaee0c81575bef307b11099af1a555ba16588e3b35cf930ee8c08f979b1a4a': {
        // Decode: 1 indexed address + no data
        const token = log.topics?.[1]?.slice(26).toLowerCase();
        if (!token) return null;
        
        return { 
          type: 'curve_token_event', 
          token: '0x' + token, 
          raw: log 
        };
      }
      
      // PairEvent: 0xaa090437ef524cee1d4e0825c0caff2203af3b38ab39624d8ff7fab67e219704
      case '0xaa090437ef524cee1d4e0825c0caff2203af3b38ab39624d8ff7fab67e219704': {
        // Decode: 2 indexed addresses + no data
        const token = log.topics?.[1]?.slice(26).toLowerCase();
        const pool = log.topics?.[2]?.slice(26).toLowerCase();
        if (!token || !pool) return null;
        
        return { 
          type: 'curve_pair_event', 
          token: '0x' + token, 
          pool: '0x' + pool, 
          raw: log 
        };
      }
      
      default:
        return null;
    }
  } catch (error) {
    console.error('[decode] Error decoding curve log:', error);
    return null;
  }
}

export function decodePoolLog(log: Log): Decoded | null {
  try {
    const out = decodeEventLog({
      abi: UNIV3_POOL_ABI,
      data: log.data as Hex,
      topics: log.topics as [Hex, ...Hex[]]
    });

    if (out.eventName === 'Swap') {
      const { sender, recipient, amount0, amount1, tick } = out.args as any;
      return {
        type: 'dex_swap',
        pool: log.address,
        sender,
        recipient,
        amount0,
        amount1,
        tick,
        raw: log
      };
    }
    return null;
  } catch {
    return null;
  }
}