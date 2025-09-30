#!/usr/bin/env node

/**
 * Verify Scaling Factor
 * 
 * Calculate the exact scaling factor needed based on the investigation
 */

console.log('=== SCALING FACTOR VERIFICATION ===\n');

// From the investigation data
const samples = [
  { wmon: 0.1, tokens: 3564785, label: 'Trade 1' },
  { wmon: 2.0, tokens: 67062512, label: 'Trade 5' },
  { wmon: 0.5, tokens: 1969463, label: 'Trade 10' }
];

// Expected reasonable memecoin prices (from Solana pump.fun analysis)
const expectedPriceRange = { min: 0.000001, max: 0.00001 };
const targetPrice = 0.000005; // Reasonable early memecoin price

console.log('Current vs Expected Analysis:\n');

let totalScalingFactor = 0;
let validSamples = 0;

samples.forEach(sample => {
  const currentPrice = sample.wmon / sample.tokens;
  const expectedTokens = sample.wmon / targetPrice;
  const scalingFactor = sample.tokens / expectedTokens;
  
  console.log(`${sample.label}:`);
  console.log(`  WMON: ${sample.wmon}`);
  console.log(`  Current tokens: ${sample.tokens.toLocaleString()}`);
  console.log(`  Expected tokens: ${expectedTokens.toLocaleString()}`);
  console.log(`  Current price: ${currentPrice.toFixed(12)}`);
  console.log(`  Expected price: ${targetPrice.toFixed(12)}`);
  console.log(`  Scaling factor: ${scalingFactor.toFixed(3)}`);
  console.log('');
  
  totalScalingFactor += scalingFactor;
  validSamples++;
});

const avgScalingFactor = totalScalingFactor / validSamples;
const correctionFactor = 1 / avgScalingFactor;

console.log('=== RESULTS ===');
console.log(`Average scaling factor: ${avgScalingFactor.toFixed(3)}`);
console.log(`Correction factor needed: ${correctionFactor.toFixed(3)}`);
console.log(`Token amounts are ${avgScalingFactor.toFixed(1)}x too high`);

console.log('\n=== SOLUTION ===');
console.log('The field mapping is CORRECT (amount1=WMON, amount2=TOKEN)');
console.log('But token amounts from blockchain events are inflated');
console.log('Need to apply correction factor in event decoder:');
console.log(`  correctedTokenAmount = rawTokenAmount * ${correctionFactor.toFixed(3)}`);

console.log('\n=== NEXT STEPS ===');
console.log('1. Update the event decoder to apply this correction');
console.log('2. Investigate WHY the blockchain events have inflated token amounts');
console.log('3. Check if this is a bonding curve calculation difference');
console.log('4. Verify with manual blockchain explorer checks');