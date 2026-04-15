import { request } from "undici";

const FETCH_TIMEOUT_MS = 10_000;

export type PolymarketSearchHit = {
  conditionId: string;
  title: string;
  slug: string;
  image: string | null;
  url: string;
};

async function fetchJson(url: string): Promise<unknown> {
  const res = await request(url, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.statusCode !== 200) return null;
  return (await res.body.json()) as unknown;
}

function normConditionId(s: string): string | null {
  const t = s.trim().toLowerCase();
  return /^0x[a-f0-9]{64}$/.test(t) ? t : null;
}

type GammaMarketLite = {
  question?: string;
  slug?: string;
  conditionId?: string;
  image?: string;
  icon?: string;
};

function toHit(m: GammaMarketLite): PolymarketSearchHit | null {
  const conditionId = normConditionId(m.conditionId ?? "");
  const slug = m.slug?.trim();
  if (!conditionId || !slug) return null;
  const title = (m.question ?? "").trim() || "Untitled market";
  const image = (m.image ?? m.icon ?? "").trim() || null;
  return {
    conditionId,
    title,
    slug,
    image,
    url: `https://polymarket.com/market/${encodeURIComponent(slug)}`,
  };
}

function parsePolymarketUrl(raw: string): { kind: "event" | "market"; slug: string } | null {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.toLowerCase();
    if (host !== "polymarket.com" && !host.endsWith(".polymarket.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "event" && parts[1]) return { kind: "event", slug: parts[1] };
    if (parts[0] === "market" && parts[1]) return { kind: "market", slug: parts[1] };
    return null;
  } catch {
    return null;
  }
}

async function fetchMarketBySlug(slug: string): Promise<PolymarketSearchHit | null> {
  const url = `https://gamma-api.polymarket.com/markets/slug/${encodeURIComponent(slug)}`;
  const j = (await fetchJson(url)) as GammaMarketLite | { error?: string } | null;
  if (!j || typeof j !== "object" || "error" in j) return null;
  return toHit(j as GammaMarketLite);
}

async function fetchEventMarketsBySlug(slug: string): Promise<PolymarketSearchHit[]> {
  const url = `https://gamma-api.polymarket.com/events/slug/${encodeURIComponent(slug)}`;
  const j = (await fetchJson(url)) as { markets?: GammaMarketLite[] } | { error?: string } | null;
  if (!j || typeof j !== "object" || !("markets" in j) || !Array.isArray(j.markets)) return [];
  const out: PolymarketSearchHit[] = [];
  for (const m of j.markets) {
    const h = toHit(m);
    if (h) out.push(h);
  }
  return out;
}

async function fetchMarketsByConditionId(conditionId: string): Promise<PolymarketSearchHit | null> {
  const id = normConditionId(conditionId);
  if (!id) return null;
  const url = `https://gamma-api.polymarket.com/markets?condition_ids=${encodeURIComponent(id)}`;
  const arr = (await fetchJson(url)) as GammaMarketLite[] | null;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return toHit(arr[0]!);
}

/** Gamma market question by condition id (slug optional — some payloads omit it). */
export async function polymarketQuestionByConditionId(
  conditionId: string
): Promise<{ title: string; slug: string | null } | null> {
  const id = normConditionId(conditionId);
  if (!id) return null;
  const url = `https://gamma-api.polymarket.com/markets?condition_ids=${encodeURIComponent(id)}`;
  const arr = (await fetchJson(url)) as GammaMarketLite[] | null;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const m = arr[0] as GammaMarketLite;
  const title = (m?.question ?? "").trim();
  if (!title) return null;
  const slug = m.slug?.trim() || null;
  return { title, slug };
}

async function publicSearch(q: string, limit: number): Promise<PolymarketSearchHit[]> {
  const cap = Math.min(25, Math.max(limit, 1));
  const url = `https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(q)}&limit_per_type=${cap}&search_profiles=false`;
  const j = (await fetchJson(url)) as { events?: { markets?: GammaMarketLite[] }[] } | null;
  const events = j && typeof j === "object" && Array.isArray(j.events) ? j.events : [];
  const byCid = new Map<string, PolymarketSearchHit>();
  for (const ev of events) {
    const mk = ev?.markets;
    if (!Array.isArray(mk)) continue;
    for (const m of mk) {
      const h = toHit(m);
      if (h && !byCid.has(h.conditionId)) byCid.set(h.conditionId, h);
      if (byCid.size >= cap) break;
    }
    if (byCid.size >= cap) break;
  }
  return Array.from(byCid.values()).slice(0, cap);
}

/**
 * Text search, Polymarket URL, or condition id → normalized market hits (Gamma API).
 */
export async function polymarketSearch(query: string, limit: number): Promise<PolymarketSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const asCid = normConditionId(trimmed);
  if (asCid) {
    const one = await fetchMarketsByConditionId(asCid);
    return one ? [one] : [];
  }

  const parsed = parsePolymarketUrl(trimmed);
  if (parsed) {
    if (parsed.kind === "market") {
      const one = await fetchMarketBySlug(parsed.slug);
      return one ? [one] : [];
    }
    const many = await fetchEventMarketsBySlug(parsed.slug);
    return many.slice(0, Math.min(25, Math.max(limit, 1)));
  }

  if (trimmed.length < 2) return [];

  return publicSearch(trimmed, limit);
}
