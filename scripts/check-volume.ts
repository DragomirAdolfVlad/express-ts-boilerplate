import { PrismaClient } from '@prisma/client';

async function checkVolume() {
  const prisma = new PrismaClient();
  
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const result = await prisma.monadTokenTrade.aggregate({
    _sum: { usdAmount: true, wmonAmount: true },
    where: { timestamp: { gte: oneDayAgo } }
  });
  
  console.log('24h Volume (USD):', result._sum.usdAmount);
  console.log('24h Volume (WMON):', result._sum.wmonAmount);
  
  // Check individual trades
  const trades = await prisma.monadTokenTrade.findMany({
    where: { timestamp: { gte: oneDayAgo } },
    select: { wmonAmount: true, usdAmount: true, timestamp: true, isBuy: true }
  });
  
  console.log('\nRecent trades:');
  trades.forEach(t => {
    console.log(`  ${t.isBuy ? 'BUY' : 'SELL'}: ${t.wmonAmount} WMON, $${t.usdAmount || 0} - ${t.timestamp}`);
  });
  
  await prisma.$disconnect();
}

checkVolume();
