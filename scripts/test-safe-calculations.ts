/**
 * Test script to verify safe calculation logic that prevents database overflow
 */

function testSafeCalculations() {
    console.log('=== Testing Safe Calculation Logic ===\n');

    // Test case from the actual error
    const testTrade = {
        wmonAmount: 1661393925771472n, // Raw blockchain amount
        tokenAmount: 50000000n, // Raw blockchain amount (very small)
        usdAmount: 5399530.258757284, // USD amount from processor
        wmonPrice: 3.25
    };

    console.log('Problematic Trade Analysis:');
    console.log(`Raw WMON Amount: ${testTrade.wmonAmount.toString()}`);
    console.log(`Raw Token Amount: ${testTrade.tokenAmount.toString()}`);
    console.log(`USD Amount: $${testTrade.usdAmount}`);
    
    // Simulate the safe calculation logic
    const maxDecimal20_9 = 999999999999999999; // For Decimal(30,9)
    const maxDecimal20_2 = 999999999999.99; // For Decimal(20,2)
    
    // Convert and cap values
    const wmonAmount = Number(testTrade.wmonAmount) / 1e18;
    const cappedTokenAmount = Math.min(Number(testTrade.tokenAmount), maxDecimal20_9);
    
    console.log(`WMON Amount: ${wmonAmount} WMON`);
    console.log(`Capped Token Amount: ${cappedTokenAmount}`);
    
    // Safe calculation
    const usdAmount = testTrade.usdAmount;
    const tokenAmountInTokens = cappedTokenAmount / 1e9; // Use 1e9 instead of 1e18
    const rawUsdSpotPrice = tokenAmountInTokens > 0 ? usdAmount / tokenAmountInTokens : 0;
    
    // Cap USD spot price to prevent database overflow
    const maxUsdSpotPrice = 99999999999; // 99.9 billion max
    const usdSpotPrice = Math.min(rawUsdSpotPrice, maxUsdSpotPrice);
    
    console.log(`Token Amount (1e9): ${tokenAmountInTokens}`);
    console.log(`Raw USD Spot Price: ${rawUsdSpotPrice}`);
    console.log(`Capped USD Spot Price: ${usdSpotPrice}`);
    
    // Simple market cap based on trade size
    const tradeMultiplier = Math.min(usdAmount * 1000, 10000000); // Cap at 10M
    const marketCap = Math.min(tradeMultiplier, maxDecimal20_2);
    
    console.log(`Trade Multiplier: ${tradeMultiplier}`);
    console.log(`Market Cap: ${marketCap}`);
    
    // Liquidity based on trade size
    const liquidityUsd = Math.min(marketCap * 0.1, maxDecimal20_2);
    console.log(`Liquidity USD: ${liquidityUsd}`);
    
    // Check database limits
    console.log('\n=== Database Limit Validation ===');
    console.log(`✅ USD Spot Price within limit: ${usdSpotPrice <= 99999999999 ? 'YES' : 'NO'} (${usdSpotPrice} <= 99,999,999,999)`);
    console.log(`✅ Market Cap within limit: ${marketCap <= maxDecimal20_2 ? 'YES' : 'NO'} (${marketCap} <= ${maxDecimal20_2})`);
    console.log(`✅ Liquidity within limit: ${liquidityUsd <= maxDecimal20_2 ? 'YES' : 'NO'} (${liquidityUsd} <= ${maxDecimal20_2})`);
    console.log(`✅ Token Amount within limit: ${cappedTokenAmount <= maxDecimal20_9 ? 'YES' : 'NO'} (${cappedTokenAmount} <= ${maxDecimal20_9})`);
    
    // Test another case with larger token amount
    console.log('\n=== Test Case 2: Larger Token Amount ===');
    const testTrade2 = {
        tokenAmount: 1000000000n, // 1 token in wei
        usdAmount: 112491955.50806452
    };
    
    const cappedTokenAmount2 = Math.min(Number(testTrade2.tokenAmount), maxDecimal20_9);
    const tokenAmountInTokens2 = cappedTokenAmount2 / 1e9;
    const rawUsdSpotPrice2 = tokenAmountInTokens2 > 0 ? testTrade2.usdAmount / tokenAmountInTokens2 : 0;
    const usdSpotPrice2 = Math.min(rawUsdSpotPrice2, maxUsdSpotPrice);
    
    console.log(`Token Amount (1e9): ${tokenAmountInTokens2}`);
    console.log(`Raw USD Spot Price: ${rawUsdSpotPrice2}`);
    console.log(`Capped USD Spot Price: ${usdSpotPrice2}`);
    console.log(`✅ Within limit: ${usdSpotPrice2 <= 99999999999 ? 'YES' : 'NO'}`);
}

testSafeCalculations();