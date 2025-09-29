/**
 * Monad Token Domain Entities
 * 
 * Business entities for Monad token tracking that mirror pump.fun structure
 * for frontend compatibility while handling Monad-specific features.
 */

export interface MonadTokenData {
  readonly address: string;
  readonly name?: string;
  readonly symbol?: string;
  readonly creator: string;
  readonly bondingCurve: string;
  readonly blockNumber: string;
  readonly blockId: string;
  readonly commitState: 'proposed' | 'voted' | 'finalized' | 'verified';
  readonly timestamp: Date;
}

export interface MonadTradeData {
  readonly tokenAddress: string;
  readonly trader: string;
  readonly isBuy: boolean;
  readonly wmonAmount: bigint;
  readonly tokenAmount: bigint;
  readonly pricePerToken: bigint;
  readonly usdAmount?: number; // USD value of the trade
  readonly reserves: {
    reserve1: bigint; // Virtual token reserves
    reserve2: bigint; // Virtual WMON reserves
    reserve3: bigint; // Real token reserves  
    reserve4: bigint; // Real WMON reserves
  };
  readonly blockNumber: string;
  readonly blockId: string;
  readonly commitState: string;
  readonly timestamp: Date;
  readonly transactionHash: string;
  readonly logIndex?: number;
}

export class MonadToken {
  constructor(
    private readonly data: MonadTokenData
  ) {}

  get address(): string {
    return this.data.address;
  }

  get name(): string | undefined {
    return this.data.name;
  }

  get symbol(): string | undefined {
    return this.data.symbol;
  }

  get creator(): string {
    return this.data.creator;
  }

  get bondingCurve(): string {
    return this.data.bondingCurve;
  }

  get blockNumber(): string {
    return this.data.blockNumber;
  }

  get blockId(): string {
    return this.data.blockId;
  }

  get commitState(): string {
    return this.data.commitState;
  }

  get timestamp(): Date {
    return this.data.timestamp;
  }

  get isFinalized(): boolean {
    return this.data.commitState === 'finalized' || this.data.commitState === 'verified';
  }

  // Convert to pump.fun compatible format for frontend
  toPumpFunFormat(): any {
    return {
      platform: 'monad',
      token: this.address,
      creator: this.creator,
      bondingCurve: this.bondingCurve,
      blockTime: this.blockNumber,
      timestamp: this.timestamp,
      name: this.name || '',
      symbol: this.symbol || '',
      // Monad-specific fields
      blockId: this.blockId,
      commitState: this.commitState
    };
  }
}

export class MonadTrade {
  constructor(
    private readonly data: MonadTradeData
  ) {}

  get tokenAddress(): string {
    return this.data.tokenAddress;
  }

  get trader(): string {
    return this.data.trader;
  }

  get isBuy(): boolean {
    return this.data.isBuy;
  }

  get wmonAmount(): bigint {
    return this.data.wmonAmount;
  }

  get tokenAmount(): bigint {
    return this.data.tokenAmount;
  }

  get pricePerToken(): bigint {
    return this.data.pricePerToken;
  }

  get usdAmount(): number | undefined {
    return this.data.usdAmount;
  }

  get reserves(): typeof this.data.reserves {
    return this.data.reserves;
  }

  get blockNumber(): string {
    return this.data.blockNumber;
  }

  get blockId(): string {
    return this.data.blockId;
  }

  get commitState(): string {
    return this.data.commitState;
  }

  get timestamp(): Date {
    return this.data.timestamp;
  }

  get transactionHash(): string {
    return this.data.transactionHash;
  }

  get logIndex(): number | undefined {
    return this.data.logIndex;
  }

  get creator(): string | undefined {
    return undefined; // Not available in trade data
  }

  get bondingCurve(): string | undefined {
    return undefined; // Not available in trade data
  }

  get isFinalized(): boolean {
    return this.data.commitState === 'finalized' || this.data.commitState === 'verified';
  }

  // Calculate market cap based on reserves
  calculateMarketCap(wmonPriceUsd: number): number {
    // Market cap = circulating supply * price per token * USD price
    const virtualTokenSupply = Number(this.reserves.reserve1) / 1e18;
    const realTokenReserves = Number(this.reserves.reserve3) / 1e18;
    
    // Ensure we have reasonable values
    if (virtualTokenSupply === 0 || realTokenReserves < 0) {
      // Fallback calculation using standard bonding curve assumptions
      const pricePerTokenUsd = (Number(this.pricePerToken) / 1e18) * wmonPriceUsd;
      return 800000000 * pricePerTokenUsd; // 800M circulating supply estimate
    }
    
    const circulatingSupply = Math.max(0, virtualTokenSupply - realTokenReserves);
    const pricePerTokenInWmon = Number(this.pricePerToken) / 1e18;
    const marketCapInWmon = circulatingSupply * pricePerTokenInWmon;
    
    return marketCapInWmon * wmonPriceUsd;
  }

  // Calculate curve progress (how close to graduation)
  calculateCurveProgress(): number {
    // Progress = real reserves / virtual reserves
    const realWmonReserves = Number(this.reserves.reserve4);
    const virtualWmonReserves = Number(this.reserves.reserve2);
    
    if (virtualWmonReserves === 0) return 0;
    
    return Math.min(realWmonReserves / virtualWmonReserves, 1.0);
  }

  // Convert to pump.fun compatible format for frontend
  toPumpFunFormat(wmonPriceUsd: number): any {
    const marketCap = this.calculateMarketCap(wmonPriceUsd);
    const curveProgress = this.calculateCurveProgress();
    
    return {
      tokenAddress: this.tokenAddress,
      signature: this.transactionHash,
      trader: this.trader,
      isBuy: this.isBuy,
      // Convert WMON to SOL equivalent for frontend compatibility
      solAmount: Number(this.wmonAmount) / 1e18,
      tokenAmount: Number(this.tokenAmount) / 1e18,
      pricePerToken: Number(this.pricePerToken) / 1e18,
      usdAmount: (Number(this.wmonAmount) / 1e18) * wmonPriceUsd,
      timestamp: this.timestamp,
      curveProgress,
      marketCap,
      liquidityUsd: marketCap * 0.1, // Estimate 10% of market cap
      // Monad 4-reserve system mapped to pump.fun 2-reserve system
      virtualSolReserves: this.reserves.reserve2.toString(),
      virtualTokenReserves: this.reserves.reserve1.toString(),
      realSolReserves: this.reserves.reserve4.toString(),
      realTokenReserves: this.reserves.reserve3.toString(),
      usdSpotPrice: (Number(this.pricePerToken) / 1e18) * wmonPriceUsd,
      // Monad-specific fields
      blockNumber: this.blockNumber,
      blockId: this.blockId,
      commitState: this.commitState
    };
  }
}