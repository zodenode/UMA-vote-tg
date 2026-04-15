import type Database from "better-sqlite3";
import { listPolymarketConditionIdCandidates } from "./polymarketEnrichment.js";
import { resolvePolymarketConditionTitle } from "./polymarketConditionCache.js";
import type { PriceRequestSummary } from "./umaSubgraph.js";

async function firstGammaTitleForCandidates(
  db: Database.Database,
  candidates: string[]
): Promise<string | null> {
  for (const cid of candidates) {
    const title = await resolvePolymarketConditionTitle(db, cid);
    if (title) return title;
  }
  return null;
}

/**
 * Attach Polymarket market titles to active VotingV2 rows by parsing `condition_id` from ancillary
 * and resolving via SQLite cache + Gamma API.
 */
export async function attachPolymarketTitlesToPriceRequests(
  db: Database.Database,
  requests: PriceRequestSummary[],
  concurrency = 5
): Promise<PriceRequestSummary[]> {
  if (!requests.length) return requests;
  const out = requests.map((r) => ({ ...r }));
  const ancSet = new Set<string>();
  for (const r of out) {
    if (r.ancillaryData && r.ancillaryData !== "0x") ancSet.add(r.ancillaryData);
  }
  const uniqueAnc = [...ancSet];
  const ancToTitle = new Map<string, string | null>();
  for (let i = 0; i < uniqueAnc.length; i += concurrency) {
    const chunk = uniqueAnc.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (ancHex) => {
        const cands = listPolymarketConditionIdCandidates(ancHex);
        const title = cands.length ? await firstGammaTitleForCandidates(db, cands) : null;
        ancToTitle.set(ancHex, title);
      })
    );
  }
  for (const r of out) {
    if (!r.ancillaryData) continue;
    const t = ancToTitle.get(r.ancillaryData);
    if (t) r.polymarketTitle = t;
  }
  return out;
}
