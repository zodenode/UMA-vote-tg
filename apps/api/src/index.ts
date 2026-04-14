import Fastify from "fastify";
import cors from "@fastify/cors";
import { createHash, randomBytes } from "node:crypto";
import type { Hex, PublicClient } from "viem";
import { getAddress, isAddress, recoverMessageAddress } from "viem";
import { openDb, getOrCreateUser } from "./db.js";
import { verifyInitData, parseUserFromInitData } from "./telegramAuth.js";
import { type PriceRequestSummary } from "./umaSubgraph.js";
import { loadActivePriceRequests } from "./voteRequests.js";
import {
  createEthClient,
  createPolygonOoClient,
  pollDisputePriceLogs,
  rowToDisputeApi,
  txExplorerUrl,
} from "./disputePoll.js";
import { MAINNET, POLYGON, UMA_POLYGON, WMATIC_POLYGON } from "./contracts.js";
import { getDvmTiming, type DvmTiming } from "./dvmTiming.js";
import { parseVaultMasterKey, encryptPrivateKey, decryptPrivateKey } from "./vaultCrypto.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  createVaultForUser,
  custodialCommitVote,
  custodialRevealVote,
  custodialWithdrawNative,
  getVault,
  maxNativeWithdrawWei,
} from "./custodialVoting.js";
import {
  enrichDisputesForApi,
  extractConditionIdFromAncillary,
  type PolymarketEnrichment,
} from "./polymarketEnrichment.js";
import { polymarketSearch } from "./polymarketSearch.js";
import { fetchPolymarketPriceHistory } from "./polymarketPricesHistory.js";
import { decodeVoteFocusToken, encodeVoteFocusToken } from "./voteFocusToken.js";
import {
  computePolymarketReversalWatch,
  type ReversalWatchResult,
} from "./polymarketReversalSignal.js";

const UMA_MAINNET = "0x04Fa0d235C4abf4BcF4787aF4CF447DE572eF828" as const;
const WETH_MAINNET = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;
/** Native ETH placeholder for 0x Swap API v2 */
const ZEROX_NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DATABASE_PATH ?? "./data/uma-vote.db";
const botToken = process.env.BOT_TOKEN ?? "";
const graphKey = process.env.THEGRAPH_API_KEY?.trim() || undefined;
const zeroXKey = process.env.ZEROX_API_KEY;
const feeRecipient = process.env.FEE_RECIPIENT ?? "";
const integratorFeeBps = Number(process.env.INTEGRATOR_FEE_BPS ?? "50");
const cronSecret = process.env.CRON_SECRET ?? "";
const internalSecret = process.env.INTERNAL_API_SECRET ?? "";
const ethRpcUrl = process.env.ETH_RPC_URL ?? "";
const polygonRpcUrl = process.env.POLYGON_RPC_URL ?? "";

const petitionMaxTitleChars = Math.min(200, Math.max(40, Number(process.env.PETITION_MAX_TITLE_CHARS ?? "120")));
const petitionMaxBodyChars = Math.min(8000, Math.max(200, Number(process.env.PETITION_MAX_BODY_CHARS ?? "2000")));
const petitionMaxCommentChars = Math.min(500, Math.max(0, Number(process.env.PETITION_MAX_COMMENT_CHARS ?? "200")));
const petitionCreatesPerDay = Math.min(50, Math.max(1, Number(process.env.PETITION_CREATES_PER_DAY ?? "8")));
const petitionExportIncludesUsername =
  process.env.PETITION_EXPORT_INCLUDES_USERNAME === "1" || process.env.PETITION_EXPORT_INCLUDES_USERNAME === "true";

const PETITION_LEGAL_NOTE =
  "Community expression only — not legal advice. Signing does not create an attorney–client relationship or a lawsuit. Operators do not endorse petition claims.";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const db = openDb(dbPath);

let ethClient: PublicClient | null = null;
if (ethRpcUrl) {
  try {
    ethClient = createEthClient(ethRpcUrl);
    app.log.info("ETH_RPC_URL set — indexing Ethereum OOv2 DisputePrice logs");
  } catch (e) {
    app.log.error(e, "Failed to create Ethereum client");
  }
}

let polygonOoClient: PublicClient | null = null;
if (polygonRpcUrl) {
  try {
    polygonOoClient = createPolygonOoClient(polygonRpcUrl);
    app.log.info("POLYGON_RPC_URL set — indexing Polygon OOv2 DisputePrice logs");
  } catch (e) {
    app.log.error(e, "Failed to create Polygon client");
  }
}

let vaultMasterKey: Buffer | null = null;
try {
  if (process.env.VAULT_MASTER_KEY?.trim()) {
    vaultMasterKey = parseVaultMasterKey(process.env.VAULT_MASTER_KEY);
    app.log.info("VAULT_MASTER_KEY loaded — custodial vault enabled");
  } else {
    app.log.warn("VAULT_MASTER_KEY unset — custodial vault routes disabled");
  }
} catch (e) {
  app.log.error(e, "Invalid VAULT_MASTER_KEY");
  vaultMasterKey = null;
}

const vaultRateLast = new Map<string, number>();
function vaultRateOk(telegramId: string, minGapMs: number): boolean {
  const t = Date.now();
  const prev = vaultRateLast.get(telegramId) ?? 0;
  if (t - prev < minGapMs) return false;
  vaultRateLast.set(telegramId, t);
  return true;
}

type DisputeRow = {
  dispute_key: string;
  chain_id?: string | null;
  requester: string;
  proposer: string;
  disputer: string;
  identifier: string;
  timestamp: string;
  ancillary_data: string;
  proposed_price: string;
  tx_hash: string;
  block_number: number;
  bond_wei: string | null;
  total_stake_wei: string | null;
  source_label: string | null;
  topic_tags: string | null;
};

function loadFilteredDisputes(filters: {
  source?: string;
  topic?: string;
  minBondWei?: string;
  chain?: "1" | "137";
  limit: number;
}): DisputeRow[] {
  const raw = db
    .prepare(
      `SELECT * FROM disputed_queries ORDER BY datetime(detected_at) DESC, CASE WHEN chain_id = '137' THEN 0 ELSE 1 END, block_number DESC, log_index DESC LIMIT 400`
    )
    .all() as DisputeRow[];
  const src = filters.source?.toLowerCase();
  const topic = filters.topic?.toLowerCase();
  let minB: bigint | null = null;
  if (filters.minBondWei) {
    try {
      minB = BigInt(filters.minBondWei);
    } catch {
      minB = null;
    }
  }
  const out: DisputeRow[] = [];
  for (const r of raw) {
    if (filters.chain) {
      const cid = (r.chain_id ?? "1") as "1" | "137";
      if (cid !== filters.chain) continue;
    }
    if (src) {
      const lbl = (r.source_label ?? "other").toLowerCase();
      if (src === "polymarket" && lbl !== "polymarket") continue;
      if (src === "other" && lbl === "polymarket") continue;
    }
    if (topic) {
      let tags: string[] = [];
      try {
        tags = JSON.parse(r.topic_tags ?? "[]") as string[];
      } catch {
        tags = [];
      }
      if (!tags.map((t) => t.toLowerCase()).includes(topic)) continue;
    }
    if (minB !== null) {
      const b = r.bond_wei ? BigInt(r.bond_wei) : 0n;
      if (b < minB) continue;
    }
    out.push(r);
    if (out.length >= filters.limit) break;
  }
  return out;
}

function loadDisputeRowByKey(disputeKey: string): DisputeRow | undefined {
  return db.prepare(`SELECT * FROM disputed_queries WHERE dispute_key = ?`).get(disputeKey) as
    | DisputeRow
    | undefined;
}

function findDisputeRowByConditionId(conditionIdLower: string): DisputeRow | null {
  const raw = db
    .prepare(
      `SELECT * FROM disputed_queries ORDER BY datetime(detected_at) DESC, CASE WHEN chain_id = '137' THEN 0 ELSE 1 END, block_number DESC, log_index DESC LIMIT 600`
    )
    .all() as DisputeRow[];
  for (const r of raw) {
    const cid = extractConditionIdFromAncillary(r.ancillary_data);
    if (cid && cid.toLowerCase() === conditionIdLower) return r;
  }
  return null;
}

function requireInternal(req: { headers: Record<string, string | string[] | undefined> }, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) {
  const h = req.headers.authorization;
  const token = typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!internalSecret || token !== internalSecret) {
    reply.status(403).send({ error: "Forbidden" });
    return false;
  }
  return true;
}

function requireInitData(initData: string | undefined) {
  if (!initData) return { ok: false as const, status: 400, message: "Missing initData" };
  if (!botToken) return { ok: false as const, status: 503, message: "BOT_TOKEN not configured" };
  if (!verifyInitData(initData, botToken)) {
    return { ok: false as const, status: 401, message: "Invalid initData" };
  }
  const user = parseUserFromInitData(initData);
  if (!user?.id) return { ok: false as const, status: 401, message: "No user in initData" };
  return { ok: true as const, userId: String(user.id) };
}

app.get("/health", async () => ({ ok: true }));

app.get<{
  Querystring: { q?: string; limit?: string };
}>("/api/polymarket/search", async (req, reply) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return reply.status(400).send({ error: "q required" });
  if (q.length > 240) return reply.status(400).send({ error: "q too long" });
  const limit = Math.min(15, Math.max(1, Number(req.query.limit ?? 8)));
  try {
    const results = await polymarketSearch(q, limit);
    return { results };
  } catch (e) {
    req.log.warn(e, "polymarket search failed");
    return reply.status(502).send({ error: "Polymarket search unavailable" });
  }
});

app.get<{
  Querystring: { tokenId?: string; interval?: string };
}>("/api/polymarket/prices-history", async (req, reply) => {
  const tokenId = String(req.query.tokenId ?? "").trim();
  const interval = String(req.query.interval ?? "1d").trim();
  const out = await fetchPolymarketPriceHistory(tokenId, interval);
  if (!out.ok) {
    return reply.status(400).send({ error: out.error });
  }
  return { history: out.history };
});

app.get<{
  Querystring: { conditionId?: string };
}>("/api/disputes/by-condition", async (req, reply) => {
  const raw = String(req.query.conditionId ?? "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(raw)) {
    return reply.status(400).send({ error: "invalid conditionId" });
  }
  const row = findDisputeRowByConditionId(raw);
  if (!row) return { found: false as const };
  const chainId = Number(row.chain_id ?? 137);
  return {
    found: true as const,
    disputeId: row.dispute_key,
    chainId: Number.isFinite(chainId) ? chainId : 137,
  };
});

app.get<{
  Params: { token: string };
}>(
  "/api/dispute/:token",
  async (req, reply): Promise<{
    dispute: ReturnType<typeof rowToDisputeApi> & {
      polymarket: PolymarketEnrichment | null;
    } & ReversalWatchResult;
    dvm: DvmTiming | null;
    vaultEnabled: boolean;
    rpcConfigured: boolean;
    polygonOoConfigured: boolean;
  } | void> => {
    const decoded = decodeVoteFocusToken(req.params.token);
    if (!decoded) {
      return reply.status(400).send({ error: "invalid token" });
    }
    const row = loadDisputeRowByKey(decoded);
    if (!row) {
      return reply.status(404).send({ error: "dispute not found" });
    }
    const dvm = ethClient ? await getDvmTiming(ethClient) : null;
    const currentDvmRound = dvm?.roundId ?? null;
    const pmMap = await enrichDisputesForApi([row], 5);
    const polymarket = pmMap.get(row.dispute_key) ?? null;
    const dispute = {
      ...rowToDisputeApi(row, currentDvmRound),
      polymarket,
      ...computePolymarketReversalWatch(row.proposed_price, polymarket),
    };
    return {
      dispute,
      dvm,
      vaultEnabled: Boolean(vaultMasterKey && ethClient && ethRpcUrl),
      rpcConfigured: Boolean(ethClient),
      polygonOoConfigured: Boolean(polygonOoClient),
    };
  }
);

app.post<{
  Headers: Record<string, string | string[] | undefined>;
  Body: { telegramId?: string; username?: string; ref?: string | null };
}>("/api/internal/ensure-user", async (req, reply) => {
  if (!requireInternal(req, reply)) return;
  const telegramId = req.body?.telegramId;
  if (!telegramId) return reply.status(400).send({ error: "telegramId required" });
  const ref = req.body.ref?.trim() || null;
  const user = getOrCreateUser(db, telegramId, ref);
  return {
    telegramId: user.telegram_id,
    refCode: user.ref_code,
    referredBy: user.referred_by,
    alertsOn: Boolean(user.alerts_on),
  };
});

app.post<{ Body: { initData?: string; ref?: string | null } }>("/api/session", async (req, reply) => {
  const initData = req.body?.initData;
  const ref = req.body?.ref?.trim() || null;
  const v = requireInitData(initData);
  if (!v.ok) return reply.status(v.status).send({ error: v.message });
  const user = getOrCreateUser(db, v.userId, ref);
  return {
    telegramId: user.telegram_id,
    refCode: user.ref_code,
    referredBy: user.referred_by,
    alertsOn: Boolean(user.alerts_on),
  };
});

app.post<{
  Headers: Record<string, string | string[] | undefined>;
  Body: { telegramId?: string; alertsOn?: boolean };
}>("/api/internal/alerts", async (req, reply) => {
  if (!requireInternal(req, reply)) return;
  const telegramId = req.body?.telegramId;
  if (!telegramId) return reply.status(400).send({ error: "telegramId required" });
  const alertsOn = Boolean(req.body?.alertsOn);
  getOrCreateUser(db, telegramId, null);
  db.prepare(`UPDATE users SET alerts_on = ? WHERE telegram_id = ?`).run(alertsOn ? 1 : 0, telegramId);
  return { ok: true, alertsOn };
});

app.post<{ Body: { initData?: string; alertsOn: boolean } }>(
  "/api/me/alerts",
  async (req, reply) => {
    const v = requireInitData(req.body?.initData);
    if (!v.ok) return reply.status(v.status).send({ error: v.message });
    getOrCreateUser(db, v.userId, null);
    db.prepare(`UPDATE users SET alerts_on = ? WHERE telegram_id = ?`).run(
      req.body.alertsOn ? 1 : 0,
      v.userId
    );
    return { ok: true, alertsOn: req.body.alertsOn };
  }
);

app.get<{
  Querystring: {
    source?: string;
    topic?: string;
    minBondWei?: string;
    limit?: string;
    chain?: string;
    /** When "1", skip active price-request subgraph/RPC + DVM timing — faster for landing dispute lists only. */
    omitRequests?: string;
  };
  }>(
  "/api/votes",
  async (req): Promise<{
    requests: PriceRequestSummary[];
    disputes: (ReturnType<typeof rowToDisputeApi> & {
      polymarket: PolymarketEnrichment | null;
    } & ReversalWatchResult)[];
    dvm: DvmTiming | null;
    rpcConfigured: boolean;
    polygonOoConfigured: boolean;
    error?: string;
    subgraphError?: string;
    requestsSource?: "subgraph" | "rpc";
    vaultEnabled: boolean;
  }> => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 25)));
    const chainQ = req.query.chain;
    const chainFilter =
      chainQ === "1" || chainQ === "137" ? (chainQ as "1" | "137") : undefined;
    const omitRequests = req.query.omitRequests === "1" || req.query.omitRequests === "true";
    const rows = loadFilteredDisputes({
      source: req.query.source,
      topic: req.query.topic,
      minBondWei: req.query.minBondWei,
      chain: chainFilter,
      limit,
    });
    const enrichCap = Math.min(Math.max(limit, 1), rows.length || 1);
    /** Subgraph/RPC requests, DVM timing, and Polymarket enrichment are independent — run in parallel so TTFB is ~max(latency) not sum. */
    const requestsP: Promise<{
      requests: PriceRequestSummary[];
      subgraphError?: string;
      requestsSource?: "subgraph" | "rpc";
    }> = omitRequests
      ? Promise.resolve({ requests: [] })
      : loadActivePriceRequests(graphKey, ethClient, 20);
    const dvmP: Promise<DvmTiming | null> =
      omitRequests || !ethClient ? Promise.resolve(null) : getDvmTiming(ethClient);
    const pmP = enrichDisputesForApi(rows, enrichCap);
    const [loaded, dvm, pmMap] = await Promise.all([requestsP, dvmP, pmP]);
    const requests = loaded.requests;
    const subgraphError = loaded.subgraphError;
    const requestsSource = loaded.requestsSource;
    const currentDvmRound = dvm?.roundId ?? null;
    const disputes = rows.map((r) => {
      const polymarket = pmMap.get(r.dispute_key) ?? null;
      return {
        ...rowToDisputeApi(r, currentDvmRound),
        polymarket,
        ...computePolymarketReversalWatch(r.proposed_price, polymarket),
      };
    });
    return {
      requests,
      subgraphError,
      requestsSource,
      disputes,
      dvm,
      rpcConfigured: Boolean(ethClient),
      polygonOoConfigured: Boolean(polygonOoClient),
      vaultEnabled: Boolean(vaultMasterKey && ethClient && ethRpcUrl),
    };
  }
);

app.get<{
  Querystring: {
    sellToken?: string;
    buyToken?: string;
    sellAmount?: string;
    takerAddress?: string;
    chainId?: string;
  };
}>("/api/swap/quote", async (req, reply) => {
  if (!zeroXKey) {
    return reply.status(503).send({ error: "ZEROX_API_KEY not configured" });
  }
  const rawChain = req.query.chainId ?? "137";
  const chainId = rawChain === "1" || rawChain === "137" ? rawChain : "137";

  const rawSell = String(req.query.sellToken ?? (chainId === "137" ? "POL" : "ETH"));
  const upperSell = rawSell.toUpperCase();

  let sellToken: string;
  if (chainId === "137") {
    if (upperSell === "POL" || upperSell === "MATIC") {
      sellToken = ZEROX_NATIVE_ETH;
    } else if (/^0x[a-fA-F0-9]{40}$/.test(rawSell)) {
      sellToken = rawSell;
    } else {
      sellToken = WMATIC_POLYGON;
    }
  } else if (upperSell === "ETH") {
    sellToken = ZEROX_NATIVE_ETH;
  } else if (/^0x[a-fA-F0-9]{40}$/.test(rawSell)) {
    sellToken = rawSell;
  } else {
    sellToken = WETH_MAINNET;
  }

  const buyToken =
    typeof req.query.buyToken === "string" && /^0x[a-fA-F0-9]{40}$/.test(req.query.buyToken)
      ? req.query.buyToken
      : chainId === "137"
        ? UMA_POLYGON
        : UMA_MAINNET;

  const sellAmount = req.query.sellAmount;
  if (!sellAmount) {
    return reply.status(400).send({ error: "sellAmount required (wei)" });
  }
  const taker = req.query.takerAddress ?? "0x0000000000000000000000000000000000000000";
  const params = new URLSearchParams({
    chainId,
    sellToken,
    buyToken,
    sellAmount,
    taker,
    slippageBps: "100",
  });
  const feeBps = Math.min(100, Math.max(0, Math.round(integratorFeeBps)));
  if (feeRecipient && feeBps > 0) {
    params.set("swapFeeRecipient", feeRecipient);
    params.set("swapFeeBps", String(feeBps));
    params.set("swapFeeToken", buyToken);
  }
  const url = `https://api.0x.org/swap/allowance-holder/quote?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      "0x-api-key": zeroXKey,
      "0x-version": "v2",
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const j = json as { reason?: string; message?: string; name?: string };
    const msg = j.message ?? j.reason ?? j.name ?? "0x quote failed";
    return reply.status(502).send({ error: msg, details: json });
  }
  const j = json as Record<string, unknown>;
  if (j.liquidityAvailable === false) {
    return reply.status(502).send({ error: "No liquidity for this swap", details: j });
  }
  const tx = j.transaction as { to?: string; data?: string; value?: string } | undefined;
  const normalized = {
    ...j,
    to: tx?.to,
    data: tx?.data,
    value: tx?.value,
  };
  const network = chainId === "137" ? "Polygon" : "Ethereum mainnet";
  const disclosure =
    chainId === "137"
      ? "Swap API v2 (AllowanceHolder) on Polygon. Integrator fee may apply on the buy token. You pay Polygon gas in POL."
      : "Swap API v2 (AllowanceHolder). Integrator fee uses swapFeeBps on the buy token when configured. You pay Ethereum network gas separately.";
  return {
    quote: normalized,
    integratorFeeBps,
    feeRecipient: feeRecipient || null,
    chainId,
    network,
    disclosure,
  };
});

app.post<{
  Headers: Record<string, string | string[] | undefined>;
  Body: { chatId?: string; title?: string; delta?: 1 | -1 };
}>("/api/internal/group-alerts-delta", async (req, reply) => {
  if (!requireInternal(req, reply)) return;
  const chatId = req.body.chatId;
  const delta = req.body.delta;
  if (!chatId || (delta !== 1 && delta !== -1)) {
    return reply.status(400).send({ error: "chatId and delta (+1|-1) required" });
  }
  const row = db.prepare(`SELECT alerts_members FROM group_stats WHERE chat_id = ?`).get(chatId) as
    | { alerts_members: number }
    | undefined;
  const current = row?.alerts_members ?? 0;
  const next = Math.max(0, current + (delta === 1 ? 1 : -1));
  const title = req.body.title ?? null;
  db.prepare(
    `INSERT INTO group_stats (chat_id, title, alerts_members, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(chat_id) DO UPDATE SET
       title = COALESCE(?, group_stats.title),
       alerts_members = excluded.alerts_members,
       updated_at = datetime('now')`
  ).run(chatId, title, next, title, next);
  return { ok: true, alertsMembers: next };
});

app.post<{
  Headers: Record<string, string | string[] | undefined>;
  Body: { chatId?: string; enabled?: boolean; title?: string | null };
}>("/api/internal/group-broadcast-set", async (req, reply) => {
  if (!requireInternal(req, reply)) return;
  const chatId = req.body.chatId;
  if (!chatId || typeof req.body.enabled !== "boolean") {
    return reply.status(400).send({ error: "chatId and enabled (boolean) required" });
  }
  const title = req.body.title ?? null;
  db.prepare(
    `INSERT INTO group_broadcasts (chat_id, enabled, title, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(chat_id) DO UPDATE SET
       enabled = excluded.enabled,
       title = COALESCE(excluded.title, group_broadcasts.title),
       updated_at = datetime('now')`
  ).run(chatId, req.body.enabled ? 1 : 0, title);
  return { ok: true };
});

app.post<{
  Body: { initData?: string; chatId: string; title?: string; delta: 1 | -1 };
}>("/api/groups/alerts-member", async (req, reply) => {
  const v = requireInitData(req.body?.initData);
  if (!v.ok) return reply.status(v.status).send({ error: v.message });
  const chatId = req.body.chatId;
  if (!chatId) return reply.status(400).send({ error: "chatId required" });
  const row = db.prepare(`SELECT alerts_members FROM group_stats WHERE chat_id = ?`).get(chatId) as
    | { alerts_members: number }
    | undefined;
  const current = row?.alerts_members ?? 0;
  const next = Math.max(0, current + (req.body.delta === 1 ? 1 : -1));
  const title = req.body.title ?? null;
  db.prepare(
    `INSERT INTO group_stats (chat_id, title, alerts_members, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(chat_id) DO UPDATE SET
       title = COALESCE(?, group_stats.title),
       alerts_members = excluded.alerts_members,
       updated_at = datetime('now')`
  ).run(chatId, title, next, title, next);
  return { ok: true, alertsMembers: next };
});

app.get<{ Params: { code: string } }>("/api/referrals/:code", async (req, reply) => {
  const u = db.prepare(`SELECT telegram_id FROM users WHERE ref_code = ?`).get(req.params.code) as
    | { telegram_id: string }
    | undefined;
  if (!u) return reply.status(404).send({ error: "Unknown code" });
  return { ok: true };
});

function newPetitionId(): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = randomBytes(12).toString("hex");
    const exists = db.prepare(`SELECT 1 FROM petitions WHERE id = ?`).get(id);
    if (!exists) return id;
  }
  throw new Error("Could not allocate petition id");
}

const petitionSignTtlMs = 15 * 60 * 1000;
const petitionMaxImageUrlLen = 2048;

function normalizeLinkedEthAddress(raw: string): `0x${string}` | null {
  const s = raw.trim();
  if (!isAddress(s)) return null;
  try {
    return getAddress(s) as `0x${string}`;
  } catch {
    return null;
  }
}

function validatePetitionImageUrl(raw: string | null | undefined): string | null {
  const u = (raw ?? "").trim();
  if (!u) return null;
  if (u.length > petitionMaxImageUrlLen) return null;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  return u;
}

function normalizeConditionId(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (!/^0x[a-f0-9]{64}$/.test(s)) return null;
  return s;
}

function issuedAtFresh(issuedAt: string): boolean {
  const t = Date.parse(issuedAt);
  if (!Number.isFinite(t)) return false;
  return Math.abs(Date.now() - t) <= petitionSignTtlMs;
}

function buildWalletLinkMessage(telegramId: string, issuedAt: string): string {
  return `UMA Vote TG — verify wallet ownership\nTelegram user ID: ${telegramId}\nIssued at (UTC): ${issuedAt}`;
}

function buildPetitionSignMessage(telegramId: string, petitionId: string, issuedAt: string): string {
  return `UMA Vote TG — sign community petition\nPetition ID: ${petitionId}\nTelegram user ID: ${telegramId}\nIssued at (UTC): ${issuedAt}`;
}

function getLinkedWalletRow(telegramId: string): { address: string } | undefined {
  return db.prepare(`SELECT address FROM user_linked_wallets WHERE telegram_id = ?`).get(telegramId) as
    | { address: string }
    | undefined;
}

function signerExportRef(petitionId: string, signerTelegramId: string): string {
  if (petitionExportIncludesUsername) return signerTelegramId;
  return createHash("sha256").update(`petition|${petitionId}|${signerTelegramId}`).digest("hex").slice(0, 24);
}

function csvEscapeCell(s: string): string {
  const t = s.replace(/\r\n/g, "\n");
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function petitionSignatureCounts(petitionId: string): { total: number; verified: number } {
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM petition_signatures WHERE petition_id = ?`).get(petitionId) as {
      c: number;
    }
  ).c;
  const verified = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM petition_signatures WHERE petition_id = ?
         AND wallet_address IS NOT NULL AND TRIM(wallet_address) != ''
         AND wallet_signature IS NOT NULL AND TRIM(wallet_signature) != ''`
      )
      .get(petitionId) as { c: number }
  ).c;
  return { total, verified };
}

async function petitionWalletSignCore(
  telegramId: string,
  petitionId: string,
  comment: string | null,
  walletAddress: `0x${string}`,
  walletMessage: string,
  walletSignature: Hex
): Promise<{ ok: true; signatureCount: number; verifiedSignatureCount: number } | { status: number; error: string }> {
  getOrCreateUser(db, telegramId, null);
  const row = db.prepare(`SELECT id, hidden, closed_at FROM petitions WHERE id = ?`).get(petitionId) as
    | { id: string; hidden: number; closed_at: string | null }
    | undefined;
  if (!row) return { status: 404, error: "Petition not found" };
  if (row.hidden) return { status: 403, error: "Petition is hidden" };
  if (row.closed_at) return { status: 403, error: "Petition is closed" };
  const linked = getLinkedWalletRow(telegramId);
  if (!linked || linked.address.toLowerCase() !== walletAddress.toLowerCase()) {
    return { status: 403, error: "Wallet not linked to this Telegram account" };
  }
  let recovered: `0x${string}`;
  try {
    recovered = await recoverMessageAddress({ message: walletMessage, signature: walletSignature });
  } catch {
    return { status: 400, error: "Invalid wallet signature" };
  }
  if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
    return { status: 400, error: "Signature does not match linked wallet" };
  }
  db.prepare(
    `INSERT INTO petition_signatures (petition_id, signer_telegram_id, comment, signed_at, wallet_address, wallet_message, wallet_signature)
     VALUES (?, ?, ?, datetime('now'), ?, ?, ?)
     ON CONFLICT(petition_id, signer_telegram_id) DO UPDATE SET
       comment = COALESCE(excluded.comment, petition_signatures.comment),
       signed_at = datetime('now'),
       wallet_address = excluded.wallet_address,
       wallet_message = excluded.wallet_message,
       wallet_signature = excluded.wallet_signature`
  ).run(petitionId, telegramId, comment, walletAddress, walletMessage, walletSignature);
  const { total, verified } = petitionSignatureCounts(petitionId);
  return { ok: true, signatureCount: total, verifiedSignatureCount: verified };
}

type PetitionRow = {
  id: string;
  creator_telegram_id: string;
  title: string;
  body: string;
  hidden: number;
  created_at: string;
  closed_at: string | null;
  image_url: string | null;
  dispute_key: string | null;
  condition_id: string | null;
};

function buildPetitionResponse(row: PetitionRow, viewerTelegramId: string | null) {
  const { total: signatureCount, verified: verifiedSignatureCount } = petitionSignatureCounts(row.id);
  const viewerIsCreator = Boolean(viewerTelegramId && viewerTelegramId === row.creator_telegram_id);
  const disputeFocusToken = row.dispute_key ? encodeVoteFocusToken(row.dispute_key) : null;
  const polymarketUrl = row.condition_id
    ? `https://polymarket.com/condition/${encodeURIComponent(row.condition_id)}`
    : null;
  if (row.hidden && !viewerIsCreator) {
    return {
      id: row.id,
      hidden: true,
      title: "This petition is unavailable",
      body: null as string | null,
      imageUrl: null as string | null,
      disputeKey: null as string | null,
      conditionId: null as string | null,
      disputeFocusToken: null as string | null,
      polymarketUrl: null as string | null,
      signatureCount,
      verifiedSignatureCount,
      createdAt: row.created_at,
      legalNote: PETITION_LEGAL_NOTE,
    };
  }
  return {
    id: row.id,
    hidden: Boolean(row.hidden),
    title: row.title,
    body: row.body,
    imageUrl: row.image_url ?? null,
    disputeKey: row.dispute_key ?? null,
    conditionId: row.condition_id ?? null,
    disputeFocusToken,
    polymarketUrl,
    signatureCount,
    verifiedSignatureCount,
    createdAt: row.created_at,
    legalNote: PETITION_LEGAL_NOTE,
  };
}

app.get("/api/petitions/active", async () => {
  const rows = db
    .prepare(
      `SELECT p.* FROM petitions p
       WHERE p.hidden = 0 AND p.closed_at IS NULL
       ORDER BY datetime(p.created_at) DESC
       LIMIT 80`
    )
    .all() as PetitionRow[];
  return {
    petitions: rows.map((r) => {
      const pub = buildPetitionResponse(r, null);
      return {
        id: pub.id,
        title: pub.title,
        hidden: pub.hidden,
        imageUrl: pub.imageUrl,
        disputeKey: pub.disputeKey,
        conditionId: pub.conditionId,
        disputeFocusToken: pub.disputeFocusToken,
        polymarketUrl: pub.polymarketUrl,
        signatureCount: pub.signatureCount,
        verifiedSignatureCount: pub.verifiedSignatureCount,
        createdAt: pub.createdAt,
      };
    }),
  };
});

app.get<{ Params: { id: string }; Querystring: { initData?: string } }>("/api/petitions/:id", async (req, reply) => {
  const rawId = (req.params.id ?? "").trim().toLowerCase();
  if (!rawId || rawId.length > 64 || !/^[a-f0-9]+$/.test(rawId)) {
    return reply.status(400).send({ error: "Invalid petition id" });
  }
  const row = db.prepare(`SELECT * FROM petitions WHERE id = ?`).get(rawId) as PetitionRow | undefined;
  if (!row) return reply.status(404).send({ error: "Not found" });
  let viewerId: string | null = null;
  const initData = typeof req.query.initData === "string" ? req.query.initData : undefined;
  if (initData && botToken && verifyInitData(initData, botToken)) {
    const u = parseUserFromInitData(initData);
    if (u?.id) viewerId = String(u.id);
  }
  return buildPetitionResponse(row, viewerId);
});

app.post<{ Body: { initData?: string; petitionId?: string } }>("/api/me/petition/fetch", async (req, reply) => {
  const v = requireInitData(req.body?.initData);
  if (!v.ok) return reply.status(v.status).send({ error: v.message });
  const petitionId = (req.body?.petitionId ?? "").trim().toLowerCase();
  if (!petitionId || !/^[a-f0-9]+$/.test(petitionId)) {
    return reply.status(400).send({ error: "petitionId required" });
  }
  const row = db.prepare(`SELECT * FROM petitions WHERE id = ?`).get(petitionId) as PetitionRow | undefined;
  if (!row) return reply.status(404).send({ error: "Not found" });
  return buildPetitionResponse(row, v.userId);
});

app.post<{ Body: { initData?: string } }>("/api/me/wallet/status", async (req, reply) => {
  const v = requireInitData(req.body?.initData);
  if (!v.ok) return reply.status(v.status).send({ error: v.message });
  getOrCreateUser(db, v.userId, null);
  const row = getLinkedWalletRow(v.userId);
  return { linked: Boolean(row), address: row?.address ?? null };
});

app.post<{ Body: { initData?: string } }>("/api/me/wallet/link-challenge", async (req, reply) => {
  const v = requireInitData(req.body?.initData);
  if (!v.ok) return reply.status(v.status).send({ error: v.message });
  getOrCreateUser(db, v.userId, null);
  const issuedAt = new Date().toISOString();
  const message = buildWalletLinkMessage(v.userId, issuedAt);
  return { message, issuedAt };
});

app.post<{
  Body: { initData?: string; message?: string; signature?: Hex; issuedAt?: string };
}>("/api/me/wallet/link", async (req, reply) => {
  const v = requireInitData(req.body?.initData);
  if (!v.ok) return reply.status(v.status).send({ error: v.message });
  const message = (req.body?.message ?? "").trim();
  const signature = (req.body?.signature ?? "").trim() as Hex;
  const issuedAt = (req.body?.issuedAt ?? "").trim();
  if (!message || !signature || !issuedAt) {
    return reply.status(400).send({ error: "message, signature, and issuedAt required" });
  }
  if (!issuedAtFresh(issuedAt)) return reply.status(400).send({ error: "issuedAt expired or invalid" });
  const expected = buildWalletLinkMessage(v.userId, issuedAt);
  if (message !== expected) return reply.status(400).send({ error: "message mismatch" });
  let recoveredRaw: string;
  try {
    recoveredRaw = await recoverMessageAddress({ message, signature });
  } catch {
    return reply.status(400).send({ error: "Invalid signature" });
  }
  const addr = normalizeLinkedEthAddress(recoveredRaw);
  if (!addr) return reply.status(400).send({ error: "Could not recover address" });
  getOrCreateUser(db, v.userId, null);
  const taken = db
    .prepare(
      `SELECT telegram_id FROM user_linked_wallets WHERE LOWER(address) = LOWER(?) AND telegram_id != ?`
    )
    .get(addr, v.userId) as { telegram_id: string } | undefined;
  if (taken) {
    return reply.status(409).send({ error: "That wallet is already linked to another Telegram account" });
  }
  db.prepare(
    `INSERT INTO user_linked_wallets (telegram_id, address, linked_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(telegram_id) DO UPDATE SET address = excluded.address, linked_at = datetime('now')`
  ).run(v.userId, addr);
  return { ok: true, address: addr };
});

app.post<{ Body: { initData?: string; petitionId?: string } }>(
  "/api/me/petition/sign-challenge",
  async (req, reply) => {
    const v = requireInitData(req.body?.initData);
    if (!v.ok) return reply.status(v.status).send({ error: v.message });
    const petitionId = (req.body?.petitionId ?? "").trim().toLowerCase();
    if (!petitionId || !/^[a-f0-9]+$/.test(petitionId)) {
      return reply.status(400).send({ error: "petitionId required" });
    }
    const linked = getLinkedWalletRow(v.userId);
    if (!linked) {
      return reply.status(400).send({ error: "Link an Ethereum wallet in the Mini App before signing" });
    }
    const prow = db.prepare(`SELECT id, hidden, closed_at FROM petitions WHERE id = ?`).get(petitionId) as
      | { id: string; hidden: number; closed_at: string | null }
      | undefined;
    if (!prow) return reply.status(404).send({ error: "Petition not found" });
    if (prow.hidden) return reply.status(403).send({ error: "Petition is hidden" });
    if (prow.closed_at) return reply.status(403).send({ error: "Petition is closed" });
    const issuedAt = new Date().toISOString();
    const message = buildPetitionSignMessage(v.userId, petitionId, issuedAt);
    return { message, issuedAt, linkedAddress: linked.address };
  }
);

app.post<{
  Body: {
    initData?: string;
    petitionId?: string;
    message?: string;
    signature?: Hex;
    issuedAt?: string;
    comment?: string | null;
  };
}>("/api/me/petition/sign", async (req, reply) => {
  const v = requireInitData(req.body?.initData);
  if (!v.ok) return reply.status(v.status).send({ error: v.message });
  const petitionId = (req.body?.petitionId ?? "").trim().toLowerCase();
  if (!petitionId || !/^[a-f0-9]+$/.test(petitionId)) {
    return reply.status(400).send({ error: "petitionId required" });
  }
  const message = (req.body?.message ?? "").trim();
  const signature = (req.body?.signature ?? "").trim() as Hex;
  const issuedAt = (req.body?.issuedAt ?? "").trim();
  if (!message || !signature || !issuedAt) {
    return reply.status(400).send({ error: "message, signature, and issuedAt required" });
  }
  if (!issuedAtFresh(issuedAt)) return reply.status(400).send({ error: "issuedAt expired or invalid" });
  const expected = buildPetitionSignMessage(v.userId, petitionId, issuedAt);
  if (message !== expected) return reply.status(400).send({ error: "message mismatch" });
  let comment = (req.body?.comment ?? "").trim() || null;
  if (comment && comment.length > petitionMaxCommentChars) {
    return reply.status(400).send({ error: "comment too long" });
  }
  let recoveredRaw: string;
  try {
    recoveredRaw = await recoverMessageAddress({ message, signature });
  } catch {
    return reply.status(400).send({ error: "Invalid signature" });
  }
  const walletAddress = normalizeLinkedEthAddress(recoveredRaw);
  if (!walletAddress) return reply.status(400).send({ error: "Could not recover address" });
  const out = await petitionWalletSignCore(v.userId, petitionId, comment, walletAddress, message, signature);
  if ("error" in out) return reply.status(out.status).send({ error: out.error });
  return {
    ok: true,
    signatureCount: out.signatureCount,
    verifiedSignatureCount: out.verifiedSignatureCount,
    legalNote: PETITION_LEGAL_NOTE,
  };
});

app.post<{
  Body: {
    initData?: string;
    title?: string;
    body?: string;
    imageUrl?: string;
    disputeKey?: string;
    conditionId?: string;
  };
}>("/api/me/petition/create", async (req, reply) => {
  const v = requireInitData(req.body?.initData);
  if (!v.ok) return reply.status(v.status).send({ error: v.message });
  const title = (req.body?.title ?? "").trim();
  const body = (req.body?.body ?? "").trim();
  const imageUrl = validatePetitionImageUrl(req.body?.imageUrl);
  const disputeKeyRaw = (req.body?.disputeKey ?? "").trim() || null;
  const conditionNorm = normalizeConditionId(req.body?.conditionId);
  if (!title || !body) return reply.status(400).send({ error: "title and body required" });
  if (!imageUrl) return reply.status(400).send({ error: "A valid https imageUrl is required" });
  if (title.length > petitionMaxTitleChars || body.length > petitionMaxBodyChars) {
    return reply.status(400).send({ error: "title or body too long" });
  }
  let disputeKey: string | null = disputeKeyRaw;
  if (disputeKey) {
    const dr = loadDisputeRowByKey(disputeKey);
    if (!dr) return reply.status(400).send({ error: "disputeKey not found in indexed disputes" });
  }
  let conditionId: string | null = conditionNorm;
  if (conditionId && disputeKey) {
    const byC = findDisputeRowByConditionId(conditionId);
    if (!byC || byC.dispute_key !== disputeKey) {
      return reply.status(400).send({ error: "conditionId does not match the selected dispute" });
    }
  } else if (conditionId && !disputeKey) {
    const byC = findDisputeRowByConditionId(conditionId);
    if (!byC) {
      return reply.status(400).send({ error: "conditionId not found on an indexed Polymarket dispute" });
    }
    disputeKey = byC.dispute_key;
  }
  getOrCreateUser(db, v.userId, null);
  const since = db
    .prepare(
      `SELECT COUNT(*) as c FROM petitions WHERE creator_telegram_id = ? AND datetime(created_at) > datetime('now', '-24 hours')`
    )
    .get(v.userId) as { c: number };
  if (since.c >= petitionCreatesPerDay) {
    return reply.status(429).send({ error: "Daily petition create limit reached" });
  }
  const id = newPetitionId();
  db.prepare(
    `INSERT INTO petitions (id, creator_telegram_id, title, body, hidden, created_at, image_url, dispute_key, condition_id)
     VALUES (?, ?, ?, ?, 0, datetime('now'), ?, ?, ?)`
  ).run(id, v.userId, title, body, imageUrl, disputeKey, conditionId);
  return { ok: true, id, legalNote: PETITION_LEGAL_NOTE };
});

app.post<{
  Headers: Record<string, string | string[] | undefined>;
  Body: { telegramId?: string; title?: string; body?: string };
}>("/api/internal/petition/create", async (req, reply) => {
  if (!requireInternal(req, reply)) return;
  const telegramId = (req.body?.telegramId ?? "").trim();
  const title = (req.body?.title ?? "").trim();
  const body = (req.body?.body ?? "").trim();
  if (!telegramId) return reply.status(400).send({ error: "telegramId required" });
  if (!title || !body) return reply.status(400).send({ error: "title and body required" });
  if (title.length > petitionMaxTitleChars || body.length > petitionMaxBodyChars) {
    return reply.status(400).send({ error: "title or body too long" });
  }
  getOrCreateUser(db, telegramId, null);
  const since = db
    .prepare(
      `SELECT COUNT(*) as c FROM petitions WHERE creator_telegram_id = ? AND datetime(created_at) > datetime('now', '-24 hours')`
    )
    .get(telegramId) as { c: number };
  if (since.c >= petitionCreatesPerDay) {
    return reply.status(429).send({ error: "Daily petition create limit reached" });
  }
  const id = newPetitionId();
  db.prepare(
    `INSERT INTO petitions (id, creator_telegram_id, title, body, hidden, created_at, image_url, dispute_key, condition_id)
     VALUES (?, ?, ?, ?, 0, datetime('now'), NULL, NULL, NULL)`
  ).run(id, telegramId, title, body);
  return { ok: true, id, legalNote: PETITION_LEGAL_NOTE };
});

app.post<{
  Headers: Record<string, string | string[] | undefined>;
  Body: { telegramId?: string; petitionId?: string; comment?: string | null };
}>("/api/internal/petition/sign", async (req, reply) => {
  if (!requireInternal(req, reply)) return;
  return reply.status(410).send({
    error:
      "Petitions must be signed in the Telegram Mini App with the same Ethereum wallet linked to your account.",
  });
});

app.post<{
  Headers: Record<string, string | string[] | undefined>;
  Body: { telegramId?: string; petitionId?: string };
}>("/api/internal/petition/report", async (req, reply) => {
  if (!requireInternal(req, reply)) return;
  const telegramId = (req.body?.telegramId ?? "").trim();
  const petitionId = (req.body?.petitionId ?? "").trim().toLowerCase();
  if (!telegramId || !petitionId || !/^[a-f0-9]+$/.test(petitionId)) {
    return reply.status(400).send({ error: "telegramId and petitionId required" });
  }
  getOrCreateUser(db, telegramId, null);
  const p = db.prepare(`SELECT id FROM petitions WHERE id = ?`).get(petitionId);
  if (!p) return reply.status(404).send({ error: "Petition not found" });
  const dup = db
    .prepare(`SELECT 1 FROM petition_reports WHERE petition_id = ? AND reporter_telegram_id = ?`)
    .get(petitionId, telegramId);
  if (dup) return { ok: true, duplicate: true };
  db.prepare(
    `INSERT INTO petition_reports (petition_id, reporter_telegram_id, created_at) VALUES (?, ?, datetime('now'))`
  ).run(petitionId, telegramId);
  return { ok: true };
});

app.post<{
  Headers: Record<string, string | string[] | undefined>;
  Body: { petitionId?: string; hidden?: boolean };
}>("/api/internal/petition/set-hidden", async (req, reply) => {
  if (!requireInternal(req, reply)) return;
  const petitionId = (req.body?.petitionId ?? "").trim().toLowerCase();
  if (!petitionId || !/^[a-f0-9]+$/.test(petitionId) || typeof req.body.hidden !== "boolean") {
    return reply.status(400).send({ error: "petitionId and hidden (boolean) required" });
  }
  const r = db.prepare(`UPDATE petitions SET hidden = ? WHERE id = ?`).run(req.body.hidden ? 1 : 0, petitionId);
  if (r.changes === 0) return reply.status(404).send({ error: "Not found" });
  return { ok: true };
});

app.get<{ Querystring: { secret?: string; petitionId?: string } }>("/api/cron/petition-export", async (req, reply) => {
  if (!assertCron(req, reply)) return;
  const petitionId = (req.query.petitionId ?? "").trim().toLowerCase();
  if (!petitionId || !/^[a-f0-9]+$/.test(petitionId)) {
    return reply.status(400).send({ error: "petitionId query required" });
  }
  const row = db.prepare(`SELECT id FROM petitions WHERE id = ?`).get(petitionId);
  if (!row) return reply.status(404).send({ error: "Not found" });
  const rows = db
    .prepare(
      `SELECT petition_id, signer_telegram_id, comment, signed_at, wallet_address, wallet_signature
       FROM petition_signatures WHERE petition_id = ? ORDER BY signed_at ASC`
    )
    .all(petitionId) as {
    petition_id: string;
    signer_telegram_id: string;
    comment: string | null;
    signed_at: string;
    wallet_address: string | null;
    wallet_signature: string | null;
  }[];
  const header = petitionExportIncludesUsername
    ? "petition_id,signed_at,signer_telegram_id,comment,wallet_verified\n"
    : "petition_id,signed_at,signer_hash,comment,wallet_verified\n";
  const lines = rows.map((r) => {
    const ref = signerExportRef(r.petition_id, r.signer_telegram_id);
    const c = csvEscapeCell((r.comment ?? "").replace(/\r?\n/g, " "));
    const verified =
      r.wallet_address &&
      r.wallet_address.trim() !== "" &&
      r.wallet_signature &&
      r.wallet_signature.trim() !== ""
        ? "1"
        : "0";
    return [csvEscapeCell(r.petition_id), csvEscapeCell(r.signed_at), csvEscapeCell(ref), c, verified].join(",");
  });
  reply
    .header("content-type", "text/csv; charset=utf-8")
    .header("content-disposition", `attachment; filename="petition-${petitionId}-signatures.csv"`);
  return reply.send(`${header}${lines.join("\n")}${lines.length ? "\n" : ""}`);
});

function requireVaultMaster(reply: { status: (n: number) => { send: (b: unknown) => unknown } }): boolean {
  if (!vaultMasterKey) {
    reply.status(503).send({ error: "VAULT_MASTER_KEY not configured" });
    return false;
  }
  return true;
}

function requireVaultSigning(reply: { status: (n: number) => { send: (b: unknown) => unknown } }): boolean {
  if (!requireVaultMaster(reply)) return false;
  if (!ethClient || !ethRpcUrl) {
    reply.status(503).send({ error: "ETH_RPC_URL required for vault signing" });
    return false;
  }
  return true;
}

function requireVaultWithdraw(
  chainId: 1 | 137,
  reply: { status: (n: number) => { send: (b: unknown) => unknown } }
): boolean {
  if (!requireVaultMaster(reply)) return false;
  if (chainId === 1) {
    if (!ethClient || !ethRpcUrl) {
      reply.status(503).send({ error: "ETH_RPC_URL required for Ethereum withdrawals" });
      return false;
    }
    return true;
  }
  if (!polygonOoClient || !polygonRpcUrl) {
    reply.status(503).send({ error: "POLYGON_RPC_URL required for Polygon withdrawals" });
    return false;
  }
  return true;
}

app.post<{ Body: { initData?: string } }>("/api/vault/create", async (req, reply) => {
  if (!requireVaultMaster(reply)) return;
  const v = requireInitData(req.body?.initData);
  if (!v.ok) return reply.status(v.status).send({ error: v.message });
  getOrCreateUser(db, v.userId, null);
  const existing = getVault(db, v.userId);
  if (existing) {
    return { ok: true, address: existing.address, created: false };
  }
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  const enc = encryptPrivateKey(vaultMasterKey!, pk);
  createVaultForUser(
    db,
    v.userId,
    account.address,
    Buffer.from(enc.ciphertextB64, "base64"),
    enc.iv,
    enc.authTagB64
  );
  return { ok: true, address: account.address, created: true };
});

app.post<{ Body: { initData?: string } }>("/api/vault/status", async (req, reply) => {
  const v = requireInitData(req.body?.initData);
  if (!v.ok) return reply.status(v.status).send({ error: v.message });
  const row = getVault(db, v.userId);
  return {
    vaultEnabled: Boolean(vaultMasterKey && ethClient && ethRpcUrl),
    address: row?.address ?? null,
    exportedOnce: Boolean(row?.exported_once),
  };
});

app.post<{ Body: { initData?: string } }>("/api/vault/balances", async (req, reply) => {
  if (!requireVaultMaster(reply)) return;
  const v = requireInitData(req.body?.initData);
  if (!v.ok) return reply.status(v.status).send({ error: v.message });
  const row = getVault(db, v.userId);
  if (!row?.address) {
    return reply.status(404).send({ error: "No vault" });
  }
  const addr = row.address as `0x${string}`;
  let ethWei: string | null = null;
  let polWei: string | null = null;
  if (ethClient) {
    const b = await ethClient.getBalance({ address: addr });
    ethWei = b.toString();
  }
  if (polygonOoClient) {
    const b = await polygonOoClient.getBalance({ address: addr });
    polWei = b.toString();
  }
  return { address: row.address, ethWei, polWei };
});

app.post<{
  Body: { initData?: string; chainId?: number | string; to?: string; amountWei?: string };
}>("/api/vault/withdraw", async (req, reply) => {
  const rawChain = Number(req.body?.chainId);
  if (rawChain !== 1 && rawChain !== 137) {
    return reply.status(400).send({ error: "chainId must be 1 or 137" });
  }
  const chainId = rawChain as 1 | 137;
  if (!requireVaultWithdraw(chainId, reply)) return;
  const v = requireInitData(req.body?.initData);
  if (!v.ok) return reply.status(v.status).send({ error: v.message });
  if (!vaultRateOk(v.userId, 3000)) {
    return reply.status(429).send({ error: "Too many vault actions; wait a few seconds." });
  }
  const to = String(req.body?.to ?? "").trim();
  const amountRaw = String(req.body?.amountWei ?? "").trim();
  if (!to || !amountRaw) {
    return reply.status(400).send({ error: "to and amountWei required (amountWei may be MAX for full native minus gas)" });
  }
  const pc = chainId === 1 ? ethClient! : polygonOoClient!;
  const row = getVault(db, v.userId);
  if (!row) return reply.status(404).send({ error: "No vault" });
  const vaultAddr = row.address as `0x${string}`;
  let amountWei: bigint;
  if (amountRaw.toUpperCase() === "MAX") {
    amountWei = await maxNativeWithdrawWei(pc, vaultAddr);
    if (amountWei <= 0n) {
      return reply.status(400).send({ error: "Nothing to withdraw after reserving gas" });
    }
  } else {
    try {
      amountWei = BigInt(amountRaw);
    } catch {
      return reply.status(400).send({ error: "Invalid amountWei" });
    }
  }
  getOrCreateUser(db, v.userId, null);
  try {
    const { txHash } = await custodialWithdrawNative({
      db,
      masterKey: vaultMasterKey!,
      telegramId: v.userId,
      chainId,
      to: to as `0x${string}`,
      amountWei,
      ethRpcUrl,
      polygonRpcUrl,
      publicClient: pc,
    });
    return { ok: true, txHash, chainId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Withdraw failed";
    return reply.status(502).send({ error: msg });
  }
});

app.post<{ Body: { initData?: string } }>("/api/vault/export", async (req, reply) => {
  if (!requireVaultMaster(reply)) return;
  const v = requireInitData(req.body?.initData);
  if (!v.ok) return reply.status(v.status).send({ error: v.message });
  const row = getVault(db, v.userId);
  if (!row) return reply.status(404).send({ error: "No vault" });
  if (row.exported_once) {
    return reply.status(403).send({ error: "Private key was already exported once" });
  }
  const pk = decryptPrivateKey(
    vaultMasterKey!,
    row.iv,
    Buffer.from(row.enc_private_key).toString("base64"),
    row.auth_tag
  );
  db.prepare(`UPDATE user_vaults SET exported_once = 1 WHERE telegram_id = ?`).run(v.userId);
  return {
    ok: true,
    privateKey: pk,
    warning: "Anyone with this key controls the wallet. Store offline; we cannot show it again.",
  };
});

app.post<{
  Body: { initData?: string; disputeKey?: string; price?: string };
}>("/api/vault/vote/commit", async (req, reply) => {
  if (!requireVaultSigning(reply)) return;
  const v = requireInitData(req.body?.initData);
  if (!v.ok) return reply.status(v.status).send({ error: v.message });
  if (!vaultRateOk(v.userId, 3000)) {
    return reply.status(429).send({ error: "Too many vault actions; wait a few seconds." });
  }
  const disputeKey = req.body?.disputeKey?.trim();
  const priceStr = req.body?.price?.trim();
  if (!disputeKey || !priceStr) {
    return reply.status(400).send({ error: "disputeKey and price required" });
  }
  let price: bigint;
  try {
    price = BigInt(priceStr);
  } catch {
    return reply.status(400).send({ error: "Invalid price (int256 string)" });
  }
  const dispute = loadDisputeRowByKey(disputeKey);
  if (!dispute) return reply.status(404).send({ error: "Unknown dispute" });
  getOrCreateUser(db, v.userId, null);
  try {
    const { txHash } = await custodialCommitVote({
      db,
      masterKey: vaultMasterKey!,
      publicClient: ethClient!,
      ethRpcUrl,
      telegramId: v.userId,
      disputeKey,
      dispute,
      price,
    });
    return { ok: true, txHash };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Commit failed";
    return reply.status(502).send({ error: msg });
  }
});

app.post<{ Body: { initData?: string; disputeKey?: string } }>("/api/vault/vote/reveal", async (req, reply) => {
  if (!requireVaultSigning(reply)) return;
  const v = requireInitData(req.body?.initData);
  if (!v.ok) return reply.status(v.status).send({ error: v.message });
  if (!vaultRateOk(v.userId, 3000)) {
    return reply.status(429).send({ error: "Too many vault actions; wait a few seconds." });
  }
  const disputeKey = req.body?.disputeKey?.trim();
  if (!disputeKey) return reply.status(400).send({ error: "disputeKey required" });
  getOrCreateUser(db, v.userId, null);
  try {
    const { txHash } = await custodialRevealVote({
      db,
      masterKey: vaultMasterKey!,
      publicClient: ethClient!,
      ethRpcUrl,
      telegramId: v.userId,
      disputeKey,
    });
    return { ok: true, txHash };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Reveal failed";
    return reply.status(502).send({ error: msg });
  }
});

app.post<{ Headers: Record<string, string | string[] | undefined>; Body: { telegramId?: string } }>(
  "/api/internal/vault/create",
  async (req, reply) => {
    if (!requireInternal(req, reply)) return;
    if (!requireVaultMaster(reply)) return;
    const telegramId = req.body?.telegramId;
    if (!telegramId) return reply.status(400).send({ error: "telegramId required" });
    getOrCreateUser(db, telegramId, null);
    const existing = getVault(db, telegramId);
    if (existing) return { ok: true, address: existing.address, created: false };
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const enc = encryptPrivateKey(vaultMasterKey!, pk);
    createVaultForUser(
      db,
      telegramId,
      account.address,
      Buffer.from(enc.ciphertextB64, "base64"),
      enc.iv,
      enc.authTagB64
    );
    return { ok: true, address: account.address, created: true };
  }
);

app.get<{ Headers: Record<string, string | string[] | undefined>; Querystring: { telegramId?: string } }>(
  "/api/internal/vault/status",
  async (req, reply) => {
    if (!requireInternal(req, reply)) return;
    const telegramId = req.query.telegramId;
    if (!telegramId) return reply.status(400).send({ error: "telegramId required" });
    const row = getVault(db, telegramId);
    return {
      vaultEnabled: Boolean(vaultMasterKey && ethClient && ethRpcUrl),
      address: row?.address ?? null,
      exportedOnce: Boolean(row?.exported_once),
    };
  }
);

app.post<{ Headers: Record<string, string | string[] | undefined>; Body: { telegramId?: string } }>(
  "/api/internal/vault/export",
  async (req, reply) => {
    if (!requireInternal(req, reply)) return;
    if (!requireVaultMaster(reply)) return;
    const telegramId = req.body?.telegramId;
    if (!telegramId) return reply.status(400).send({ error: "telegramId required" });
    const row = getVault(db, telegramId);
    if (!row) return reply.status(404).send({ error: "No vault" });
    if (row.exported_once) {
      return reply.status(403).send({ error: "Private key was already exported once" });
    }
    const pk = decryptPrivateKey(
      vaultMasterKey!,
      row.iv,
      Buffer.from(row.enc_private_key).toString("base64"),
      row.auth_tag
    );
    db.prepare(`UPDATE user_vaults SET exported_once = 1 WHERE telegram_id = ?`).run(telegramId);
    return { ok: true, privateKey: pk };
  }
);

app.get<{ Headers: Record<string, string | string[] | undefined>; Querystring: { telegramId?: string } }>(
  "/api/internal/vault/balances",
  async (req, reply) => {
    if (!requireInternal(req, reply)) return;
    if (!requireVaultMaster(reply)) return;
    const telegramId = req.query.telegramId;
    if (!telegramId) return reply.status(400).send({ error: "telegramId required" });
    const row = getVault(db, telegramId);
    if (!row?.address) return reply.status(404).send({ error: "No vault" });
    const addr = row.address as `0x${string}`;
    let ethWei: string | null = null;
    let polWei: string | null = null;
    if (ethClient) ethWei = (await ethClient.getBalance({ address: addr })).toString();
    if (polygonOoClient) polWei = (await polygonOoClient.getBalance({ address: addr })).toString();
    return { address: row.address, ethWei, polWei };
  }
);

app.post<{
  Headers: Record<string, string | string[] | undefined>;
  Body: { telegramId?: string; chainId?: number; to?: string; amountWei?: string };
}>("/api/internal/vault/withdraw", async (req, reply) => {
  if (!requireInternal(req, reply)) return;
  const telegramId = req.body?.telegramId?.trim();
  const rawChain = Number(req.body?.chainId);
  const to = String(req.body?.to ?? "").trim();
  const amountRaw = String(req.body?.amountWei ?? "").trim();
  if (!telegramId || !to || !amountRaw) {
    return reply.status(400).send({ error: "telegramId, chainId, to, amountWei required" });
  }
  if (rawChain !== 1 && rawChain !== 137) {
    return reply.status(400).send({ error: "chainId must be 1 or 137" });
  }
  const chainId = rawChain as 1 | 137;
  if (!requireVaultWithdraw(chainId, reply)) return;
  if (!vaultRateOk(telegramId, 3000)) {
    return reply.status(429).send({ error: "Too many vault actions" });
  }
  const pc = chainId === 1 ? ethClient! : polygonOoClient!;
  const row = getVault(db, telegramId);
  if (!row) return reply.status(404).send({ error: "No vault" });
  const vaultAddr = row.address as `0x${string}`;
  let amountWei: bigint;
  if (amountRaw.toUpperCase() === "MAX") {
    amountWei = await maxNativeWithdrawWei(pc, vaultAddr);
    if (amountWei <= 0n) return reply.status(400).send({ error: "Nothing to withdraw after gas reserve" });
  } else {
    try {
      amountWei = BigInt(amountRaw);
    } catch {
      return reply.status(400).send({ error: "Invalid amountWei" });
    }
  }
  getOrCreateUser(db, telegramId, null);
  try {
    const { txHash } = await custodialWithdrawNative({
      db,
      masterKey: vaultMasterKey!,
      telegramId,
      chainId,
      to: to as `0x${string}`,
      amountWei,
      ethRpcUrl,
      polygonRpcUrl,
      publicClient: pc,
    });
    return { ok: true, txHash, chainId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Withdraw failed";
    return reply.status(502).send({ error: msg });
  }
});

app.post<{
  Headers: Record<string, string | string[] | undefined>;
  Body: { telegramId?: string; disputeKey?: string; price?: string };
}>("/api/internal/vault/vote/commit", async (req, reply) => {
  if (!requireInternal(req, reply)) return;
  if (!requireVaultSigning(reply)) return;
  const telegramId = req.body?.telegramId;
  const disputeKey = req.body?.disputeKey?.trim();
  const priceStr = req.body?.price?.trim();
  if (!telegramId || !disputeKey || !priceStr) {
    return reply.status(400).send({ error: "telegramId, disputeKey, price required" });
  }
  if (!vaultRateOk(telegramId, 3000)) {
    return reply.status(429).send({ error: "Too many vault actions" });
  }
  let price: bigint;
  try {
    price = BigInt(priceStr);
  } catch {
    return reply.status(400).send({ error: "Invalid price" });
  }
  const dispute = loadDisputeRowByKey(disputeKey);
  if (!dispute) return reply.status(404).send({ error: "Unknown dispute" });
  try {
    const { txHash } = await custodialCommitVote({
      db,
      masterKey: vaultMasterKey!,
      publicClient: ethClient!,
      ethRpcUrl,
      telegramId,
      disputeKey,
      dispute,
      price,
    });
    return { ok: true, txHash };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Commit failed";
    return reply.status(502).send({ error: msg });
  }
});

app.post<{
  Headers: Record<string, string | string[] | undefined>;
  Body: { telegramId?: string; disputeKey?: string };
}>("/api/internal/vault/vote/reveal", async (req, reply) => {
  if (!requireInternal(req, reply)) return;
  if (!requireVaultSigning(reply)) return;
  const telegramId = req.body?.telegramId;
  const disputeKey = req.body?.disputeKey?.trim();
  if (!telegramId || !disputeKey) {
    return reply.status(400).send({ error: "telegramId and disputeKey required" });
  }
  if (!vaultRateOk(telegramId, 3000)) {
    return reply.status(429).send({ error: "Too many vault actions" });
  }
  try {
    const { txHash } = await custodialRevealVote({
      db,
      masterKey: vaultMasterKey!,
      publicClient: ethClient!,
      ethRpcUrl,
      telegramId,
      disputeKey,
    });
    return { ok: true, txHash };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Reveal failed";
    return reply.status(502).send({ error: msg });
  }
});

app.get<{ Headers: Record<string, string | string[] | undefined>; Querystring: { telegramId?: string } }>(
  "/api/internal/vault/pending-commits",
  async (req, reply) => {
    if (!requireInternal(req, reply)) return;
    const telegramId = req.query.telegramId;
    if (!telegramId) return reply.status(400).send({ error: "telegramId required" });
    const rows = db
      .prepare(
        `SELECT dispute_key, identifier, timestamp, round_id, commit_tx_hash, created_at
         FROM vault_vote_commits
         WHERE telegram_id = ? AND revealed = 0 AND dispute_key IS NOT NULL AND dispute_key != ''
         ORDER BY id DESC`
      )
      .all(telegramId) as {
      dispute_key: string;
      identifier: string;
      timestamp: string;
      round_id: string;
      commit_tx_hash: string;
      created_at: string;
    }[];
    return {
      ok: true,
      pending: rows.map((r) => ({
        disputeKey: r.dispute_key,
        roundId: r.round_id,
        commitTxHash: r.commit_tx_hash,
        createdAt: r.created_at,
      })),
    };
  }
);

app.post<{
  Headers: Record<string, string | string[] | undefined>;
  Body: { telegramId?: string; state?: string; payloadJson?: string };
}>("/api/internal/vote-wizard/save", async (req, reply) => {
  if (!requireInternal(req, reply)) return;
  const telegramId = req.body?.telegramId;
  const state = req.body?.state?.trim();
  const payloadJson = req.body?.payloadJson ?? "{}";
  if (!telegramId || !state) return reply.status(400).send({ error: "telegramId and state required" });
  getOrCreateUser(db, telegramId, null);
  db.prepare(
    `INSERT INTO vote_wizard_sessions (telegram_id, state, payload_json, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(telegram_id) DO UPDATE SET
       state = excluded.state,
       payload_json = excluded.payload_json,
       updated_at = datetime('now')`
  ).run(telegramId, state, payloadJson);
  return { ok: true };
});

app.get<{ Headers: Record<string, string | string[] | undefined>; Querystring: { telegramId?: string } }>(
  "/api/internal/vote-wizard/load",
  async (req, reply) => {
    if (!requireInternal(req, reply)) return;
    const telegramId = req.query.telegramId;
    if (!telegramId) return reply.status(400).send({ error: "telegramId required" });
    const row = db
      .prepare(`SELECT state, payload_json FROM vote_wizard_sessions WHERE telegram_id = ?`)
      .get(telegramId) as { state: string; payload_json: string } | undefined;
    return { ok: true, session: row ?? null };
  }
);

function assertCron(req: { query: { secret?: string } }, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) {
  if (!cronSecret || req.query.secret !== cronSecret) {
    reply.status(403).send({ error: "Forbidden" });
    return false;
  }
  return true;
}

app.get<{ Querystring: { secret?: string } }>("/api/cron/alert-subscribers", async (req, reply) => {
  if (!assertCron(req, reply)) return;
  const users = db.prepare(`SELECT telegram_id FROM users WHERE alerts_on = 1`).all() as {
    telegram_id: string;
  }[];
  return { telegramIds: users.map((u) => u.telegram_id) };
});

app.get<{ Querystring: { secret?: string } }>("/api/cron/pending-dispute-alerts", async (req, reply) => {
  if (!assertCron(req, reply)) return;
  const dvm = ethClient ? await getDvmTiming(ethClient) : null;
  const pending = db
    .prepare(
      `SELECT * FROM disputed_queries
       WHERE dispute_key NOT IN (SELECT dispute_key FROM dispute_alert_sent)
       ORDER BY block_number ASC, log_index ASC LIMIT 8`
    )
    .all() as DisputeRow[];
  if (pending.length === 0) return { batch: null as null, dvm };
  const keys = pending.map((r) => r.dispute_key);
  const phaseLabel = dvm?.phase === "commit" ? "commit" : "reveal";
  const hrs = dvm ? dvm.hoursLeftInPhase.toFixed(1) : "?";
  const lines = pending.map((r, i) => {
    const src = r.source_label ?? "Other";
    const cid = r.chain_id ?? "1";
    return `${i + 1}. <b>${src}</b> — open <b>Votes</b> in the Mini App to commit/reveal.\n   tx: ${txExplorerUrl(cid, r.tx_hash)}`;
  });
  const head =
    dvm != null
      ? `<b>New disputed DVM query</b>\n${phaseLabel} phase: ~<b>${hrs}h</b> left in this phase.\nCommit/reveal alternate every <b>${(dvm.phaseLengthSec / 3600).toFixed(1)}h</b>.\n`
      : `<b>New disputed DVM query</b>\nConfigure <code>ETH_RPC_URL</code> for live phase timing.\n`;
  const batch = {
    keys,
    html: `${head}\n${lines.join("\n")}\n\n<i>Escalated via OptimisticOracleV2 DisputePrice → DVM.</i>`,
  };
  return { batch, dvm };
});

app.post<{
  Querystring: { secret?: string };
  Body: { keys?: string[] };
}>("/api/cron/dispute-alerts-mark", async (req, reply) => {
  if (!assertCron(req, reply)) return;
  const keys = req.body?.keys ?? [];
  const ins = db.prepare(`INSERT OR IGNORE INTO dispute_alert_sent (dispute_key) VALUES (?)`);
  for (const k of keys) ins.run(k);
  return { ok: true, marked: keys.length };
});

app.get<{ Querystring: { secret?: string } }>("/api/cron/digest-recipients", async (req, reply) => {
  if (!assertCron(req, reply)) return;
  const { requests, requestsSource } = await loadActivePriceRequests(graphKey, ethClient, 3);
  if (requests.length === 0) return { telegramIds: [] as string[], preview: [] as string[] };
  const dayMs = 86_400_000;
  const now = Date.now();
  const users = db.prepare(`SELECT telegram_id FROM users WHERE alerts_on = 1`).all() as {
    telegram_id: string;
  }[];
  const telegramIds: string[] = [];
  for (const u of users) {
    const row = db
      .prepare(`SELECT last_sent_at FROM alert_digest WHERE telegram_id = ?`)
      .get(u.telegram_id) as { last_sent_at: string } | undefined;
    const last = row?.last_sent_at ? new Date(row.last_sent_at).getTime() : 0;
    if (now - last < dayMs) continue;
    telegramIds.push(u.telegram_id);
  }
  const preview = requests.map((r) => `${r.identifierId} (round ${r.roundId ?? "—"})${requestsSource === "rpc" ? " (RPC)" : ""}`);
  return { telegramIds, preview };
});

app.post<{ Querystring: { secret?: string; telegramId?: string } }>(
  "/api/cron/digest-mark",
  async (req, reply) => {
    if (!assertCron(req, reply)) return;
    const telegramId = req.query.telegramId;
    if (!telegramId) return reply.status(400).send({ error: "telegramId required" });
    db.prepare(
      `INSERT INTO alert_digest (telegram_id, last_sent_at) VALUES (?, datetime('now'))
       ON CONFLICT(telegram_id) DO UPDATE SET last_sent_at = excluded.last_sent_at`
    ).run(telegramId);
    return { ok: true };
  }
);

app.get<{ Querystring: { secret?: string } }>("/api/cron/group-broadcast-chats", async (req, reply) => {
  if (!assertCron(req, reply)) return;
  const rows = db.prepare(`SELECT chat_id FROM group_broadcasts WHERE enabled = 1`).all() as { chat_id: string }[];
  return { chatIds: rows.map((r) => r.chat_id) };
});

app.get<{ Querystring: { secret?: string } }>("/api/cron/group-stats", async (req, reply) => {
  if (!assertCron(req, reply)) return;
  const rows = db.prepare(`SELECT chat_id, title, alerts_members FROM group_stats`).all() as {
    chat_id: string;
    title: string | null;
    alerts_members: number;
  }[];
  return { groups: rows };
});

const pollMs = Number(process.env.DISPUTE_POLL_MS ?? 12000);
/** Mainnet OO cold start: ~20000 blocks ≈ ~2.8d at 12s (raise if indexer was offline longer). */
const ethOoLookback = BigInt(process.env.OO_LOOKBACK_BLOCKS ?? "20000");
/** Polygon OO cold start: default 80000 ≈ ~2d at ~2.1s; was 4000 (~2.3h) and missed older active disputes on fresh DB. */
const polygonOoLookback = BigInt(
  process.env.OO_POLYGON_LOOKBACK_BLOCKS ?? process.env.OO_LOOKBACK_BLOCKS ?? "80000"
);

if (ethClient || polygonOoClient) {
  const tick = () => {
    const jobs: Promise<number>[] = [];
    if (ethClient) {
      jobs.push(
        pollDisputePriceLogs(
          db,
          ethClient,
          {
            chainIdStr: "1",
            ooAddress: MAINNET.optimisticOracleV2 as Hex,
            lookbackBlocks: ethOoLookback,
          },
          app.log
        )
      );
    }
    if (polygonOoClient) {
      jobs.push(
        pollDisputePriceLogs(
          db,
          polygonOoClient,
          {
            chainIdStr: "137",
            ooAddress: POLYGON.optimisticOracleV2 as Hex,
            lookbackBlocks: polygonOoLookback,
          },
          app.log
        )
      );
    }
    Promise.all(jobs).catch((e) => app.log.error(e));
  };
  setInterval(tick, pollMs);
  tick();
}

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
