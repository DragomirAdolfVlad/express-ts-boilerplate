// Standalone tracker - do NOT import any Express app files
import 'dotenv/config';
import { RedisPub } from './redisPub';
import { decodeCurveLog, decodePoolLog } from './decode';
import { subscribeLogs } from './monadWs';
import { discoverPool } from './poolDiscover';

const WS = process.env['MONAD_WS_URL']!;
const HTTP = process.env['MONAD_HTTP_URL']!;
// Monitor the correct BondingCurve contract
const BONDING_CURVE = '0x52d34d8536350cd997bcbd0b9e9d722452f341f5' as `0x${string}`;
const FACTORY = process.env['FACTORY']! as `0x${string}`;
const WMON = process.env['WMON']! as `0x${string}`;
const FEE = Number(process.env['POOL_FEE'] || '10000');
const REDIS_URL = process.env['REDIS_URL'] || `redis://${process.env['REDIS_HOST'] || 'localhost'}:${process.env['REDIS_PORT'] || '6379'}`;
const CHANNEL = process.env['REDIS_CHANNEL'] || 'nadfun:live';

console.log('[tracker] Starting with config:');
console.log('  WS:', WS);
console.log('  BONDING_CURVE:', BONDING_CURVE);
console.log('  REDIS_URL:', REDIS_URL);
console.log('  CHANNEL:', CHANNEL);

const pub = new RedisPub(REDIS_URL, CHANNEL);

const activePools = new Set<string>(); // quick in-memory registry

// 1) Subscribe to BondingCurve logs (Proposed->Finalized)
subscribeLogs({
  wsUrl: WS,
  address: BONDING_CURVE,
  onLog: async (raw, phase) => {
    // per-log decoding (no bulk)
    console.log(`[decode] Attempting to decode log with topics:`, raw.topics?.slice(0, 1));
    const curve = decodeCurveLog(raw);
    if (!curve) {
      console.log(`[decode] Failed to decode log`);
      return;
    }

    console.log(`[decode] Successfully decoded: ${curve.type}`);
    // push immediately
    await pub.publish({
      phase, // 'proposed' or 'finalized'
      t: Date.now(),
      blk: String(curve.raw.blockNumber ?? ''),
      tx: curve.raw.transactionHash,
      ...curve
    });

    // on PairEvent (likely Listed): subscribe pool swaps ASAP
    if (curve.type === 'curve_pair_event') {
      const token = curve.token as `0x${string}`;

      // try pool from event (some implementations provide pool), else discover via Factory
      let pool = curve.pool as `0x${string}` | undefined;
      if (!pool || pool === '0x0000000000000000000000000000000000000000') {
        pool = await discoverPool(token, WMON, FEE, FACTORY);
      }

      if (pool && !activePools.has(pool.toLowerCase())) {
        activePools.add(pool.toLowerCase());
        // subscribe to this pool's swaps
        subscribeLogs({
          wsUrl: WS,
          address: pool,
          onLog: async (pRaw, pPhase) => {
            const ev = decodePoolLog(pRaw);
            if (!ev) return;
            await pub.publish({
              phase: pPhase,
              t: Date.now(),
              blk: String(ev.raw.blockNumber ?? ''),
              tx: ev.raw.transactionHash,
              token, // include token that led to this pool
              ...ev
            });
          }
        });
      }
    }
  }
});

// Optional: log that HTTP is reachable to fail fast at boot (no polling)
void (async () => {
  if (!HTTP) return;
  console.log('[tracker] started; WS=', WS, ' HTTP=', HTTP);
})();