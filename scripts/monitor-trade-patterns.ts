/**
 * Monitor Trade Patterns
 * 
 * Monitors incoming trades to verify BUY/SELL detection is working correctly
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function monitorTradePatterns() {
    console.log('📊 Monitoring Trade Patterns');
    console.log('=' .repeat(80));
    console.log('Press Ctrl+C to stop monitoring...');
    console.log();

    let lastTradeId = 0;

    const checkNewTrades = async () => {
        try {
            const newTrades = await prisma.monadTokenTrade.findMany({
                where: {
                    id: {
                        gt: lastTradeId
                    }
                },
                orderBy: { id: 'asc' },
                take: 10,
                select: {
                    id: true,
                    tokenAddress: true,
                    isBuy: true,
                    wmonAmount: true,
                    tokenAmount: true,
                    signature: true,
                    trader: true,
                    createdAt: true
                }
            });

            if (newTrades.length > 0) {
                console.log(`🔔 ${newTrades.length} new trades detected:`);
                
                for (const trade of newTrades) {
                    const wmonAmount = parseFloat(trade.wmonAmount.toString());
                    const tokenAmount = parseFloat(trade.tokenAmount.toString());
                    const ratio = tokenAmount / wmonAmount;
                    
                    console.log(`   ${trade.isBuy ? '🟢 BUY' : '🔴 SELL'} - ${trade.tokenAddress.slice(0, 8)}...`);
                    console.log(`      WMON: ${wmonAmount.toFixed(6)}, Tokens: ${tokenAmount.toFixed(0)}`);
                    console.log(`      Ratio: ${ratio.toFixed(0)} tokens/WMON`);
                    console.log(`      TX: ${trade.signature?.slice(0, 16)}...`);
                    console.log(`      Time: ${trade.createdAt.toISOString()}`);
                    console.log();
                    
                    lastTradeId = Math.max(lastTradeId, trade.id);
                }

                // Show current statistics
                const totalTrades = await prisma.monadTokenTrade.count();
                const buyTrades = await prisma.monadTokenTrade.count({ where: { isBuy: true } });
                const sellTrades = totalTrades - buyTrades;
                
                console.log(`📈 Current Stats: ${totalTrades} total (${buyTrades} BUY, ${sellTrades} SELL)`);
                console.log(`   BUY: ${((buyTrades / totalTrades) * 100).toFixed(1)}%, SELL: ${((sellTrades / totalTrades) * 100).toFixed(1)}%`);
                console.log();
            }
        } catch (error) {
            console.error('❌ Error checking trades:', error);
        }
    };

    // Initial check
    await checkNewTrades();

    // Check every 5 seconds
    const interval = setInterval(checkNewTrades, 5000);

    // Cleanup on exit
    process.on('SIGINT', () => {
        console.log('\n🛑 Stopping monitor...');
        clearInterval(interval);
        prisma.$disconnect();
        process.exit(0);
    });
}

monitorTradePatterns().catch(console.error);