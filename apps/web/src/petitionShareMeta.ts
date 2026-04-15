/**
 * Client-side Open Graph / Twitter meta for petition URLs (crawlers that execute JS may read these;
 * static crawlers still see index.html defaults — use SSR/prerender later if you need universal previews).
 */

const DEFAULT_PAGE_TITLE = "uma.vote — UMA DVM voting";
const DEFAULT_OG_TITLE = "uma.vote — UMA DVM voting";
const DEFAULT_DESCRIPTION =
  "Polygon prediction-market disputes, UMA swap on Ethereum, DVM commit/reveal via Telegram.";

function shareDisplayName(): string {
  const explicit = (import.meta.env.VITE_PUBLIC_SHARE_DISPLAY_NAME as string | undefined)?.trim();
  if (explicit) return explicit.replace(/^@/, "");
  const bot = (import.meta.env.VITE_PUBLIC_BOT_USERNAME as string | undefined)?.replace(/^@/, "")?.trim();
  return bot ?? "";
}

function upsertMeta(attr: "property" | "name", key: string, content: string, markDynamic?: boolean) {
  const elExisting = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  const el = elExisting ?? document.createElement("meta");
  if (!elExisting) {
    el.setAttribute(attr, key);
    if (markDynamic) el.setAttribute("data-petition-meta", "1");
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  document.head.querySelectorAll('link[rel="canonical"][data-petition-meta]').forEach((n) => n.remove());
  const el = document.createElement("link");
  el.rel = "canonical";
  el.href = href;
  el.setAttribute("data-petition-meta", "1");
  document.head.appendChild(el);
}

function removeDynamicPetitionMeta() {
  document.head.querySelectorAll("[data-petition-meta]").forEach((n) => n.remove());
}

export function buildPetitionShareCopy(petitionTitle: string, body: string | null): {
  ogTitle: string;
  description: string;
  pageTitle: string;
} {
  const name = shareDisplayName();
  const t = petitionTitle.trim() || "Community petition";
  const tShort = t.length > 72 ? `${t.slice(0, 69)}…` : t;
  const ogTitle = name
    ? `${name} invited you — ${tShort}`
    : `You've been invited to join the ${tShort} petition`;
  const snippet = (body ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const description =
    snippet ||
    (name
      ? `${name} shared this petition on uma.vote — read the case and optionally add a wallet-verified signature.`
      : `Open this petition on uma.vote to read the case and optionally add a wallet-verified signature.`);
  const pageTitle = `${tShort} · uma.vote`;
  return { ogTitle, description, pageTitle };
}

export function applyPetitionShareMeta(opts: {
  pageTitle: string;
  ogTitle: string;
  description: string;
  pageCanonicalUrl: string;
  imageUrl: string | null;
}): void {
  document.title = opts.pageTitle;
  upsertMeta("property", "og:type", "article");
  upsertMeta("property", "og:title", opts.ogTitle);
  upsertMeta("property", "og:description", opts.description);
  upsertMeta("property", "og:url", opts.pageCanonicalUrl);
  upsertMeta("property", "og:site_name", "uma.vote");
  upsertMeta("name", "twitter:title", opts.ogTitle);
  upsertMeta("name", "twitter:description", opts.description);

  const origin = new URL(opts.pageCanonicalUrl).origin;
  const fallbackImage = `${origin}/logo-mark.svg`;
  const img =
    opts.imageUrl && /^https:\/\//i.test(opts.imageUrl.trim()) ? opts.imageUrl.trim() : fallbackImage;
  upsertMeta("property", "og:image", img, true);
  upsertMeta("name", "twitter:image", img, true);
  upsertMeta("name", "twitter:card", img !== fallbackImage ? "summary_large_image" : "summary");

  upsertCanonical(opts.pageCanonicalUrl);
}

export function restoreDefaultShareMeta(): void {
  removeDynamicPetitionMeta();
  document.title = DEFAULT_PAGE_TITLE;
  const og = document.head.querySelector('meta[property="og:type"]') as HTMLMetaElement | null;
  if (og) og.setAttribute("content", "website");
  const ogt = document.head.querySelector('meta[property="og:title"]') as HTMLMetaElement | null;
  if (ogt) ogt.setAttribute("content", DEFAULT_OG_TITLE);
  const ogd = document.head.querySelector('meta[property="og:description"]') as HTMLMetaElement | null;
  if (ogd) ogd.setAttribute("content", DEFAULT_DESCRIPTION);
  const ogu = document.head.querySelector('meta[property="og:url"]') as HTMLMetaElement | null;
  if (ogu && typeof window !== "undefined") ogu.setAttribute("content", `${window.location.origin}/`);
  const twt = document.head.querySelector('meta[name="twitter:title"]') as HTMLMetaElement | null;
  if (twt) twt.setAttribute("content", DEFAULT_OG_TITLE);
  const twd = document.head.querySelector('meta[name="twitter:description"]') as HTMLMetaElement | null;
  if (twd) twd.setAttribute("content", DEFAULT_DESCRIPTION);
  const twc = document.head.querySelector('meta[name="twitter:card"]') as HTMLMetaElement | null;
  if (twc) twc.setAttribute("content", "summary");
}
