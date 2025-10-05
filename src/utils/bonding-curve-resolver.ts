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
   * DEPRECATED - Only used for existing tokens, new tokens come from CurveCreate events
   */
  async ensureBondingCurveFromTrade(
    tokenAddress: string,
    _signature: string,
    _logIndex: number
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

      // DEPRECATED: Don't create new tokens from trades anymore
      console.log(`⚠️  DEPRECATED: ensureBondingCurveFromTrade called for ${tokenAddress}`);
      console.log(`   This method is deprecated - tokens should only be created from CurveCreate events`);
      
      return null;

    } catch (error) {
      console.error(`Error in deprecated bonding curve resolver for ${tokenAddress}:`, error);
      return null;
    }
  }

  /**
   * Extract bonding curve address from transaction receipt by analyzing CurveCreate events
   */
  // @ts-ignore - Method kept for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async extractBondingCurveFromReceipt(txHash: string, tokenAddress: string): Promise<string | null> {
    try {
      // Get transaction receipt
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      if (!receipt || !receipt.logs) {
        console.warn(`No receipt or logs found for transaction ${txHash}`);
        return null;
      }

      // Import ethers and ABI for event decoding
      const { ethers } = await import('ethers');
      const { BONDING_CURVE_ABI, getEventTopicHash, BONDING_CURVE_EVENTS } = await import('../infrastructure/blockchain/abis/official-nad-fun.abi');
      
      // Get CurveCreate event topic hash
      const curveCreateTopic = await getEventTopicHash(BONDING_CURVE_EVENTS.CurveCreate);
      
      // Create interface for decoding
      const iface = new ethers.Interface(BONDING_CURVE_ABI);

      // Look for CurveCreate events in the transaction logs
      for (const log of receipt.logs) {
        if (log.topics[0] === curveCreateTopic) {
          try {
            // Decode the CurveCreate event
            const decoded = iface.parseLog({
              topics: log.topics,
              data: log.data
            });

            if (decoded && decoded.name === 'CurveCreate') {
              // Extract token and pool addresses from the event
              const { token: eventTokenAddress, pool: bondingCurveAddress } = decoded.args;
              
              // Verify this is the correct token
              if (eventTokenAddress.toLowerCase() === tokenAddress.toLowerCase()) {
                console.log(`🔍 Found CurveCreate event: Token ${tokenAddress} -> Pool ${bondingCurveAddress}`);
                return bondingCurveAddress;
              }
            }
          } catch (decodeError) {
            // Skip logs that can't be decoded as CurveCreate events
            continue;
          }
        }
      }

      // Fallback: Look for the most active contract in the transaction (likely the bonding curve)
      console.log(`🔍 CurveCreate event not found, using fallback method for ${tokenAddress}`);
      return this.extractBondingCurveFallback(receipt.logs, tokenAddress);

    } catch (error) {
      console.error(`Error extracting bonding curve from receipt ${txHash}:`, error);
      return null;
    }
  }

  /**
   * Fallback method: Find the most active contract in the transaction logs
   */
  private extractBondingCurveFallback(logs: readonly any[], tokenAddress: string): string | null {
    try {
      // Count log occurrences by contract address
      const contractCounts = new Map<string, number>();
      
      for (const log of logs) {
        if (log.address && log.address.toLowerCase() !== tokenAddress.toLowerCase()) {
          const address = log.address.toLowerCase();
          contractCounts.set(address, (contractCounts.get(address) || 0) + 1);
        }
      }
      
      // Find the contract with the most logs (likely the bonding curve)
      let mostActiveContract: string | null = null;
      let maxCount = 0;
      
      for (const [address, count] of contractCounts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          mostActiveContract = address;
        }
      }
      
      if (mostActiveContract && maxCount > 1) {
        console.log(`🔍 Fallback bonding curve candidate: ${mostActiveContract} (${maxCount} logs)`);
        return mostActiveContract;
      }
      
      console.log(`❌ No suitable bonding curve candidate found`);
      return null;
      
    } catch (error) {
      console.error(`Error in bonding curve fallback extraction:`, error);
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