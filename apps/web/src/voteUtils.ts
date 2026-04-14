import type { Hex } from "viem";

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
