import type { Hex } from "viem";
import type { Dispute, VoteReq } from "./voteTypes";

function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace(/^0x/i, "");
  if (!h || h.length % 2) return new Uint8Array(0);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function trimNullTail(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return bytes.subarray(0, end);
}

/** Decode hex-encoded UTF-8 (e.g. bytes32 price identifier, ancillary bytes) when it is mostly printable text. */
export function utf8HexToReadable(hex: string | null | undefined): string | null {
  if (!hex || hex === "0x") return null;
  try {
    const bytes = trimNullTail(hexToBytes(hex));
    if (bytes.length === 0) return null;
    const s = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000/g, "").trim();
    if (s.length < 2) return null;
    const ok = [...s].every((c) => {
      const code = c.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code < 0xd800) || code >= 0xe000;
    });
    if (!ok) return null;
    return s;
  } catch {
    return null;
  }
}

/** VotingV2 price identifiers are often ASCII left-padded in a bytes32 (e.g. YES_OR_NO_QUERY). */
export function decodeDvmIdentifierLabel(identifierId: string): string {
  const t = identifierId.trim();
  const normalized = t.startsWith("0x") ? t : /^[0-9a-fA-F]{64}$/.test(t) ? `0x${t}` : t;
  if (/^0x[0-9a-fA-F]{64}$/i.test(normalized)) {
    const readable = utf8HexToReadable(normalized);
    if (readable) return readable;
  }
  return identifierId;
}

export type AncillarySummary = {
  /** Short line for list cards */
  line: string | null;
  /** Outcome labels when ancillary JSON includes them (Polymarket-style) */
  outcomes: string[] | null;
};

/**
 * Polymarket Managed Optimistic Oracle (Polygon) often encodes ancillary as plain text:
 * `q: title: …, description: … market_id: …` (not JSON, no CTF condition id).
 */
export function extractPolymarketManagedOoTitle(utf8: string): string | null {
  const headQ = /(^|[\n\r])\s*q:\s*title:\s*/im;
  const mq = headQ.exec(utf8);
  if (mq) {
    const start = mq.index + mq[0].length;
    const tail = utf8.slice(start);
    const d = tail.search(/,\s*description:\s*/i);
    if (d >= 0) {
      const t = tail.slice(0, d).trim().replace(/\s+/g, " ");
      if (t.length >= 8) return t;
    }
  }
  const headT = /(^|[\n\r])\s*title:\s*/im;
  const mt = headT.exec(utf8);
  if (mt && mt.index < 160) {
    const start = mt.index + mt[0].length;
    const tail = utf8.slice(start);
    const d = tail.search(/,\s*description:\s*/i);
    if (d >= 0) {
      const t = tail.slice(0, d).trim().replace(/\s+/g, " ");
      if (t.length >= 8) return t;
    }
  }
  return null;
}

/** `Where p1 corresponds to No, p2 to Yes, p3 to unknown.` (Managed OO template). */
function parsePolymarketManagedOoOutcomes(utf8: string): string[] | null {
  const m = utf8.match(
    /p1 corresponds to\s*([^,]+?)\s*,\s*p2 to\s*([^,]+?)\s*,\s*p3 to\s*([^.]+?)\s*\./i
  );
  if (!m) return null;
  const out = [m[1], m[2], m[3]].map((s) => s.trim()).filter((s) => s.length > 0);
  return out.length === 3 ? out : null;
}

/** Pull human text from ancillary bytes (JSON question/title/outcomes or plain UTF-8 snippet). */
export function summarizeAncillaryData(ancillaryHex: string | null | undefined): AncillarySummary {
  if (!ancillaryHex || ancillaryHex === "0x") return { line: null, outcomes: null };
  const utf8 = utf8HexToReadable(ancillaryHex);
  if (!utf8) return { line: null, outcomes: null };

  const managedTitle = extractPolymarketManagedOoTitle(utf8);
  if (managedTitle) {
    const managedOutcomes = parsePolymarketManagedOoOutcomes(utf8);
    return { line: managedTitle, outcomes: managedOutcomes };
  }

  try {
    const j = JSON.parse(utf8) as Record<string, unknown>;
    const title =
      typeof j.title === "string"
        ? j.title.trim()
        : typeof j.question === "string"
          ? j.question.trim()
          : typeof j.description === "string"
            ? j.description.trim()
            : null;
    let outcomes: string[] | null = null;
    if (Array.isArray(j.outcomes)) outcomes = j.outcomes.map((x) => String(x));
    else if (typeof j.outcomes === "string") {
      try {
        const o = JSON.parse(j.outcomes) as unknown;
        if (Array.isArray(o)) outcomes = o.map(String);
      } catch {
        /* ignore */
      }
    }
    const line =
      title ??
      (outcomes?.length ? null : utf8.replace(/\s+/g, " ").trim().slice(0, 180) || null);
    return { line, outcomes };
  } catch {
    const one = utf8.replace(/\s+/g, " ").trim();
    return { line: one.length > 180 ? `${one.slice(0, 177)}…` : one || null, outcomes: null };
  }
}

/** Official UMA voter dApp deep link (same query shape as our API helper). */
export function umaVoterDappUrl(identifierHex: Hex | string, time: string, ancillaryData: string | null | undefined): string {
  const id = (typeof identifierHex === "string" ? identifierHex : String(identifierHex)).replace(/^0x/i, "");
  const anc = ancillaryData && ancillaryData !== "0x" ? ancillaryData.replace(/^0x/i, "") : "";
  return `https://vote.umaproject.org/?umaContext=1&identifier=0x${id}&time=${encodeURIComponent(time)}&ancillary=0x${anc}`;
}

/** Same encoding as API `voteFocusToken` for `/votes/dispute/:token` links. */
export function encodeVoteFocusToken(id: string): string {
  const b = new TextEncoder().encode(id);
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function identifierToHex(id: string): Hex {
  const s = id.trim();
  if (s.startsWith("0x")) return s as Hex;
  if (/^[0-9a-fA-F]{64}$/.test(s)) return `0x${s}` as Hex;
  return s as Hex;
}

export function formatDuration(sec: number): string {
  if (sec <= 0) return "0m";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Live countdown with seconds (locale-neutral numeric parts). */
export function formatDurationClock(sec: number): string {
  const s0 = Math.max(0, Math.floor(sec));
  const h = Math.floor(s0 / 3600);
  const m = Math.floor((s0 % 3600) / 60);
  const s = s0 % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const EN = "en-US" as const;

export function formatEnDateTime(ms: number, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(ms).toLocaleString(EN, opts ?? { dateStyle: "medium", timeStyle: "medium" });
}

/** Human-readable English title for an indexed dispute (Polymarket title or ancillary JSON question). */
export function disputeEnglishTitle(d: Dispute): string {
  const pm = d.polymarket?.title?.trim();
  if (pm) return pm;
  const anc = summarizeAncillaryData(d.ancillaryData);
  if (anc.line) return anc.line;
  return disputeTitle(d);
}

/** English-friendly title for an active VotingV2 row (ancillary JSON preferred over raw identifier). */
export function voteRequestEnglishTitle(r: VoteReq): string {
  const pm = r.polymarketTitle?.trim();
  if (pm) return pm;
  const anc = summarizeAncillaryData(r.ancillaryData);
  if (anc.line) return anc.line;
  return decodeDvmIdentifierLabel(r.identifierId);
}

export function disputeTitle(d: {
  polymarket?: { title?: string | null } | null;
  source: string;
  identifier: string;
}): string {
  const t = d.polymarket?.title?.trim();
  if (t) return t;
  const short = d.identifier.length > 24 ? `${d.identifier.slice(0, 14)}…${d.identifier.slice(-10)}` : d.identifier;
  return `${d.source} · ${short}`;
}
