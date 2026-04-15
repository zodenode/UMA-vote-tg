export type PolymarketPublicProfileResult =
  | { status: "found"; displayLabel: string | null; proxyWallet: string | null }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * Gamma public profile — Polymarket may use a proxy wallet; 404 only means no public profile for this EOA.
 * CORS: Polymarket allows browser calls from typical web origins.
 */
export async function fetchPolymarketPublicProfile(address: string): Promise<PolymarketPublicProfileResult> {
  const a = address.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(a)) return { status: "error", message: "Invalid address" };
  try {
    const r = await fetch(
      `https://gamma-api.polymarket.com/public-profile?address=${encodeURIComponent(a)}`,
      { headers: { accept: "application/json" } }
    );
    if (r.status === 404) return { status: "not_found" };
    if (!r.ok) return { status: "error", message: `Polymarket API HTTP ${r.status}` };
    const j = (await r.json()) as {
      name?: string | null;
      pseudonym?: string | null;
      proxyWallet?: string | null;
    };
    const displayLabel =
      (typeof j.name === "string" && j.name.trim()) ||
      (typeof j.pseudonym === "string" && j.pseudonym.trim()) ||
      null;
    const proxyWallet =
      typeof j.proxyWallet === "string" && /^0x[a-fA-F0-9]{40}$/.test(j.proxyWallet)
        ? j.proxyWallet.toLowerCase()
        : null;
    return { status: "found", displayLabel, proxyWallet };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { status: "error", message: msg };
  }
}
