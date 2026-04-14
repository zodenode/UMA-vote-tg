import { request } from "undici";

const INTERVALS = new Set(["max", "all", "1m", "1w", "1d", "6h", "1h"]);
const TIMEOUT_MS = 12_000;

export type PriceHistoryPoint = { t: number; p: number };

export async function fetchPolymarketPriceHistory(
  tokenId: string,
  interval: string
): Promise<{ ok: true; history: PriceHistoryPoint[] } | { ok: false; error: string }> {
  const tid = tokenId.trim();
  if (!/^\d{1,120}$/.test(tid)) {
    return { ok: false, error: "tokenId must be a numeric CLOB token id" };
  }
  const iv = interval.trim() || "1d";
  if (!INTERVALS.has(iv)) {
    return { ok: false, error: "invalid interval" };
  }
  const url = `https://clob.polymarket.com/prices-history?market=${encodeURIComponent(tid)}&interval=${encodeURIComponent(iv)}&fidelity=120`;
  try {
    const res = await request(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.statusCode !== 200) {
      return { ok: false, error: `CLOB returned ${res.statusCode}` };
    }
    const body = (await res.body.json()) as { history?: unknown };
    const raw = Array.isArray(body.history) ? body.history : [];
    const history: PriceHistoryPoint[] = [];
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const o = row as { t?: unknown; p?: unknown };
      const t = typeof o.t === "number" ? o.t : Number(o.t);
      const p = typeof o.p === "number" ? o.p : Number(o.p);
      if (Number.isFinite(t) && Number.isFinite(p)) history.push({ t, p });
    }
    return { ok: true, history };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}
