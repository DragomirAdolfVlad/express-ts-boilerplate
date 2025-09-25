/**
 * Uniswap V3 Pool ABI
 * 
 * ABI for Uniswap V3 pool swap events
 */

import { parseAbi } from 'viem';

export const UNISWAP_V3_POOL_ABI = parseAbi([
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
]);