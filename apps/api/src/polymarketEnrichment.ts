import { request } from "undici";

export type PolymarketOutcomePrice = {
  label: string;
  tokenId: string;
  priceBuy: string | null;
  priceSell: string | null;
  mid: string | null;
};

export type PolymarketEnrichment = {
  conditionId: string;
  title: string | null;
  slug: string | null;
  url: string | null;
  outcomes: PolymarketOutcomePrice[];
  proposedPriceHint: string | null;
  fetchedAt: number;
  error?: string;
};

type DisputeLike = {
  dispute_key: string;
  ancillary_data: string;
  proposed_price: string;
};

const cache = new Map<string, { at: number; value: PolymarketEnrichment | null }>();
const CACHE_MS = 45_000;
const FETCH_TIMEOUT_MS = 8000;

function hexToUtf8(hex: string): string {
  try {
    const raw = hex.replace(/^0x/, "");
    if (raw.length % 2) return "";
    return Buffer.from(raw, "hex").toString("utf8");
  } catch {
    return "";
  }
}

/** Extract first plausible Polymarket condition id (32-byte hash) from ancillary text. */
export function extractConditionIdFromAncillary(ancillaryHex: string): string | null {
  const text = hexToUtf8(ancillaryHex);
  const candidates = new Set<string>();
  const re = /0x[a-fA-F]{64}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    candidates.add(m[0].toLowerCase());
  }
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const walk = (v: unknown) => {
      if (typeof v === "string" && /^0x[a-fA-F]{64}$/.test(v)) candidates.add(v.toLowerCase());
      else if (v && typeof v === "object") {
        for (const x of Object.values(v as object)) walk(x);
      }
    };
    walk(j);
  } catch {
    /* not JSON */
  }
  for (const c of candidates) return c;
  return null;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await request(url, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.statusCode !== 200) return null;
  return (await res.body.json()) as unknown;
}

type GammaMarket = {
  question?: string;
  slug?: string;
  conditionId?: string;
  clobTokenIds?: string;
  outcomes?: string;
};

function parseJsonArrayField(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw) as unknown;
    return Array.isArray(j) ? j.map(String) : [];
  } catch {
    return [];
  }
}

async function fetchClobSide(tokenId: string, side: "buy" | "sell"): Promise<string | null> {
  const url = `https://clob.polymarket.com/price?token_id=${encodeURIComponent(tokenId)}&side=${side}`;
  try {
    const j = (await fetchJson(url)) as { price?: string } | null;
    if (j && typeof j.price === "string") return j.price;
  } catch {
    /* ignore */
  }
  return null;
}

export async function enrichDisputeRow(row: DisputeLike): Promise<PolymarketEnrichment | null> {
  const conditionId = extractConditionIdFromAncillary(row.ancillary_data);
  if (!conditionId) return null;

  const ck = `${row.dispute_key}:${conditionId}`;
  const now = Date.now();
  const hit = cache.get(ck);
  if (hit && now - hit.at < CACHE_MS) return hit.value;

  let value: PolymarketEnrichment | null = null;
  try {
    const gammaUrl = `https://gamma-api.polymarket.com/markets?condition_ids=${encodeURIComponent(conditionId)}`;
    const arr = (await fetchJson(gammaUrl)) as GammaMarket[] | null;
    const m = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
    if (!m) {
      value = {
        conditionId,
        title: null,
        slug: null,
        url: null,
        outcomes: [],
        proposedPriceHint: row.proposed_price,
        fetchedAt: now,
        error: "Market not found on Gamma",
      };
      cache.set(ck, { at: now, value });
      return value;
    }
    const title = m.question ?? null;
    const slug = m.slug ?? null;
    const url = slug ? `https://polymarket.com/market/${encodeURIComponent(slug)}` : null;
    const tokenIds = parseJsonArrayField(m.clobTokenIds);
    const labels = parseJsonArrayField(m.outcomes);
    const outcomes: PolymarketOutcomePrice[] = [];
    for (let i = 0; i < tokenIds.length; i++) {
      const tokenId = tokenIds[i]!;
      const label = labels[i] ?? `Outcome ${i + 1}`;
      const [priceBuy, priceSell] = await Promise.all([
        fetchClobSide(tokenId, "buy"),
        fetchClobSide(tokenId, "sell"),
      ]);
      let mid: string | null = null;
      if (priceBuy != null && priceSell != null) {
        const a = Number(priceBuy);
        const b = Number(priceSell);
        if (!Number.isNaN(a) && !Number.isNaN(b)) mid = ((a + b) / 2).toFixed(4);
      } else mid = priceBuy ?? priceSell ?? null;
      outcomes.push({ label, tokenId, priceBuy, priceSell, mid });
    }
    value = {
      conditionId,
      title,
      slug,
      url,
      outcomes,
      proposedPriceHint: row.proposed_price,
      fetchedAt: now,
    };
  } catch (e) {
    value = {
      conditionId,
      title: null,
      slug: null,
      url: null,
      outcomes: [],
      proposedPriceHint: row.proposed_price,
      fetchedAt: now,
      error: e instanceof Error ? e.message : "enrichment failed",
    };
  }
  cache.set(ck, { at: now, value });
  return value;
}

/** Enrich up to N disputes with bounded concurrency. */
export async function enrichDisputesForApi(rows: DisputeLike[], max = 12): Promise<Map<string, PolymarketEnrichment | null>> {
  const out = new Map<string, PolymarketEnrichment | null>();
  const slice = rows.slice(0, max);
  const concurrency = 4;
  let i = 0;
  async function worker() {
    while (i < slice.length) {
      const idx = i++;
      const r = slice[idx]!;
      try {
        const e = await enrichDisputeRow(r);
        out.set(r.dispute_key, e);
      } catch {
        out.set(r.dispute_key, null);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, slice.length) }, () => worker()));
  return out;
}
