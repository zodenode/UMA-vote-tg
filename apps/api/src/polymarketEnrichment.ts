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
  /** Gamma `image` / `icon` (HTTPS) for list thumbnails */
  image: string | null;
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

/** JSON keys that hold the CTF / Gamma market condition id (try these before any other 0x+64). */
const CONDITION_ID_JSON_KEYS = [
  "condition_id",
  "conditionId",
  "conditionID",
  "ctfConditionId",
  "parentConditionId",
] as const;

const PREFERRED_LEAF_KEYS = new Set(CONDITION_ID_JSON_KEYS.map((k) => k.toLowerCase()));

/**
 * JSON keys whose 0x+64 values are usually *not* Polymarket Gamma `condition_ids`
 * (e.g. keccak digests, UMA question ids).
 */
const DEPRIORITIZED_JSON_KEYS = new Set(
  [
    "questionid",
    "questionId",
    "questionID",
    "ancillarydatahash",
    "ancillaryDataHash",
    "requesthash",
    "requestHash",
    "digest",
    "salt",
  ].map((s) => s.toLowerCase())
);

function pathHasHashySegment(path: string[]): boolean {
  return path.some((p) => /hash|digest|signature/i.test(p));
}

/**
 * Ordered Polymarket / CTF condition id candidates for Gamma `markets?condition_ids=`.
 * Important: ancillary often contains *several* 32-byte hex strings (hashes, question ids).
 * Returning the wrong one first makes every market look "missing" even when Gamma has it.
 */
export function listPolymarketConditionIdCandidates(ancillaryHex: string): string[] {
  const text = hexToUtf8(ancillaryHex);
  /** 0 = explicit condition keys, 1 = other JSON hex, 2 = plain-text hex (no "hash" nearby), 3 = hash-ish / last resort */
  const tiers: [string[], string[], string[], string[]] = [[], [], [], []];
  const seen = new Set<string>();
  const push = (tier: 0 | 1 | 2 | 3, cid: string) => {
    const k = cid.toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(k) || seen.has(k)) return;
    seen.add(k);
    tiers[tier].push(k);
  };

  let root: unknown = null;
  try {
    root = JSON.parse(text) as unknown;
  } catch {
    root = null;
  }

  if (root && typeof root === "object") {
    const walk = (node: unknown, path: string[]) => {
      if (typeof node === "string" && /^0x[0-9a-fA-F]{64}$/i.test(node)) {
        const leaf = path[path.length - 1] ?? "";
        const lk = leaf.toLowerCase();
        if (PREFERRED_LEAF_KEYS.has(lk)) push(0, node);
        else if (DEPRIORITIZED_JSON_KEYS.has(lk) || pathHasHashySegment(path)) push(3, node);
        else push(1, node);
        return;
      }
      if (Array.isArray(node)) {
        for (const item of node) walk(item, path);
        return;
      }
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node as object)) {
          walk(v, [...path, k]);
        }
      }
    };
    walk(root, []);
  }

  /** Line-local context: a 96-char window can span a previous line and falsely tag a real `condition_id` as "hashy". */
  const re = /0x[0-9a-fA-F]{64}/g;
  for (const line of text.split(/\n/)) {
    const lineHashy = /hash|digest/i.test(line);
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const k = m[0].toLowerCase();
      if (seen.has(k)) continue;
      push(lineHashy ? 3 : 2, m[0]);
    }
    re.lastIndex = 0;
  }

  return [...tiers[0], ...tiers[1], ...tiers[2], ...tiers[3]];
}

/** Best single condition id for backwards-compatible call sites (petitions, disputes). */
export function extractConditionIdFromAncillary(ancillaryHex: string): string | null {
  const c = listPolymarketConditionIdCandidates(ancillaryHex);
  return c[0] ?? null;
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
  image?: string;
  icon?: string;
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
        image: null,
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
    const image =
      typeof m.image === "string" && m.image.startsWith("http")
        ? m.image
        : typeof m.icon === "string" && m.icon.startsWith("http")
          ? m.icon
          : null;
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
      image,
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
      image: null,
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
