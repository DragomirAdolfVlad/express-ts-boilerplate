/**
 * Bonding Curve Resolver Utility
 * 
 * Automatically resolves bonding curve addresses from transaction receipts
 */
import { JsonRpcProvider } from 'ethers';
import { PrismaClient } from '@prisma/client';

export class BondingCurveResolver {
  constructor(
    private provider: JsonRpcProvider,
    private prisma: PrismaClient
  ) {}

  /**
   * Set bonding curve from trade receipt if not already set
   */
  async ensureBondingCurveFromTrade(
    tokenAddress: string,
    signature: string,
    logIndex: number
  ): Promise<string | null> {
    try {
      // Check if token already has bonding curve
      const token = await this.prisma.monadLaunchedToken.findUnique({
        where: { token: tokenAddress },
        select: { bondingCurve: true }
      });

      // If already has valid bonding curve (not hardcoded), return it
      if (token?.bondingCurve && 
          token.bondingCurve !== 'unknown' && 
          token.bondingCurve !== '' &&
          token.bondingCurve !== null &&
          token.bondingCurve !== '0x52D34d8536350Cd997bCBD0b9E9d722452f341F5' &&
          token.bondingCurve !== '0x52d34d8536350cd997bcbd0b9e9d722452f341f5') {
        return token.bondingCurve;
      }

      // Get bonding curve from transaction receipt
      const receipt = await this.provider.getTransactionReceipt(signature);
      
      if (!receipt || !receipt.logs || receipt.logs.length <= logIndex) {
        console.warn(`Invalid receipt or log index for token ${tokenAddress}`);
        return null;
      }

      const bondingCurve = receipt.logs[logIndex]?.address;

      if (!bondingCurve || bondingCurve === '0x0000000000000000000000000000000000000000') {
        console.warn(`Invalid bonding curve address for token ${tokenAddress}`);
        return null;
      }

      // Update token with bonding curve
      await this.prisma.monadLaunchedToken.upsert({
        where: { token: tokenAddress },
        create: {
          token: tokenAddress,
          bondingCurve,
          platform: 'monad',
          signature: 'unknown', // Will be updated when launch data is available
          creator: 'unknown',
          blockNumber: 'unknown',
          blockId: 'unknown',
          timestamp: new Date(),
          commitState: 'verified'
        },
        update: {
          bondingCurve
        }
      });

      console.log(`✅ Set bonding curve for ${tokenAddress}: ${bondingCurve}`);
      return bondingCurve;

    } catch (error) {
      console.error(`Error resolving bonding curve for ${tokenAddress}:`, error);
      return null;
    }
  }

  /**
   * Backfill bonding curves for all tokens missing them
   */
  async backfillAllBondingCurves(): Promise<void> {
    const tokensNeedingCurve = await this.prisma.monadLaunchedToken.findMany({
      where: { 
        OR: [
          { bondingCurve: 'unknown' },
          { bondingCurve: '' }
        ]
      },
      select: { token: true }
    });

    console.log(`Backfilling bonding curves for ${tokensNeedingCurve.length} tokens`);

    for (const { token } of tokensNeedingCurve) {
      const trade = await this.prisma.monadTokenTrade.findFirst({
        where: { tokenAddress: token },
        orderBy: { timestamp: 'asc' },
        select: { signature: true, logIndex: true }
      });

      if (trade?.signature && trade.logIndex !== null) {
        await this.ensureBondingCurveFromTrade(token, trade.signature, trade.logIndex);
        // Small delay to avoid overwhelming RPC
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }
}