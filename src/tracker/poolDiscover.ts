import { createPublicClient, http } from 'viem';
import { FACTORY_ABI } from './abis/Factory';

const client = createPublicClient({ transport: http(process.env['MONAD_HTTP_URL']!) });

export async function discoverPool(token: `0x${string}`, wmon: `0x${string}`, fee: number, factory: `0x${string}`) {
  try {
    const pool = await client.readContract({
      address: factory,
      abi: FACTORY_ABI,
      functionName: 'getPool',
      args: [token, wmon, fee]
    });
    return pool as `0x${string}`;
  } catch (e) {
    console.error('[discoverPool]', e);
    return undefined;
  }
}