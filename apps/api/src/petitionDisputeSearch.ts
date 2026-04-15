import type Database from "better-sqlite3";
import {
  enrichDisputesForApi,
  extractConditionIdFromAncillary,
  type PolymarketEnrichment,
} from "./polymarketEnrichment.js";
import { polymarketSearch, type PolymarketSearchHit } from "./polymarketSearch.js";

export type PetitionDisputeSearchHit = {
  disputeKey: string;
  conditionId: string | null;
  label: string;
  polymarketUrl: string | null;
  polymarketSlug: string | null;
  imageUrl: string | null;
  chainId: string;
  matchSource: "polymarket-search" | "indexed-text";
};

type DisputeScanRow = {
  dispute_key: string;
  chain_id?: string | null;
  ancillary_data: string;
  proposed_price: string;
  detected_at: string;
  source_label?: string | null;
};

const STOPWORDS = new Set([
  "and",
  "or",
  "the",
  "a",
  "an",
  "of",
  "in",
  "on",
  "for",
  "to",
  "by",
  "is",
  "are",
  "was",
  "were",
  "with",
  "no",
  "yes",
]);

function hexToUtf8(hex: string): string {
  try {
    const raw = hex.replace(/^0x/, "");
    if (raw.length % 2) return "";
    return Buffer.from(raw, "hex").toString("utf8");
  } catch {
    return "";
  }
}

/** Lowercased blob: decoded ancillary + JSON title fields + condition id. */
function ancillarySearchBlob(ancillaryHex: string): string {
  const utf8 = hexToUtf8(ancillaryHex);
  const parts = [utf8.toLowerCase()];
  try {
    const j = JSON.parse(utf8) as Record<string, unknown>;
    for (const k of ["title", "question", "description"]) {
      const v = j[k];
      if (typeof v === "string" && v.trim()) parts.push(v.trim().toLowerCase());
    }
  } catch {
    /* not JSON */
  }
  const cid = extractConditionIdFromAncillary(ancillaryHex);
  if (cid) parts.push(cid);
  return parts.join("\n");
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

/** All tokens must appear somewhere in the blob. */
function scoreIndexedMatch(blob: string, words: string[]): number {
  if (!words.length) return 0;
  for (const w of words) {
    if (!blob.includes(w)) return 0;
  }
  return words.length;
}

export function findDisputeRowByConditionIdFromDb(
  db: Database.Database,
  conditionIdLower: string,
  scanCap = 900
): DisputeScanRow | null {
  const raw = db
    .prepare(
      `SELECT dispute_key, chain_id, ancillary_data, proposed_price, detected_at, source_label
       FROM disputed_queries
       ORDER BY datetime(detected_at) DESC,
                CASE WHEN chain_id = '137' THEN 0 ELSE 1 END,
                block_number DESC, log_index DESC
       LIMIT ?`
    )
    .all(scanCap) as DisputeScanRow[];
  for (const r of raw) {
    const cid = extractConditionIdFromAncillary(r.ancillary_data);
    if (cid && cid.toLowerCase() === conditionIdLower) return r;
  }
  return null;
}

function hitFromRow(
  row: DisputeScanRow,
  pm: PolymarketSearchHit | null,
  enrich: PolymarketEnrichment | null | undefined,
  matchSource: PetitionDisputeSearchHit["matchSource"]
): PetitionDisputeSearchHit {
  const cid =
    (enrich?.conditionId ?? extractConditionIdFromAncillary(row.ancillary_data) ?? pm?.conditionId ?? null)?.trim()
      .toLowerCase() ?? null;
  const normCid = cid && /^0x[a-f0-9]{64}$/.test(cid) ? cid : null;
  const slug = (enrich?.slug ?? pm?.slug ?? null)?.trim() || null;
  const title =
    (enrich?.title ?? pm?.title ?? null)?.trim() ||
    (normCid ? `Dispute ${normCid.slice(0, 10)}…` : row.dispute_key.slice(0, 16));
  const polymarketUrl =
    slug != null && slug.length > 0
      ? `https://polymarket.com/market/${encodeURIComponent(slug)}`
      : normCid
        ? `https://polymarket.com/condition/${encodeURIComponent(normCid)}`
        : pm?.url ?? null;
  const imageUrl = (enrich?.image ?? pm?.image ?? null)?.trim() || null;
  return {
    disputeKey: row.dispute_key,
    conditionId: normCid,
    label: title,
    polymarketUrl,
    polymarketSlug: slug,
    imageUrl,
    chainId: String(row.chain_id ?? "1"),
    matchSource,
  };
}

/**
 * Search disputes we have indexed (UMA/Polymarket OO), combining local ancillary/Gamma text match
 * with Polymarket public search → condition id → indexed row.
 */
export async function searchPetitionsDisputes(
  db: Database.Database,
  query: string,
  limit: number
): Promise<PetitionDisputeSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const cap = Math.min(18, Math.max(1, limit));

  const raw = db
    .prepare(
      `SELECT dispute_key, chain_id, ancillary_data, proposed_price, detected_at, source_label
       FROM disputed_queries
       ORDER BY datetime(detected_at) DESC,
                CASE WHEN chain_id = '137' THEN 0 ELSE 1 END,
                block_number DESC, log_index DESC
       LIMIT 750`
    )
    .all() as DisputeScanRow[];

  const words = tokenize(q);
  const qLower = q.toLowerCase();

  const indexedRanked: { row: DisputeScanRow; score: number }[] = [];
  for (const row of raw) {
    const blob = ancillarySearchBlob(row.ancillary_data);
    let score = words.length ? scoreIndexedMatch(blob, words) : 0;
    if (!score && q.length >= 3 && blob.includes(qLower)) score = 1;
    if (score > 0) indexedRanked.push({ row, score });
  }
  indexedRanked.sort((a, b) => b.score - a.score || (a.row.detected_at < b.row.detected_at ? 1 : -1));

  let pmHits: PolymarketSearchHit[] = [];
  try {
    pmHits = await polymarketSearch(q, 12);
  } catch {
    pmHits = [];
  }

  type Cand = { row: DisputeScanRow; pm: PolymarketSearchHit | null; source: PetitionDisputeSearchHit["matchSource"] };
  const cands: Cand[] = [];
  const seen = new Set<string>();

  for (const pm of pmHits) {
    const row = findDisputeRowByConditionIdFromDb(db, pm.conditionId.toLowerCase());
    if (!row || seen.has(row.dispute_key)) continue;
    seen.add(row.dispute_key);
    cands.push({ row, pm, source: "polymarket-search" });
  }
  for (const { row } of indexedRanked) {
    if (seen.has(row.dispute_key)) continue;
    seen.add(row.dispute_key);
    cands.push({ row, pm: null, source: "indexed-text" });
    if (cands.length >= cap * 3) break;
  }

  const slice = cands.slice(0, cap);
  const pmMap = await enrichDisputesForApi(
    slice.map((c) => ({
      dispute_key: c.row.dispute_key,
      ancillary_data: c.row.ancillary_data,
      proposed_price: c.row.proposed_price,
    })),
    slice.length
  );

  const out: PetitionDisputeSearchHit[] = [];
  for (const c of slice) {
    const en = pmMap.get(c.row.dispute_key);
    out.push(hitFromRow(c.row, c.pm, en ?? null, c.source));
  }
  return out;
}
