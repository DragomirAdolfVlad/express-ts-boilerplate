/**
 * Test script to verify the corrected calculation logic
 * Based on the exact fixes provided in the analysis
 */

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

function testCorrectedCalculations() {
    console.log('=== Testing CORRECTED Calculation Logic ===\n');

    // Test case from actual problematic row 4988
    const testTrade = {
        wmonAmount: 3564784687707641n, // Raw wei amount
        tokenAmount: 100000000000000000n, // Raw wei amount (0.1 tokens)
        usdAmount: 11585550.24, // This was wrong due to 1e9 error
        reserves: {
            reserve1: 3564784687707641n, // realMonReserve
            reserve2: 100000000000000000n, // realTokenReserve  
            reserve3: BigInt(432) * BigInt(1e18), // virtualMonReserve
            reserve4: BigInt(1000000000) * BigInt(1e18) // virtualTokenReserve
        }
    };

    console.log('=== BEFORE (Wrong 1e9 scaling) ===');
    const wrongWmon = bigIntToNumber(testTrade.wmonAmount, 9);
    const wrongToken = bigIntToNumber(testTrade.tokenAmount, 9);
    console.log(`Wrong WMON: ${wrongWmon} (should be ~0.0036)`);
    console.log(`Wrong Token: ${wrongToken} (should be ~0.1)`);
    console.log(`Wrong USD from processor: ${wrongWmon * 3.25} (inflated by 1e9)`);

    console.log('\n=== AFTER (Correct 1e18 scaling) ===');
    
    // --- CORRECT DECIMAL SCALING (18) -------------------------------------------
    const wmonHuman = bigIntToNumber(testTrade.wmonAmount, 18);   // WMON in MON
    const tokenHuman = bigIntToNumber(testTrade.tokenAmount, 18);  // TOK in TOK units
    
    console.log(`Correct WMON: ${wmonHuman} MON`);
    console.log(`Correct Token: ${tokenHuman} tokens`);
    
    // Correct USD amount (should be much smaller)
    const correctUsdAmount = wmonHuman * 3.25; // ~$0.012
    console.log(`Correct USD: $${correctUsdAmount.toFixed(6)}`);
    
    // Derive WMON/USD actually used on this trade
    const wmonUsd = wmonHuman > 0 ? (correctUsdAmount / wmonHuman) : 0;
    console.log(`WMON/USD rate: $${wmonUsd}`);
    
    // MON-per-token at execution (human)
    const priceMonPerToken = tokenHuman > 0 ? (wmonHuman / tokenHuman) : 0;
    console.log(`Price (MON per token): ${priceMonPerToken}`);
    
    // USD spot per token from this trade
    const usdSpotPrice = tokenHuman > 0 ? (correctUsdAmount / tokenHuman) : 0;
    console.log(`USD spot price: $${usdSpotPrice.toFixed(6)} per token`);
    
    // --- MARKET CAP & LIQUIDITY FROM CURVE STATE ----------
    const realMonReserve = bigIntToNumber(testTrade.reserves.reserve1, 18); // MON in curve
    const realTokenReserve = bigIntToNumber(testTrade.reserves.reserve2, 18); // TOK sold
    
    console.log(`Real MON Reserve: ${realMonReserve} MON`);
    console.log(`Real Token Reserve: ${realTokenReserve} tokens`);
    
    // circulating supply on curve = realTokenReserve (Nad.fun model)
    const circulating = realTokenReserve;
    console.log(`Circulating supply: ${circulating} tokens`);
    
    // market cap = price (USD/TOK) * circulating (TOK)
    const marketCap = usdSpotPrice * circulating;
    console.log(`Market cap: $${marketCap.toFixed(2)}`);
    
    // liquidity on curve ≈ real MON reserve * WMON/USD (this is the cash side)
    const liquidityUsd = realMonReserve * wmonUsd;
    console.log(`Liquidity USD: $${liquidityUsd.toFixed(6)}`);
    
    console.log('\n=== COMPARISON ===');
    console.log(`❌ Old USD Amount: $${testTrade.usdAmount.toLocaleString()}`);
    console.log(`✅ New USD Amount: $${correctUsdAmount.toFixed(6)}`);
    console.log(`Reduction factor: ${(testTrade.usdAmount / correctUsdAmount).toExponential(2)}`);
    
    console.log(`❌ Old would give spot price: $${(testTrade.usdAmount / tokenHuman).toLocaleString()}/token`);
    console.log(`✅ New spot price: $${usdSpotPrice.toFixed(6)}/token`);
    
    console.log('\n=== VALIDATION ===');
    console.log(`✅ WMON amount reasonable: ${wmonHuman < 1 ? 'YES' : 'NO'} (${wmonHuman} MON)`);
    console.log(`✅ Token amount reasonable: ${tokenHuman < 1 ? 'YES' : 'NO'} (${tokenHuman} tokens)`);
    console.log(`✅ USD amount reasonable: ${correctUsdAmount < 100 ? 'YES' : 'NO'} ($${correctUsdAmount.toFixed(6)})`);
    console.log(`✅ Spot price reasonable: ${usdSpotPrice < 1 ? 'YES' : 'NO'} ($${usdSpotPrice.toFixed(6)}/token)`);
    console.log(`✅ Market cap reasonable: ${marketCap < 1000000 ? 'YES' : 'NO'} ($${marketCap.toFixed(2)})`);
}

testCorrectedCalculations();