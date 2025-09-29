/**
 * Test script to verify nad.fun bonding curve calculations
 */

// Simulate nad.fun bonding curve calculations
function testNadFunCalculations() {
    console.log('=== Testing nad.fun Bonding Curve Calculations ===\n');

    // Test case based on your actual data
    const testTrade = {
        wmonAmount: 3564784687707641n, // Raw blockchain amount
        tokenAmount: 100000000000000000n, // Raw blockchain amount (0.1 tokens in 18 decimals)
        wmonPrice: 3.25 // $3.25 per WMON
    };

    console.log('nad.fun Trade Analysis:');
    console.log(`Raw WMON Amount: ${testTrade.wmonAmount.toString()}`);
    console.log(`Raw Token Amount: ${testTrade.tokenAmount.toString()}`);
    
    // Convert to human readable
    const wmonAmountInTokens = Number(testTrade.wmonAmount) / 1e18;
    const tokenAmountInTokens = Number(testTrade.tokenAmount) / 1e18;
    
    console.log(`WMON Amount: ${wmonAmountInTokens} WMON`);
    console.log(`Token Amount: ${tokenAmountInTokens} tokens`);
    
    // Calculate USD value
    const usdAmount = wmonAmountInTokens * testTrade.wmonPrice;
    console.log(`USD Amount: $${usdAmount.toFixed(6)}`);
    
    // Calculate price per token
    const usdSpotPrice = tokenAmountInTokens > 0 ? usdAmount / tokenAmountInTokens : 0;
    console.log(`USD Spot Price: $${usdSpotPrice.toFixed(8)} per token`);
    
    // nad.fun market cap (use circulating supply estimate)
    const estimatedCirculatingSupply = Math.max(tokenAmountInTokens * 1000, 1000000); // At least 1M tokens
    const marketCap = usdSpotPrice * estimatedCirculatingSupply;
    console.log(`Market Cap: $${marketCap.toFixed(2)} (${estimatedCirculatingSupply} circulating supply)`);
    
    // Liquidity estimation (5% of market cap)
    const liquidityUsd = marketCap * 0.05;
    console.log(`Liquidity USD: $${liquidityUsd.toFixed(2)}`);
    
    console.log('\n=== Reserve Analysis ===');
    
    // nad.fun reserve structure: (realMonReserve, realTokenReserve, virtualMonReserve, virtualTokenReserve)
    const reserves = {
        realMonReserve: testTrade.wmonAmount, // Actual MON in curve
        realTokenReserve: testTrade.tokenAmount, // Actual tokens sold
        virtualMonReserve: BigInt(432) * BigInt(1e18), // 432 MON migration threshold
        virtualTokenReserve: BigInt(1000000000) * BigInt(1e18) // 1B token supply
    };
    
    function bigIntToNumber(value: bigint, decimals: number): number {
        const stringValue = value.toString();
        if (stringValue.length <= decimals) {
            const decimalPart = stringValue.padStart(decimals, '0');
            return parseFloat(`0.${decimalPart}`);
        } else {
            const integerPart = stringValue.slice(0, -decimals) || '0';
            const decimalPart = stringValue.slice(-decimals);
            return parseFloat(`${integerPart}.${decimalPart}`);
        }
    }
    
    const realMonReserve = bigIntToNumber(reserves.realMonReserve, 18);
    const realTokenReserve = bigIntToNumber(reserves.realTokenReserve, 18);
    const virtualMonReserve = bigIntToNumber(reserves.virtualMonReserve, 18);
    const virtualTokenReserve = bigIntToNumber(reserves.virtualTokenReserve, 18);
    
    console.log(`Real MON Reserve: ${realMonReserve} MON`);
    console.log(`Real Token Reserve: ${realTokenReserve} tokens`);
    console.log(`Virtual MON Reserve: ${virtualMonReserve} MON`);
    console.log(`Virtual Token Reserve: ${virtualTokenReserve} tokens`);
    
    // Calculate curve progress (corrected)
    const tokensSold = realTokenReserve; // Tokens actually sold from curve
    const migrationThreshold = virtualTokenReserve * 0.8; // 80% of supply
    const progress = Math.min(tokensSold / migrationThreshold, 1.0);
    const curveProgress = Math.round(progress * 10000) / 100;
    
    console.log(`Tokens Sold: ${tokensSold}`);
    console.log(`Migration Threshold: ${migrationThreshold} (80% of supply)`);
    console.log(`Curve Progress: ${curveProgress}%`);
    
    // Check if values are reasonable
    console.log('\n=== Validation ===');
    console.log(`✅ USD Amount reasonable: ${usdAmount < 1000 ? 'YES' : 'NO'} ($${usdAmount.toFixed(6)})`);
    console.log(`✅ Price per token reasonable: ${usdSpotPrice < 1 ? 'YES' : 'NO'} ($${usdSpotPrice.toFixed(8)})`);
    console.log(`✅ Market cap reasonable: ${marketCap < 1000000 ? 'YES' : 'NO'} ($${marketCap.toFixed(2)})`);
    console.log(`✅ Curve progress reasonable: ${curveProgress < 100 ? 'YES' : 'NO'} (${curveProgress}%)`);
}

testNadFunCalculations();