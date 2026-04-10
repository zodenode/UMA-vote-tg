import Fastify from "fastify";
import cors from "@fastify/cors";
import { openDb, getOrCreateUser } from "./db.js";
import { verifyInitData, parseUserFromInitData } from "./telegramAuth.js";
import { fetchActivePriceRequests, type PriceRequestSummary } from "./umaSubgraph.js";

const UMA_MAINNET = "0x04Fa0d235C4abf4BcF4787aF4CF447DE572eF828" as const;
const WETH_MAINNET = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DATABASE_PATH ?? "./data/uma-vote.db";
const botToken = process.env.BOT_TOKEN ?? "";
const graphKey = process.env.THEGRAPH_API_KEY;
const zeroXKey = process.env.ZEROX_API_KEY;
const feeRecipient = process.env.FEE_RECIPIENT ?? "";
const integratorFeeBps = Number(process.env.INTEGRATOR_FEE_BPS ?? "25");
const cronSecret = process.env.CRON_SECRET ?? "";
const internalSecret = process.env.INTERNAL_API_SECRET ?? "";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const db = openDb(dbPath);

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

app.get("/api/votes", async (): Promise<{ requests: PriceRequestSummary[]; error?: string }> => {
  const result = await fetchActivePriceRequests(graphKey, 20);
  if (!result.ok) return { error: result.error, requests: [] };
  return { requests: result.requests };
});

app.get<{
  Querystring: {
    sellToken?: string;
    buyToken?: string;
    sellAmount?: string;
    takerAddress?: string;
  };
}>("/api/swap/quote", async (req, reply) => {
  if (!zeroXKey) {
    return reply.status(503).send({ error: "ZEROX_API_KEY not configured" });
  }
  const sellToken = req.query.sellToken ?? WETH_MAINNET;
  const buyToken = req.query.buyToken ?? UMA_MAINNET;
  const sellAmount = req.query.sellAmount;
  if (!sellAmount) {
    return reply.status(400).send({ error: "sellAmount required (wei)" });
  }
  const taker = req.query.takerAddress ?? "0x0000000000000000000000000000000000000000";
  const feePct = Math.min(100, Math.max(0, integratorFeeBps)) / 10_000;
  const params = new URLSearchParams({
    sellToken,
    buyToken,
    sellAmount,
    takerAddress: taker,
    slippagePercentage: "0.01",
    skipValidation: "true",
  });
  if (feeRecipient && feePct > 0) {
    params.set("feeRecipient", feeRecipient);
    params.set("buyTokenPercentageFee", String(feePct));
  }
  const url = `https://api.0x.org/swap/v1/quote?${params.toString()}`;
  const res = await fetch(url, { headers: { "0x-api-key": zeroXKey } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return reply.status(502).send({
      error: (json as { reason?: string }).reason ?? "0x quote failed",
      details: json,
    });
  }
  const j = json as Record<string, unknown>;
  return {
    quote: j,
    integratorFeeBps,
    feeRecipient: feeRecipient || null,
    network: "Ethereum mainnet",
    disclosure:
      "This quote may include an integrator fee shown as buyTokenPercentageFee to the 0x API. You pay Ethereum network gas separately.",
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

function assertCron(req: { query: { secret?: string } }, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) {
  if (!cronSecret || req.query.secret !== cronSecret) {
    reply.status(403).send({ error: "Forbidden" });
    return false;
  }
  return true;
}

app.get<{ Querystring: { secret?: string } }>("/api/cron/digest-recipients", async (req, reply) => {
  if (!assertCron(req, reply)) return;
  const result = await fetchActivePriceRequests(graphKey, 3);
  if (!result.ok || result.requests.length === 0) return { telegramIds: [] as string[], preview: [] as string[] };
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
  const preview = result.requests.map(
    (r) => `${r.identifierId} (round ${r.roundId ?? "—"})`
  );
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

app.get<{ Querystring: { secret?: string } }>("/api/cron/group-stats", async (req, reply) => {
  if (!assertCron(req, reply)) return;
  const rows = db.prepare(`SELECT chat_id, title, alerts_members FROM group_stats`).all() as {
    chat_id: string;
    title: string | null;
    alerts_members: number;
  }[];
  return { groups: rows };
});

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
