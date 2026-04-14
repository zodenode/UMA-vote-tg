import type { PolymarketEnrichment } from "./polymarketEnrichment.js";

/** int256 settlement side for typical binary Polymarket requests */
export const WEI_1E18 = 10n ** 18n;

/** `proposedPrice >= this` favors outcome index 0; below favors index 1 */
export const PROPOSED_SPLIT = WEI_1E18 / 2n;

/** Strong disagreement: OO-favored outcome looks weak vs CLOB */
export const STRONG_DISAGREE_FAVORED_MAX = 0.35;
export const STRONG_DISAGREE_OTHER_MIN = 0.55;

/** Both sides near 50/50 on CLOB */
export const DEAD_HEAT_LOW = 0.42;
export const DEAD_HEAT_HIGH = 0.58;

function parseProposedWei(raw: string): bigint | null {
  try {
    return BigInt(String(raw).trim());
  } catch {
    return null;
  }
}

/** Strict (0, 1) — excludes 0 and 1 so boundary noise is ignored */
function parseMidOpen01(s: string | null | undefined): number | null {
  if (s == null || s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n >= 1) return null;
  return n;
}

export type ReversalWatchResult = {
  reversalWatch: boolean;
  reversalWatchReason: string | null;
};

/**
 * Heuristic only: compares OO proposed price (0 vs 1e18) to Polymarket CLOB mids for binary markets.
 * Assumes outcome index 0 aligns with the 1e18 settlement side (common Polymarket / OO convention).
 */
export function computePolymarketReversalWatch(
  proposedPriceWei: string,
  pm: PolymarketEnrichment | null
): ReversalWatchResult {
  if (!pm || pm.error || !pm.outcomes?.length) {
    return { reversalWatch: false, reversalWatchReason: null };
  }

  const p = parseProposedWei(proposedPriceWei);
  if (p == null || p < 0n) {
    return { reversalWatch: false, reversalWatchReason: null };
  }

  if (p !== 0n && p !== WEI_1E18) {
    return { reversalWatch: false, reversalWatchReason: null };
  }

  if (pm.outcomes.length !== 2) {
    return { reversalWatch: false, reversalWatchReason: null };
  }

  const m0 = parseMidOpen01(pm.outcomes[0]!.mid);
  const m1 = parseMidOpen01(pm.outcomes[1]!.mid);
  if (m0 == null || m1 == null) {
    return { reversalWatch: false, reversalWatchReason: null };
  }

  const label0 = pm.outcomes[0]!.label.trim() || "Outcome 0";
  const label1 = pm.outcomes[1]!.label.trim() || "Outcome 1";

  const favorsIndex0 = p >= PROPOSED_SPLIT;
  const favoredMid = favorsIndex0 ? m0 : m1;
  const otherMid = favorsIndex0 ? m1 : m0;
  const favoredLabel = favorsIndex0 ? label0 : label1;
  const otherLabel = favorsIndex0 ? label1 : label0;

  const strongDisagree =
    favoredMid <= STRONG_DISAGREE_FAVORED_MAX && otherMid >= STRONG_DISAGREE_OTHER_MIN;

  const deadHeat =
    m0 >= DEAD_HEAT_LOW &&
    m0 <= DEAD_HEAT_HIGH &&
    m1 >= DEAD_HEAT_LOW &&
    m1 <= DEAD_HEAT_HIGH;

  if (strongDisagree) {
    return {
      reversalWatch: true,
      reversalWatchReason: `OO favors “${favoredLabel}” (binary price) but CLOB mid ~${favoredMid.toFixed(2)} vs “${otherLabel}” ~${otherMid.toFixed(2)} — traders lean the other way (heuristic).`,
    };
  }

  if (deadHeat) {
    return {
      reversalWatch: true,
      reversalWatchReason:
        "CLOB mids are near 50/50; contested liquidity often precedes volatile DVM rounds (heuristic).",
    };
  }

  return { reversalWatch: false, reversalWatchReason: null };
}
