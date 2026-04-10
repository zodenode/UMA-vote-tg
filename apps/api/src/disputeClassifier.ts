import type { Hex } from "viem";

function hexToUtf8(hex: Hex): string {
  try {
    const raw = hex.replace(/^0x/, "");
    if (raw.length % 2) return "";
    return Buffer.from(raw, "hex").toString("utf8");
  } catch {
    return "";
  }
}

const TOPIC_KEYWORDS: { tag: string; words: RegExp }[] = [
  { tag: "crypto", words: /\b(bitcoin|btc|ethereum|eth|solana|defi|chainlink|token|stablecoin|usdc|usdt|curve|uniswap)\b/i },
  { tag: "geopolitics", words: /\b(election|president|nato|ukraine|iran|israel|gaza|congress|senate|united nations|war|sanction)\b/i },
  { tag: "sports", words: /\b(nba|nfl|mlb|ufc|olympics|world cup|super bowl|championship|playoff)\b/i },
];

export function classifyDispute(opts: {
  ancillaryData: Hex;
  requester: `0x${string}`;
  polymarketRequesters: Set<string>;
}): { sourceLabel: string; topicTags: string[] } {
  const text = hexToUtf8(opts.ancillaryData);
  const lower = text.toLowerCase();
  const req = opts.requester.toLowerCase();

  let sourceLabel = "Other";
  if (lower.includes("polymarket") || opts.polymarketRequesters.has(req)) {
    sourceLabel = "Polymarket";
  }

  const topicTags = new Set<string>();
  for (const { tag, words } of TOPIC_KEYWORDS) {
    if (words.test(text)) topicTags.add(tag);
  }
  if (topicTags.size === 0) topicTags.add("general");

  return { sourceLabel, topicTags: [...topicTags] };
}

/** Voter dApp deep link with context (hash/query); dApp may ignore unknown params. */
export function voterDappDeepLink(opts: {
  identifier: Hex;
  timestamp: bigint;
  ancillaryData: Hex;
}): string {
  const id = opts.identifier.slice(2);
  const ts = opts.timestamp.toString();
  const anc = opts.ancillaryData === "0x" ? "" : opts.ancillaryData.slice(2);
  return `https://vote.umaproject.org/?umaContext=1&identifier=0x${id}&time=${ts}&ancillary=0x${anc}`;
}
