/**
 * BigInt Scaling Utilities
 * 
 * Proper scaling for blockchain amounts with BigInt precision
 */

const TEN = BigInt(10);

/**
 * Scale down a BigInt by decimal places
 * @param amount - Raw amount as BigInt
 * @param decimals - Number of decimal places to scale down
 * @returns Scaled BigInt
 */
export function scaleDown(amount: bigint, decimals: number): bigint {
  if (decimals === 0) return amount;
  let divisor = BigInt(1);
  for (let i = 0; i < decimals; i++) {
    divisor *= TEN;
  }
  return amount / divisor;
}

/**
 * Scale up a BigInt by decimal places
 * @param amount - Human amount as BigInt
 * @param decimals - Number of decimal places to scale up
 * @returns Scaled BigInt
 */
export function scaleUp(amount: bigint, decimals: number): bigint {
  if (decimals === 0) return amount;
  let multiplier = BigInt(1);
  for (let i = 0; i < decimals; i++) {
    multiplier *= TEN;
  }
  return amount * multiplier;
}

/**
 * Convert raw wei amount to human readable number
 * @param weiAmount - Amount in wei (BigInt)
 * @param decimals - Token decimals (default 18)
 * @returns Human readable number
 */
export function weiToHuman(weiAmount: bigint, decimals: number = 18): number {
  let divisor = BigInt(1);
  for (let i = 0; i < decimals; i++) {
    divisor *= TEN;
  }
  const scaled = weiAmount / divisor;
  return Number(scaled) + Number(weiAmount % divisor) / Math.pow(10, decimals);
}

/**
 * Convert human readable number to wei BigInt
 * @param humanAmount - Human readable amount
 * @param decimals - Token decimals (default 18)
 * @returns Wei amount as BigInt
 */
export function humanToWei(humanAmount: number, decimals: number = 18): bigint {
  const factor = Math.pow(10, decimals);
  return BigInt(Math.floor(humanAmount * factor));
}

/**
 * Format BigInt amount for display
 * @param amount - Amount as BigInt
 * @param decimals - Token decimals
 * @param precision - Display precision (default 6)
 * @returns Formatted string
 */
export function formatAmount(amount: bigint, decimals: number, precision: number = 6): string {
  const human = weiToHuman(amount, decimals);
  return human.toFixed(precision);
}

/**
 * Calculate price per token in human units
 * @param wmonAmount - WMON amount in wei
 * @param tokenAmount - Token amount in wei
 * @returns Price per token in human WMON units
 */
export function calculatePrice(wmonAmount: bigint, tokenAmount: bigint): number {
  if (tokenAmount === BigInt(0)) return 0;
  
  // Both amounts are in 18 decimals for NAD.FUN
  const wmonHuman = weiToHuman(wmonAmount, 18);
  const tokenHuman = weiToHuman(tokenAmount, 18);
  
  return wmonHuman / tokenHuman;
}

/**
 * Calculate market cap
 * @param pricePerToken - Price per token in human WMON units
 * @param totalSupply - Total supply in wei
 * @param wmonPriceUsd - WMON price in USD
 * @returns Market cap in USD
 */
export function calculateMarketCap(
  pricePerToken: number,
  totalSupply: bigint,
  wmonPriceUsd: number
): number {
  const totalSupplyHuman = weiToHuman(totalSupply, 18);
  return pricePerToken * totalSupplyHuman * wmonPriceUsd;
}

/**
 * Sanity check for NAD.FUN token
 * @param metadata - Token metadata
 * @returns Validation result
 */
export function validateNadFunToken(metadata: {
  decimals: number;
  totalSupply: string;
}): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Check decimals
  if (metadata.decimals !== 18) {
    issues.push(`Expected 18 decimals, got ${metadata.decimals}`);
  }
  
  // Check total supply (should be near 1e27)
  const totalSupply = BigInt(metadata.totalSupply);
  // 1e27
  let expectedSupply = BigInt(1);
  for (let i = 0; i < 27; i++) {
    expectedSupply *= TEN;
  }
  
  // 1e24 (0.1% tolerance)
  let tolerance = BigInt(1);
  for (let i = 0; i < 24; i++) {
    tolerance *= TEN;
  }
  
  if (totalSupply < expectedSupply - tolerance || totalSupply > expectedSupply + tolerance) {
    const diff = totalSupply - expectedSupply;
    issues.push(`Total supply ${totalSupply} differs from expected 1e27 by ${diff}`);
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Log raw and scaled amounts for debugging
 */
export function logAmountComparison(
  label: string,
  rawWmon: bigint,
  rawToken: bigint,
  context?: string
): void {
  const wmonHuman = weiToHuman(rawWmon, 18);
  const tokenHuman = weiToHuman(rawToken, 18);
  const price = calculatePrice(rawWmon, rawToken);
  
  console.log(`[${label}] ${context || ''}`);
  console.log(`  Raw WMON: ${rawWmon.toString()}`);
  console.log(`  Raw Token: ${rawToken.toString()}`);
  console.log(`  Human WMON: ${wmonHuman.toFixed(6)}`);
  console.log(`  Human Token: ${tokenHuman.toFixed(0)}`);
  console.log(`  Price: ${price.toFixed(12)} WMON/token`);
}

/**
 * Detect suspicious price movements
 */
export function detectSuspiciousPrice(
  currentPrice: number,
  previousPrice: number,
  maxChangePercent: number = 50
): boolean {
  if (previousPrice === 0) return false;
  
  const changePercent = Math.abs((currentPrice - previousPrice) / previousPrice) * 100;
  return changePercent > maxChangePercent;
}

/**
 * Validate reserves are positive
 */
export function validateReserves(reserves: {
  reserve1: bigint;
  reserve2: bigint;
  reserve3: bigint;
  reserve4: bigint;
}): string[] {
  const issues: string[] = [];
  
  if (reserves.reserve1 < BigInt(0)) issues.push('Reserve1 is negative');
  if (reserves.reserve2 < BigInt(0)) issues.push('Reserve2 is negative');
  if (reserves.reserve3 < BigInt(0)) issues.push('Reserve3 is negative');
  if (reserves.reserve4 < BigInt(0)) issues.push('Reserve4 is negative');
  
  return issues;
}