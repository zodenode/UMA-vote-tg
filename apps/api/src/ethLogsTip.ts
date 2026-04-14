import type { PublicClient } from "viem";

/**
 * Block height to use as the inclusive upper bound for eth_getLogs.
 * Some public RPCs report eth_blockNumber slightly ahead of the tip getLogs accepts
 * ("block range extends beyond current head block"). Prefer finalized; fall back to a padded latest.
 */
export async function getLogsSafeUpperBound(client: PublicClient): Promise<bigint> {
  try {
    const b = await client.getBlock({ blockTag: "finalized" });
    return b.number;
  } catch {
    const n = await client.getBlockNumber();
    return n > 64n ? n - 64n : n;
  }
}
