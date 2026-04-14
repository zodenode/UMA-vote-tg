import { request } from "undici";

export type PetitionImageSuggestion = {
  imageUrl: string;
  thumbUrl: string;
  title: string;
  sourceUrl: string;
  licenseShort?: string;
};

const DEFAULT_UA = "UMAVoteTG/1.0 (petition cover suggestions; +https://vote.umaproject.org/)";

function sanitizeQuery(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/0x[a-f0-9]{64}/gi, " ")
    .replace(/[^\p{L}\p{N}\s.,'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

type WikiImageInfo = {
  thumburl?: string;
  url?: string;
  mime?: string;
  descriptionshorturl?: string;
  extmetadata?: Record<string, { value?: string }>;
};

type WikiQueryPage = {
  title?: string;
  imageinfo?: WikiImageInfo[];
};

function fileTitleToHuman(fileTitle: string): string {
  const t = fileTitle.replace(/^File:/i, "").replace(/_/g, " ");
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

/**
 * Free image search via Wikimedia Commons (no API key).
 * https://api.wikimedia.org/wiki/Core_REST_API — we use the classic action API for broad image search.
 */
export async function fetchCommonsImageSuggestions(
  rawQuery: string,
  limit: number
): Promise<PetitionImageSuggestion[]> {
  const q = sanitizeQuery(rawQuery);
  if (q.length < 2) return [];

  const ua = (process.env.WIKIMEDIA_API_USER_AGENT ?? DEFAULT_UA).trim() || DEFAULT_UA;
  const max = Math.min(20, Math.max(1, limit));
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", String(max + 5));
  url.searchParams.set("gsrsearch", q);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|extmetadata");
  url.searchParams.set("iiurlwidth", "480");

  const { statusCode, body } = await request(url.toString(), {
    method: "GET",
    headers: { "user-agent": ua, accept: "application/json" },
    headersTimeout: 10_000,
    bodyTimeout: 12_000,
  });

  if (statusCode !== 200) return [];

  let json: unknown;
  try {
    json = await body.json();
  } catch {
    return [];
  }

  const pages = (json as { query?: { pages?: Record<string, WikiQueryPage> } })?.query?.pages;
  if (!pages || typeof pages !== "object") return [];

  const okMime = (m: string | undefined) =>
    m === "image/jpeg" || m === "image/png" || m === "image/webp" || m === "image/gif";

  const out: PetitionImageSuggestion[] = [];
  for (const p of Object.values(pages)) {
    if (out.length >= max) break;
    const ii = p.imageinfo?.[0];
    if (!ii?.url || !okMime(ii.mime)) continue;
    const u = String(ii.url);
    if (!u.startsWith("https://upload.wikimedia.org/")) continue;
    const thumb = (ii.thumburl && ii.thumburl.startsWith("https://") ? ii.thumburl : u) as string;
    const title = p.title ? fileTitleToHuman(p.title) : "Image";
    const sourceUrl =
      (ii.descriptionshorturl && String(ii.descriptionshorturl).startsWith("https://")
        ? ii.descriptionshorturl
        : `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title ?? "File:")}`) as string;
    const licenseShort = ii.extmetadata?.LicenseShortName?.value?.trim();
    out.push({
      imageUrl: u,
      thumbUrl: thumb,
      title,
      sourceUrl,
      licenseShort: licenseShort || undefined,
    });
  }
  return out;
}
