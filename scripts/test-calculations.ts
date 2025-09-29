/**
 * Test script to verify the corrected calculation logic
 */

// Simulate the corrected calculation logic
function testCalculations() {
    console.log('=== Testing Corrected Calculation Logic ===\n');

    // Test case 1: Small trade
    const testTrade1 = {
        wmonAmount: 3564784687707641n, // ~0.0036 WMON
        tokenAmount: 100000000n, // 0.1 tokens  
        wmonPrice: 3.25 // $3.25 per WMON
    };

    console.log('Test 1: Small Trade');
    console.log(`WMON Amount: ${Number(testTrade1.wmonAmount) / 1e18} WMON`);
    console.log(`Token Amount (18 decimals): ${Number(testTrade1.tokenAmount) / 1e18} tokens`);
    console.log(`Token Amount (9 decimals): ${Number(testTrade1.tokenAmount) / 1e9} tokens`);
    console.log(`Token Amount (6 decimals): ${Number(testTrade1.tokenAmount) / 1e6} tokens`);
    
    const usdAmount1 = (Number(testTrade1.wmonAmount) / 1e18) * testTrade1.wmonPrice;
    // Try different decimal assumptions for token amount
    const tokenAmount18 = Number(testTrade1.tokenAmount) / 1e18;
    const tokenAmount9 = Number(testTrade1.tokenAmount) / 1e9;
    const tokenAmount6 = Number(testTrade1.tokenAmount) / 1e6;
    
    const usdSpotPrice18 = tokenAmount18 > 0 ? usdAmount1 / tokenAmount18 : 0;
    const usdSpotPrice9 = tokenAmount9 > 0 ? usdAmount1 / tokenAmount9 : 0;
    const usdSpotPrice6 = tokenAmount6 > 0 ? usdAmount1 / tokenAmount6 : 0;
    const marketCap1 = Math.min(usdSpotPrice1 * 100000000, 999999999999.99); // 100M supply, capped
    const liquidityUsd1 = Math.min(marketCap1 * 0.08, 999999999999.99);
    
    console.log(`USD Amount: $${usdAmount1.toFixed(2)}`);
    console.log(`USD Spot Price: $${usdSpotPrice1.toFixed(8)}`);
    console.log(`Market Cap: $${marketCap1.toFixed(2)}`);
    console.log(`Liquidity USD: $${liquidityUsd1.toFixed(2)}`);
    console.log('');

    // Test case 2: Larger trade
    const testTrade2 = {
        wmonAmount: 10623764267326732n, // ~0.0106 WMON
        tokenAmount: 300000000n, // 0.3 tokens
        wmonPrice: 3.25
    };

    console.log('Test 2: Larger Trade');
    console.log(`WMON Amount: ${Number(testTrade2.wmonAmount) / 1e18} WMON`);
    console.log(`Token Amount: ${Number(testTrade2.tokenAmount) / 1e18} tokens`);
    
    const usdAmount2 = (Number(testTrade2.wmonAmount) / 1e18) * testTrade2.wmonPrice;
    const usdSpotPrice2 = usdAmount2 / (Number(testTrade2.tokenAmount) / 1e18);
    const marketCap2 = Math.min(usdSpotPrice2 * 100000000, 999999999999.99);
    const liquidityUsd2 = Math.min(marketCap2 * 0.08, 999999999999.99);
    
    console.log(`USD Amount: $${usdAmount2.toFixed(2)}`);
    console.log(`USD Spot Price: $${usdSpotPrice2.toFixed(8)}`);
    console.log(`Market Cap: $${marketCap2.toFixed(2)}`);
    console.log(`Liquidity USD: $${liquidityUsd2.toFixed(2)}`);
    console.log('');

    // Test reserve conversion
    console.log('Test 3: Reserve Conversion');
    const testReserves = {
        reserve1: BigInt(1000000000) * BigInt(1e18), // 1B tokens
        reserve2: BigInt(30) * BigInt(1e18), // 30 WMON
        reserve3: BigInt(100000000), // 0.1 tokens
        reserve4: BigInt(3564784687707641) // ~0.0036 WMON
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

    console.log('Original reserves (BigInt):');
    console.log(`Reserve1: ${testReserves.reserve1.toString()}`);
    console.log(`Reserve2: ${testReserves.reserve2.toString()}`);
    console.log(`Reserve3: ${testReserves.reserve3.toString()}`);
    console.log(`Reserve4: ${testReserves.reserve4.toString()}`);
    
    console.log('\nConverted reserves (human-readable):');
    console.log(`Reserve1: ${bigIntToNumber(testReserves.reserve1, 18)}`);
    console.log(`Reserve2: ${bigIntToNumber(testReserves.reserve2, 18)}`);
    console.log(`Reserve3: ${bigIntToNumber(testReserves.reserve3, 18)}`);
    console.log(`Reserve4: ${bigIntToNumber(testReserves.reserve4, 18)}`);

    // Test curve progress
    const reserve1Num = bigIntToNumber(testReserves.reserve1, 18);
    const reserve2Num = bigIntToNumber(testReserves.reserve2, 18);
    const reserve3Num = bigIntToNumber(testReserves.reserve3, 18);
    const reserve4Num = bigIntToNumber(testReserves.reserve4, 18);
    
    const totalReserves = reserve1Num + reserve2Num + reserve3Num + reserve4Num;
    const realReserves = reserve3Num + reserve4Num;
    const progress = Math.min(realReserves / totalReserves, 1.0);
    const curveProgress = Math.round(progress * 10000) / 100;
    
    console.log(`\nCurve Progress: ${curveProgress}%`);
}

testCalculations();