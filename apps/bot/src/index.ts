import { Bot, InlineKeyboard, type Context } from "grammy";
import { encodeVoteFocusToken } from "./voteFocusToken.js";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Missing BOT_TOKEN");
  process.exit(1);
}

const webAppUrl = process.env.WEB_APP_URL ?? "";
const apiUrl = (process.env.API_PUBLIC_URL ?? "http://localhost:8787").replace(/\/$/, "");
const cronSecret = process.env.CRON_SECRET ?? "";
const internalSecret = process.env.INTERNAL_API_SECRET ?? "";
const botUsername = process.env.PUBLIC_BOT_USERNAME ?? "";
/** Inline-keyboard `switch_inline` requires @BotFather → Inline mode ON; otherwise Telegram rejects the whole message and /start looks “dead”. */
const inlineShareEnabled = /^1|true|yes$/i.test(process.env.BOT_INLINE_SHARE?.trim() ?? "");
/** Optional HTTPS URL or Telegram file_id for / start welcome image (caption uses HTML). */
const welcomePhotoUrl = process.env.WELCOME_PHOTO_URL?.trim();
const welcomePhotoFileId = process.env.WELCOME_PHOTO_FILE_ID?.trim();

const bot = new Bot(token);

/** Log handler failures so a single bad update does not look like a “dead” bot. */
bot.catch((err) => {
  console.error("[grammy]", err.error);
});

/**
 * Long polling ignores updates while a webhook URL is still registered.
 * Clear it on boot so polling works after BotFather / another host set a webhook.
 */
async function clearWebhookForPolling() {
  try {
    const before = await bot.api.getWebhookInfo();
    if (before.url) {
      console.log(`[boot] Webhook active (${before.url}) — deleting so long polling receives updates`);
    }
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    const after = await bot.api.getWebhookInfo();
    if (after.url) console.warn(`[boot] Webhook URL still set after deleteWebhook: ${after.url}`);
  } catch (e) {
    console.warn("deleteWebhook / getWebhookInfo failed (continuing):", e);
  }
}

/** Pass-through start param for Mini App (Telegram passes as start_param / tgWebAppStartParam when supported). */
function webAppUrlWithStartParam(base: string, startapp: string): string {
  const b = base.replace(/\/$/, "");
  const join = b.includes("?") ? "&" : "?";
  return `${b}${join}startapp=${encodeURIComponent(startapp)}`;
}

function welcomeCaptionHtml(): string {
  return [
    "🗳 <b>uma.vote</b>",
    "",
    "👉 Tap <b>Search or paste link — Vote</b> — Polymarket URL, condition id, or type a name. Vote in the Mini App.",
    "",
    "💎 Need <b>UMA</b> first? Open <b>Mini App home</b> → Swap.",
    "",
    "<i>Not affiliated with the UMA Foundation — docs.uma.xyz</i>",
  ].join("\n");
}

function morePanelCaptionHtml(): string {
  return [
    "⚙️ <b>More</b>",
    "",
    "🔐 <b>Vault</b> — custodial wallet (deposit / withdraw native ETH·POL, commit/reveal).",
    "🌐 <b>Official dApp</b> — button below.",
    "",
    "⌨️ <code>/help</code> — full command list",
  ].join("\n");
}

function mainMenuKeyboard(alertsOn: boolean) {
  const kb = new InlineKeyboard();
  if (webAppUrl) {
    kb.webApp("🔍 Search or paste link — Vote", webAppUrlWithStartParam(webAppUrl, "vote")).row();
    kb.webApp("📱 Mini App (home)", webAppUrl).row();
  }
  kb.text("📋 Indexed disputes", "vote_list").row();
  if (inlineShareEnabled) {
    kb.switchInline("📣 Share dispute search…", "vote ").row();
  }
  kb.text(alertsOn ? "🔔 Alerts ON" : "🔔 Alerts off", "alerts_on").text(alertsOn ? "🔕 Turn off" : "🔕 Turn on", "alerts_off").row();
  kb.text("⚙️ More · vault & links", "menu_more").row();
  return kb;
}

function moreMenuKeyboard() {
  const kb = new InlineKeyboard();
  kb.text("🔐 Open vault", "vault_menu").row();
  kb.url("🌐 Official voter dApp", "https://vote.umaproject.org/").row();
  kb.text("« 🏠 Back to home", "menu_home").row();
  return kb;
}

function isMainMenuMessage(msg: unknown): boolean {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as { reply_markup?: { inline_keyboard?: { callback_data?: string }[][] } };
  const rows = m.reply_markup?.inline_keyboard;
  if (!rows) return false;
  return rows.flat().some(
    (b) =>
      b.callback_data === "menu_home" ||
      b.callback_data === "vote_list" ||
      b.callback_data === "menu_more" ||
      b.callback_data === "alerts_on" ||
      b.callback_data === "alerts_off" ||
      b.callback_data === "help"
  );
}

async function getAlertsOn(telegramId: string): Promise<boolean> {
  if (!internalSecret || !telegramId) return false;
  const r = await internalJson("/api/internal/ensure-user", {
    telegramId,
    username: undefined,
    ref: null,
  }).catch(() => null);
  if (!r?.ok) return false;
  try {
    const j = (await r.json()) as { alertsOn?: boolean };
    return Boolean(j.alertsOn);
  } catch {
    return false;
  }
}

async function sendChatAction(ctx: Context, action: "typing" | "upload_photo") {
  const id = ctx.chat?.id;
  if (id != null) await ctx.api.sendChatAction(id, action).catch(() => {});
}

async function refreshMainMenuFromCallback(ctx: Context) {
  const uid = String(ctx.from?.id ?? "");
  const alertsOn = await getAlertsOn(uid);
  const kb = mainMenuKeyboard(alertsOn);
  const msg = ctx.callbackQuery?.message;
  if (!msg) return;
  try {
    if ("photo" in msg && msg.photo?.length) {
      await ctx.editMessageCaption({
        caption: welcomeCaptionHtml(),
        parse_mode: "HTML",
        reply_markup: kb,
      });
    } else {
      await ctx.editMessageText(welcomeCaptionHtml(), { parse_mode: "HTML", reply_markup: kb });
    }
  } catch (e) {
    console.warn("refreshMainMenu edit failed", e);
    await ctx.reply(welcomeCaptionHtml(), { parse_mode: "HTML", reply_markup: kb });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type DisputeRow = { id: string; source: string; chainId: number };

async function replyVotePicker(ctx: Context) {
  if (!webAppUrl) {
    await ctx.reply("Mini App URL is not configured (set WEB_APP_URL on the bot).");
    return;
  }
  await sendChatAction(ctx, "typing");
  const uid = String(ctx.from?.id ?? "");
  const alertsOn = await getAlertsOn(uid);
  const res = await fetch(`${apiUrl}/api/votes?limit=8&omitRequests=1`);
  if (!res.ok) {
    await ctx.reply("Could not load disputes from the API. Check API_PUBLIC_URL and the API service.");
    return;
  }
  const data = (await res.json()) as { disputes?: DisputeRow[] };
  const disputes = data.disputes ?? [];
  if (disputes.length === 0) {
    await ctx.reply(
      [
        "📭 <b>No indexed disputes yet</b>",
        "",
        "🔍 Use <b>Search or paste link — Vote</b> in the menu, or open the Mini App home.",
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: mainMenuKeyboard(alertsOn) }
    );
    return;
  }
  const kb = new InlineKeyboard();
  for (let i = 0; i < disputes.length; i++) {
    const d = disputes[i]!;
    const token = encodeVoteFocusToken(d.id);
    const startapp = `vote_${token}`;
    if (startapp.length > 512) continue;
    const chain = d.chainId === 137 ? "💜 Poly" : "⛓ ETH";
    const label = `🗳 ${i + 1}. ${d.source} · ${chain}`.slice(0, 64);
    kb.webApp(label, webAppUrlWithStartParam(webAppUrl, startapp)).row();
  }
  kb.webApp("🔍 Search / paste & vote", webAppUrlWithStartParam(webAppUrl, "vote")).row();
  if (inlineShareEnabled) {
    kb.switchInline("📣 Share in any chat…", "vote ").row();
  }
  kb.text("« 🏠 Home", "menu_home").row();
  await ctx.reply(
    [
      "📋 <b>Indexed disputes</b>",
      "",
      "Tap a row to open that dispute in the Mini App (status, charts when available, vote).",
      "",
      "🔎 Or tap <b>Search / paste</b> to find any Polymarket market.",
      "",
      "<i>✍️ Signing is in the Mini App · reveal comes after commit</i>",
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: kb }
  );
}

function parseRefFromStart(text: string | undefined): string | null {
  if (!text?.startsWith("/start")) return null;
  const parts = text.trim().split(/\s+/);
  const payload = parts[1];
  if (!payload?.startsWith("ref_")) return null;
  return payload.slice(4) || null;
}

function parsePetitionFromStart(text: string | undefined): string | null {
  if (!text?.startsWith("/start")) return null;
  const parts = text.trim().split(/\s+/);
  const payload = parts[1];
  if (!payload?.startsWith("petition_")) return null;
  const id = (payload.slice(9) || "").trim().toLowerCase();
  if (!id || id.length > 64 || !/^[a-f0-9]+$/.test(id)) return null;
  return id;
}

const PETITION_DISCLAIMER_BOT =
  "Community expression only — not legal advice. Signing does not create a lawsuit or attorney–client relationship.";

type PetitionDraftState = { step: "title" | "body"; title?: string };
const petitionDraft = new Map<string, PetitionDraftState>();

async function replyPetitionCard(ctx: Context, petitionId: string, opts?: { withHomeRow?: boolean }): Promise<void> {
  const res = await fetch(`${apiUrl}/api/petitions/${encodeURIComponent(petitionId)}`);
  if (!res.ok) {
    await ctx.reply("That petition was not found (or the id is invalid).");
    return;
  }
  const p = (await res.json()) as {
    id: string;
    hidden?: boolean;
    title: string;
    body: string | null;
    signatureCount: number;
    createdAt?: string;
    legalNote?: string;
  };
  const me = await ctx.api.getMe();
  const un = (botUsername || me.username || "").replace(/^@/, "");
  const shareUrl = un ? `https://t.me/${un}?start=petition_${encodeURIComponent(p.id)}` : "";
  const lines = [
    "📜 <b>Community petition</b>",
    "",
    `<b>${escapeHtml(p.title)}</b>`,
    p.body ? `\n${escapeHtml(p.body.slice(0, 3500))}${p.body.length > 3500 ? "…" : ""}` : "",
    "",
    `✍️ <b>Signatures:</b> ${p.signatureCount}`,
    "",
    `<i>${escapeHtml(PETITION_DISCLAIMER_BOT)}</i>`,
  ].filter(Boolean);
  const kb = new InlineKeyboard();
  if (p.body != null && !p.hidden) {
    kb.text("✍️ Sign (Telegram)", `petition_sign:${p.id}`).row();
  }
  if (webAppUrl) {
    kb.webApp("Open in Mini App", webAppUrlWithStartParam(webAppUrl, `petition_${p.id}`)).row();
  }
  if (shareUrl) {
    kb.url("Share t.me link", shareUrl).row();
  }
  if (p.body != null) {
    kb.text("⚠️ Report", `petition_report:${p.id}`).row();
  }
  if (opts?.withHomeRow) {
    kb.text("« 🏠 Home", "menu_home").row();
  }
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

async function internalJson(path: string, body: unknown) {
  return fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${internalSecret}`,
    },
    body: JSON.stringify(body),
  });
}

async function internalGet(path: string) {
  return fetch(`${apiUrl}${path}`, {
    headers: { authorization: `Bearer ${internalSecret}` },
  });
}

type WizardPayload = {
  votePick?: { keys: string[]; proposedPrices: (string | null)[] };
  revealPick?: { keys: string[] };
};

async function saveWizardSession(telegramId: string, state: string, payload: WizardPayload) {
  await internalJson("/api/internal/vote-wizard/save", {
    telegramId,
    state,
    payloadJson: JSON.stringify(payload),
  });
}

async function loadWizardSession(
  telegramId: string
): Promise<{ state: string; payload: WizardPayload } | null> {
  const r = await internalGet(
    `/api/internal/vote-wizard/load?telegramId=${encodeURIComponent(telegramId)}`
  );
  if (!r.ok) return null;
  const j = (await r.json()) as { session: { state: string; payload_json: string } | null };
  if (!j.session) return null;
  let payload: WizardPayload = {};
  try {
    payload = JSON.parse(j.session.payload_json) as WizardPayload;
  } catch {
    payload = {};
  }
  return { state: j.session.state, payload };
}

/** Private-chat users waiting to send a custom vote price (wei string). */
const vaultCustomPriceWait = new Map<string, { disputeKey: string }>();

/** After tapping Withdraw ETH/POL — user sends `0xRecipient amountWei|MAX`. */
const vaultWithdrawWait = new Map<string, { chainId: 1 | 137 }>();

const WEI_1E18 = "1000000000000000000";

type ApiPmOutcome = { label: string; mid: string | null; priceBuy: string | null; priceSell: string | null };
type ApiPm = {
  title: string | null;
  url: string | null;
  outcomes: ApiPmOutcome[];
  proposedPriceHint: string | null;
} | null;

type ApiDispute = {
  id: string;
  source: string;
  chainId: number;
  proposedPrice?: string | null;
  polymarket: ApiPm;
  reversalWatch?: boolean;
  reversalWatchReason?: string | null;
  voterDappUrl?: string;
};

const GROUP_RELAY_DELAY_MS = 45;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function matchesInlineQuery(d: ApiDispute, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return true;
  const hay = [
    d.source,
    d.id,
    d.polymarket?.title ?? "",
    ...(d.polymarket?.outcomes?.map((o) => o.label) ?? []),
  ]
    .join(" ")
    .toLowerCase();
  if (hay.includes(t)) return true;
  for (const word of t.split(/\s+/).filter((w) => w.length >= 2)) {
    if (hay.includes(word)) return true;
  }
  return false;
}

function pmSummary(
  pm: ApiPm,
  reversal?: { reversalWatch?: boolean; reversalWatchReason?: string | null }
): string {
  if (!pm) return "";
  const title = pm.title ? escapeHtml(pm.title.slice(0, 80)) : "";
  const prices =
    pm.outcomes?.length > 0
      ? pm.outcomes
          .map((o) => {
            const p = o.mid ?? o.priceBuy ?? o.priceSell ?? "—";
            return `${escapeHtml(o.label.slice(0, 24))}: ${escapeHtml(p)}`;
          })
          .join(" · ")
      : "";
  const hint =
    pm.proposedPriceHint != null && pm.proposedPriceHint !== ""
      ? `OO proposed ≈ ${escapeHtml(pm.proposedPriceHint)}`
      : "";
  let rev = "";
  if (reversal?.reversalWatch) {
    const raw = reversal.reversalWatchReason?.trim();
    const short = raw ? escapeHtml(raw.slice(0, 240)) : "CLOB vs OO tension (heuristic).";
    rev = `<small><b>Reversal watch</b>: ${short}</small>`;
  }
  const bits = [
    title && `<i>${title}</i>`,
    prices && `<small>${prices}</small>`,
    hint && `<small>${hint}</small>`,
    rev || null,
  ].filter(Boolean);
  return bits.length ? `\n${bits.join("\n")}` : "";
}

async function ensureInternal(ctx: Context): Promise<boolean> {
  if (!internalSecret) {
    await ctx.reply("Server misconfigured: set INTERNAL_API_SECRET on bot and API.");
    return false;
  }
  return true;
}

function shortDisputeId(id: string): string {
  const t = id.trim();
  return t.length > 30 ? `${t.slice(0, 14)}…${t.slice(-12)}` : t;
}

/** Inline mode: share Mini App cards for indexed disputes (enable Inline in @BotFather). */
async function buildInlineVoteArticles(rawQuery: string): Promise<unknown[]> {
  const q = (rawQuery ?? "").trim();
  const res = await fetch(`${apiUrl}/api/votes?limit=14&omitRequests=1`).catch(() => null);
  if (!res?.ok) {
    return [
      {
        type: "article",
        id: "uma-offline",
        title: "Disputes unavailable",
        description: "API did not respond",
        input_message_content: {
          message_text: "Could not load the dispute list. Try again from the bot.",
        },
      },
    ];
  }
  const data = (await res.json()) as { disputes?: ApiDispute[] };
  let rows = data.disputes ?? [];
  if (q.length >= 2) {
    rows = rows.filter((d) => matchesInlineQuery(d, q));
  }
  const out: unknown[] = [];
  if (webAppUrl) {
    out.push({
      type: "article",
      id: "uma-vote-home",
      title: "uma.vote — search & vote",
      description: q.length < 2 ? "Open Mini App (paste Polymarket link or search)" : `Refine “${q.slice(0, 36)}” in the app`,
      input_message_content: {
        message_text: [
          "🗳 <b>uma.vote</b>",
          "",
          "Open the Mini App to find disputed markets, see DVM timing, and vote.",
          "",
          "<i>Not affiliated with the UMA Foundation — docs.uma.xyz</i>",
        ].join("\n"),
        parse_mode: "HTML",
      },
      reply_markup: new InlineKeyboard()
        .webApp("Search / paste & vote", webAppUrlWithStartParam(webAppUrl, "vote"))
        .row()
        .webApp("Mini App home", webAppUrl),
    });
  } else {
    out.push({
      type: "article",
      id: "uma-no-webapp",
      title: "uma.vote",
      description: "WEB_APP_URL is not set on this bot",
      input_message_content: { message_text: "Configure WEB_APP_URL on the bot host to open the Mini App from inline results." },
    });
  }
  const cap = 18;
  for (let i = 0; i < Math.min(rows.length, cap); i++) {
    const d = rows[i]!;
    const token = encodeVoteFocusToken(d.id);
    const startapp = `vote_${token}`;
    if (startapp.length > 512) continue;
    const title = (d.polymarket?.title?.trim() || `${d.source} · ${shortDisputeId(d.id)}`).slice(0, 64);
    const desc = `${d.source} · ${d.chainId === 137 ? "Polygon" : "Ethereum"} — tap to post this card`;
    const head = escapeHtml((d.polymarket?.title?.trim() || `${d.source} · ${shortDisputeId(d.id)}`).slice(0, 280));
    const pmBlock = pmSummary(d.polymarket, d);
    const body = [`🗳 <b>Disputed query</b>`, "", `<b>${head}</b>`, pmBlock, "", "<i>Open Mini App to vote (wallet or vault).</i>"].join(
      "\n"
    );
    const rid = `d${i}-${token.slice(0, 24)}`.slice(0, 64);
    const voterUrl = d.voterDappUrl?.trim() || "https://vote.umaproject.org/";
    const kb = new InlineKeyboard();
    if (webAppUrl) {
      kb.webApp("Open in Mini App", webAppUrlWithStartParam(webAppUrl, startapp)).row();
    }
    kb.url("Official voter dApp", voterUrl);
    out.push({
      type: "article",
      id: rid,
      title,
      description: desc.slice(0, 255),
      input_message_content: {
        message_text: body.slice(0, 4090),
        parse_mode: "HTML",
      },
      reply_markup: kb,
    });
  }
  if (out.length === 0) {
    out.push({
      type: "article",
      id: "uma-empty",
      title: "No matches in quick index",
      description: "Try another keyword or open Search in the Mini App",
      input_message_content: {
        message_text: "No indexed disputes matched that text. Open the bot and use Search, or try a shorter query.",
      },
    });
  }
  return out;
}

bot.on("inline_query", async (ctx) => {
  try {
    const articles = await buildInlineVoteArticles(ctx.inlineQuery.query);
    await ctx.answerInlineQuery(articles as never, { cache_time: 15, is_personal: true });
  } catch (e) {
    console.error("inline_query failed", e);
    try {
      await ctx.answerInlineQuery(
        [
          {
            type: "article",
            id: "uma-inline-err",
            title: "Inline error",
            input_message_content: { message_text: "Something went wrong loading inline results. Try again." },
          },
        ] as never,
        { cache_time: 1 }
      );
    } catch {
      /* ignore */
    }
  }
});

bot.command("start", async (ctx) => {
  try {
    const ref = parseRefFromStart(ctx.message?.text);
    const petitionId = parsePetitionFromStart(ctx.message?.text);
    const uid = String(ctx.from?.id ?? "");
    let alertsOn = false;
    if (uid && internalSecret) {
      const r = await internalJson("/api/internal/ensure-user", {
        telegramId: uid,
        username: ctx.from?.username,
        ref,
      }).catch(() => null);
      if (r?.ok) {
        try {
          const j = (await r.json()) as { alertsOn?: boolean };
          alertsOn = Boolean(j.alertsOn);
        } catch {
          alertsOn = false;
        }
      }
    }
    if (petitionId) {
      await replyPetitionCard(ctx, petitionId, { withHomeRow: true });
      return;
    }
    const kb = mainMenuKeyboard(alertsOn);
    const cap = welcomeCaptionHtml();
    const photo = welcomePhotoUrl || welcomePhotoFileId;
    if (photo) {
      await sendChatAction(ctx, "upload_photo");
      await ctx.replyWithPhoto(photo, { caption: cap, parse_mode: "HTML", reply_markup: kb });
    } else {
      await ctx.reply(cap, { parse_mode: "HTML", reply_markup: kb });
    }
  } catch (e) {
    console.error("/start handler failed:", e);
    try {
      await ctx.reply(
        "Could not show the welcome menu (see bot logs). Common fixes: redeploy the bot worker, clear any Telegram webhook, and set BOT_INLINE_SHARE=1 only if Inline mode is enabled in @BotFather."
      );
    } catch (replyErr) {
      console.error("/start fallback reply also failed:", replyErr);
    }
  }
});

bot.command("votes", async (ctx) => {
  await replyVotePicker(ctx);
});

bot.command("invite", async (ctx) => {
  const uid = String(ctx.from?.id ?? "");
  if (!uid) return;
  if (!(await ensureInternal(ctx))) return;
  const r = await internalJson("/api/internal/ensure-user", {
    telegramId: uid,
    username: ctx.from?.username,
    ref: null,
  });
  if (!r.ok) {
    await ctx.reply("Could not load your invite link. Is the API running?");
    return;
  }
  const j = (await r.json()) as { refCode?: string };
  const code = (j.refCode ?? "").trim();
  if (!code) {
    await ctx.reply("Invite code not ready — try again in a moment.");
    return;
  }
  const me = await ctx.api.getMe();
  const un = (botUsername || me.username || "").replace(/^@/, "");
  if (!un) {
    await ctx.reply("Set PUBLIC_BOT_USERNAME on the bot for a stable invite URL.");
    return;
  }
  const refLink = `https://t.me/${un}?start=ref_${encodeURIComponent(code)}`;
  const miniLink = webAppUrl ? `https://t.me/${un}?startapp=${encodeURIComponent("vote")}` : "";
  const lines = [
    "📎 <b>Your invite link</b>",
    "",
    `<a href="${escapeHtml(refLink)}">${escapeHtml(refLink)}</a>`,
    "",
    "Anyone who opens the bot with your link is attributed to you in our database.",
  ];
  if (miniLink) {
    lines.push("", "Mini App (opens Vote flow):");
    lines.push(`<a href="${escapeHtml(miniLink)}">${escapeHtml(miniLink)}</a>`);
  }
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
});

bot.command("petition_cancel", async (ctx) => {
  const uid = String(ctx.from?.id ?? "");
  petitionDraft.delete(uid);
  await ctx.reply("Petition draft cancelled.");
});

bot.command("petition", async (ctx) => {
  const uid = String(ctx.from?.id ?? "");
  if (!uid) return;
  if (ctx.chat?.type !== "private") {
    await ctx.reply("Start a petition in <b>private chat</b> with the bot (opens DM).", { parse_mode: "HTML" });
    return;
  }
  if (!(await ensureInternal(ctx))) return;
  petitionDraft.set(uid, { step: "title" });
  await ctx.reply(
    [
      "📜 <b>New community petition</b>",
      "",
      `Send a <b>short title</b> (one message, max ~${120} chars).`,
      "",
      `<i>${escapeHtml(PETITION_DISCLAIMER_BOT)}</i>`,
      "",
      "<code>/petition_cancel</code> to abort.",
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

bot.command("help", async (ctx) => {
  const uid = String(ctx.from?.id ?? "");
  const alertsOn = await getAlertsOn(uid);
  await ctx.reply(
    [
      "❓ <b>Commands</b>",
      "",
      "🏠 <code>/start</code> — home menu",
      "🔍 Mini App → paste Polymarket URL / search (same as menu <b>Search or paste link</b>)",
      "📋 <code>/votes</code> — quick-open indexed disputes",
      "📎 <code>/invite</code> — your referral link + Mini App vote link",
      "📜 <code>/petition</code> — create a community petition (DM wizard); <code>/petition_cancel</code>",
      "🔐 <code>/wallet</code> — vault; <code>/wallet balances</code>; <code>/wallet withdraw eth|poly</code> then <code>0x… amountWei|MAX</code>; deposit = send to vault addr",
      "🧙 <code>/vote</code> · <code>/reveal</code> — vault commit / reveal wizard",
      "🔔 <code>/alerts_on</code> · <code>/alerts_off</code> — dispute pings + digest",
      "",
      "👮 <b>Groups</b> <code>/pin_vote_alert</code> · <code>/squad</code> · <code>/relay_on</code> / <code>/relay_off</code> (admins: post new dispute batches here)",
      "",
      "<b>Inline mode:</b> in any chat, type your bot’s username then <code>vote</code> (enable Inline in @BotFather) to share Mini App cards.",
      "",
      "💜 Disputes often on <b>Polygon</b> OO · ⛓ DVM vote on <b>Ethereum</b>",
      "",
      "<i>Vault custody: operator can sign allowed txs — not a hardware wallet.</i>",
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: mainMenuKeyboard(alertsOn) }
  );
});

async function setAlerts(ctx: Context, on: boolean) {
  const uid = ctx.from?.id;
  if (!uid) return;
  if (!internalSecret) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: "Server misconfigured", show_alert: true });
    else await ctx.reply("Server misconfigured: missing INTERNAL_API_SECRET on bot/API.");
    return;
  }
  const res = await internalJson("/api/internal/alerts", {
    telegramId: String(uid),
    alertsOn: on,
  });
  if (!res.ok) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: "Could not update alerts", show_alert: true });
    else await ctx.reply("Could not update alerts. Is the API running?");
    return;
  }
  const chat = ctx.chat;
  if (chat && (chat.type === "group" || chat.type === "supergroup")) {
    await internalJson("/api/internal/group-alerts-delta", {
      chatId: String(chat.id),
      title: "title" in chat ? chat.title : undefined,
      delta: on ? 1 : -1,
    }).catch(() => {});
  }
  const kb = mainMenuKeyboard(on);
  const msg = ctx.callbackQuery?.message;
  if (ctx.callbackQuery && msg && isMainMenuMessage(msg as unknown)) {
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: kb });
    } catch (e) {
      console.warn("alerts: editMessageReplyMarkup failed", e);
    }
    await ctx.answerCallbackQuery({ text: on ? "🔔 Alerts on" : "🔕 Alerts off" });
    return;
  }
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: on ? "🔔 Alerts on" : "🔕 Alerts off" });
    await ctx.reply(
      on
        ? "<b>Alerts on.</b> At most one digest per day while votes are active."
        : "<b>Alerts off.</b>",
      { parse_mode: "HTML", reply_markup: kb }
    );
    return;
  }
  await ctx.reply(
    on
      ? "<b>Alerts on.</b> At most one digest per day while votes are active."
      : "<b>Alerts off.</b>",
    { parse_mode: "HTML", reply_markup: kb }
  );
}

bot.command("alerts_on", async (ctx) => setAlerts(ctx, true));
bot.command("alerts_off", async (ctx) => setAlerts(ctx, false));

bot.callbackQuery("alerts_on", async (ctx) => {
  await setAlerts(ctx, true);
});
bot.callbackQuery("alerts_off", async (ctx) => {
  await setAlerts(ctx, false);
});
bot.callbackQuery("help", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = String(ctx.from?.id ?? "");
  const alertsOn = await getAlertsOn(uid);
  await ctx.reply(
    "❓ Type <code>/help</code> for the full list — or use 🔍 <b>Search or paste link</b> in the menu.",
    { parse_mode: "HTML", reply_markup: mainMenuKeyboard(alertsOn) }
  );
});

bot.callbackQuery("menu_home", async (ctx) => {
  try {
    await refreshMainMenuFromCallback(ctx);
    await ctx.answerCallbackQuery({ text: "🏠 Home" });
  } catch {
    await ctx.answerCallbackQuery({ text: "Use /start", show_alert: true });
  }
});

bot.callbackQuery("menu_more", async (ctx) => {
  await ctx.answerCallbackQuery();
  const msg = ctx.callbackQuery?.message;
  if (!msg) return;
  try {
    if ("photo" in msg && msg.photo?.length) {
      await ctx.editMessageCaption({
        caption: morePanelCaptionHtml(),
        parse_mode: "HTML",
        reply_markup: moreMenuKeyboard(),
      });
    } else {
      await ctx.editMessageText(morePanelCaptionHtml(), { parse_mode: "HTML", reply_markup: moreMenuKeyboard() });
    }
  } catch (e) {
    console.warn("menu_more edit failed", e);
    await ctx.reply(morePanelCaptionHtml(), { parse_mode: "HTML", reply_markup: moreMenuKeyboard() });
  }
});

bot.callbackQuery("vote_list", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "📋 Loading…" });
  await replyVotePicker(ctx);
});

bot.command("pin_vote_alert", async (ctx) => {
  const chat = ctx.chat;
  if (!chat || (chat.type !== "group" && chat.type !== "supergroup")) {
    await ctx.reply("Use this command inside a group.");
    return;
  }
  const uid = ctx.from?.id;
  if (!uid) return;
  let isAdmin = false;
  try {
    const m = await ctx.api.getChatMember(chat.id, uid);
    isAdmin = m.status === "creator" || m.status === "administrator";
  } catch {
    isAdmin = false;
  }
  if (!isAdmin) {
    await ctx.reply("Only group admins can pin vote alerts.");
    return;
  }
  const kb = new InlineKeyboard()
    .url("🌐 Official voter dApp", "https://vote.umaproject.org/")
    .row();
  if (webAppUrl) {
    kb.webApp("🔍 Mini App — search & vote", webAppUrlWithStartParam(webAppUrl, "vote")).row();
    kb.webApp("📱 Mini App home", webAppUrl).row();
  }
  const un = botUsername.replace(/^@/, "");
  const addBotLine =
    un.length > 0
      ? `\n📣 <b>Add this bot:</b> <a href="https://t.me/${escapeHtml(un)}">t.me/${escapeHtml(un)}</a>`
      : "";
  const msg = await ctx.reply(
    [
      "🗳 <b>UMA DVM vote window</b>",
      "Commit / reveal on <b>vote.umaproject.org</b> (Ethereum).",
      "",
      "🔍 <b>Mini App:</b> open Search — paste a Polymarket link or pick an indexed dispute, then vote.",
      addBotLine,
    ]
      .filter(Boolean)
      .join("\n"),
    { parse_mode: "HTML", reply_markup: kb }
  );
  try {
    await ctx.api.pinChatMessage(chat.id, msg.message_id, { disable_notification: true });
  } catch {
    await ctx.reply("Could not pin — check that the bot can pin messages.");
  }
});

bot.command("squad", async (ctx) => {
  const chat = ctx.chat;
  if (!chat || (chat.type !== "group" && chat.type !== "supergroup")) {
    await ctx.reply("Use /squad in a group.");
    return;
  }
  if (!cronSecret) {
    await ctx.reply("Squad stats require CRON_SECRET on bot + API.");
    return;
  }
  const res = await fetch(
    `${apiUrl}/api/cron/group-stats?secret=${encodeURIComponent(cronSecret)}`
  );
  if (!res.ok) {
    await ctx.reply("Could not load squad stats.");
    return;
  }
  const data = (await res.json()) as {
    groups: { chat_id: string; title: string | null; alerts_members: number }[];
  };
  const row = data.groups.find((g) => g.chat_id === String(chat.id));
  const n = row?.alerts_members ?? 0;
  await ctx.reply(
    [
      "<b>Squad</b>",
      `Members who opted into alerts (this group): <b>${n}</b>`,
      "",
      "We never show how someone voted — only participation signals.",
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

async function requireRelayAdmin(ctx: Context): Promise<boolean> {
  const chat = ctx.chat;
  const uid = ctx.from?.id;
  if (!chat || uid == null) return false;
  if (chat.type !== "group" && chat.type !== "supergroup" && chat.type !== "channel") {
    await ctx.reply("Use relay commands in a group, supergroup, or channel where you are an admin.");
    return false;
  }
  try {
    const m = await ctx.api.getChatMember(chat.id, uid);
    const ok = m.status === "creator" || m.status === "administrator";
    if (!ok) await ctx.reply("Only admins can change relay settings.");
    return ok;
  } catch {
    await ctx.reply("Could not verify your admin status.");
    return false;
  }
}

/** Opt-in: post new dispute indexer batches to this chat (same HTML as DM alerts). Digest stays DM-only. */
bot.command("relay_on", async (ctx) => {
  if (!(await ensureInternal(ctx))) return;
  if (!(await requireRelayAdmin(ctx))) return;
  const chat = ctx.chat!;
  const title = "title" in chat ? chat.title : null;
  const r = await internalJson("/api/internal/group-broadcast-set", {
    chatId: String(chat.id),
    enabled: true,
    title,
  });
  if (!r.ok) {
    await ctx.reply("Could not enable relay for this chat.");
    return;
  }
  await ctx.reply(
    [
      "<b>Relay on.</b>",
      "New disputed DVM batches from the indexer will be posted here (same summary as DM subscribers).",
      "",
      "Daily digest reminders stay <b>direct-message only</b>.",
      "",
      "<code>/relay_off</code> to stop.",
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

bot.command("relay_off", async (ctx) => {
  if (!(await ensureInternal(ctx))) return;
  if (!(await requireRelayAdmin(ctx))) return;
  const chat = ctx.chat!;
  const title = "title" in chat ? chat.title : null;
  const r = await internalJson("/api/internal/group-broadcast-set", {
    chatId: String(chat.id),
    enabled: false,
    title,
  });
  if (!r.ok) {
    await ctx.reply("Could not disable relay.");
    return;
  }
  await ctx.reply("<b>Relay off.</b> This chat will no longer receive dispute batch posts.", { parse_mode: "HTML" });
});

async function replyVaultStatus(ctx: Context, uid: string) {
  const r = await internalGet(`/api/internal/vault/status?telegramId=${encodeURIComponent(uid)}`);
  if (!r.ok) {
    await ctx.reply("Could not load vault status. Is the API running?");
    return;
  }
  const st = (await r.json()) as {
    vaultEnabled: boolean;
    address: string | null;
    exportedOnce: boolean;
  };
  const depositBlock =
    st.address != null
      ? [
          "",
          "<b>Deposit ETH or POL</b>",
          "Same address on every chain — pick the network in your wallet when sending.",
          "• <b>Ethereum</b> — ETH for DVM gas; UMA to stake on VotingV2 from this address.",
          "• <b>Polygon</b> — POL for gas on Polygon.",
          "",
          `<a href="https://etherscan.io/address/${st.address}">Etherscan</a> · <a href="https://polygonscan.com/address/${st.address}">Polygonscan</a>`,
        ]
      : [];
  const lines = [
    "🔐 <b>Custodial vault</b>",
    "",
    st.address
      ? `📬 Address:\n<code>${escapeHtml(st.address)}</code>`
      : "<i>No vault yet.</i> Tap <b>Create</b> or use <code>/wallet create</code>.",
    ...depositBlock,
    "",
    st.vaultEnabled
      ? "<i>Signing (commit/reveal) is available.</i>"
      : "<b>Signing disabled</b> — API needs <code>VAULT_MASTER_KEY</code> and <code>ETH_RPC_URL</code>.",
    "",
    st.exportedOnce
      ? "<i>Private key was exported once — cannot export again.</i>"
      : st.address
        ? "You may <b>export</b> the raw key once (high risk)."
        : "",
    "",
    "<b>Custody warning:</b> the operator can sign txs this product allows; DB + master key compromise drains the wallet.",
  ];
  const kb = new InlineKeyboard();
  if (!st.address) kb.text("➕ Create vault", "vault_create").row();
  else {
    kb.text("🔄 Refresh", "vault_menu").row();
    if (!st.exportedOnce) kb.text("🔑 Export key (once)", "vault_export").row();
  }
  kb.text("🧙 Vote wizard", "vote_vault_start").text("🔓 Reveal", "reveal_vault_start").row();
  if (st.address) {
    kb.text("💸 Withdraw ETH", "vault_wd_1").text("💸 Withdraw POL", "vault_wd_137").row();
  }
  kb.text("« 🏠 Home", "menu_home").row();
  await ctx.reply(lines.filter(Boolean).join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

bot.callbackQuery("vault_menu", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Vault…" });
  await sendChatAction(ctx, "typing");
  const uid = String(ctx.from?.id ?? "");
  if (!uid) return;
  if (!(await ensureInternal(ctx))) return;
  await replyVaultStatus(ctx, uid);
});

bot.callbackQuery("vault_create", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = String(ctx.from?.id ?? "");
  if (!uid) return;
  if (!(await ensureInternal(ctx))) return;
  const r = await internalJson("/api/internal/vault/create", { telegramId: uid });
  if (!r.ok) {
    const t = await r.text();
    await ctx.reply(`Create failed: ${escapeHtml(t)}`, { parse_mode: "HTML" });
    return;
  }
  const j = (await r.json()) as { address: string; created: boolean };
  await ctx.reply(
    j.created
      ? `<b>Vault created.</b>\n<code>${escapeHtml(j.address)}</code>\n\n<b>Deposit:</b> same address on <b>Ethereum</b> (ETH gas + UMA stake) and <b>Polygon</b> (POL gas). Use /wallet for links.`
      : `<b>Vault already exists.</b>\n<code>${escapeHtml(j.address)}</code>`,
    { parse_mode: "HTML" }
  );
});

bot.callbackQuery(/^vault_wd_(1|137)$/, async (ctx) => {
  const chainId = ctx.match![1] === "137" ? 137 : 1;
  await ctx.answerCallbackQuery({ text: chainId === 1 ? "ETH withdraw" : "POL withdraw" });
  const uid = String(ctx.from?.id ?? "");
  if (!uid) return;
  if (!(await ensureInternal(ctx))) return;
  vaultWithdrawWait.set(uid, { chainId });
  const sym = chainId === 1 ? "ETH" : "POL";
  await ctx.reply(
    [
      `💸 <b>Withdraw ${sym}</b> from your vault`,
      "",
      "Send <b>one message</b>:",
      "<code>0xRecipient amountWei</code>",
      "",
      "• <code>amountWei</code> — whole wei integer (e.g. <code>1000000000000000</code>)",
      "• or <code>MAX</code> to send all native minus a gas reserve",
      "",
      "Example: <code>0x742d35Cc6634C0532925a3b844Bc454e4438f44e MAX</code>",
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

bot.callbackQuery("vault_export", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = String(ctx.from?.id ?? "");
  if (!uid) return;
  if (!(await ensureInternal(ctx))) return;
  const r = await internalJson("/api/internal/vault/export", { telegramId: uid });
  if (!r.ok) {
    const t = await r.text();
    await ctx.reply(`Export failed: ${escapeHtml(t)}`, { parse_mode: "HTML" });
    return;
  }
  const j = (await r.json()) as { privateKey: string };
  await ctx.reply(
    [
      "<b>Private key (shown once)</b>",
      "",
      `<code>${escapeHtml(j.privateKey)}</code>`,
      "",
      "<b>Delete this message</b> after copying. Anyone with the key controls the wallet.",
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

bot.command("wallet", async (ctx) => {
  const uid = String(ctx.from?.id ?? "");
  if (!uid) return;
  if (!(await ensureInternal(ctx))) return;
  await internalJson("/api/internal/ensure-user", {
    telegramId: uid,
    username: ctx.from?.username,
    ref: null,
  }).catch(() => {});
  const parts = ctx.message?.text?.trim().split(/\s+/) ?? [];
  const sub = parts[1]?.toLowerCase();
  if (sub === "create") {
    const r = await internalJson("/api/internal/vault/create", { telegramId: uid });
    if (!r.ok) {
      await ctx.reply("Could not create vault.");
      return;
    }
    const j = (await r.json()) as { address: string; created: boolean };
    await ctx.reply(
      j.created
        ? `Vault created:\n${j.address}\n\nDeposit ETH (Ethereum) for DVM gas, UMA to stake, or POL on Polygon — same address. /wallet for explorer links.`
        : `Vault already exists:\n${j.address}`
    );
    return;
  }
  if (sub === "export") {
    const r = await internalJson("/api/internal/vault/export", { telegramId: uid });
    if (!r.ok) {
      const t = await r.text();
      await ctx.reply(`Export failed: ${t}`);
      return;
    }
    const j = (await r.json()) as { privateKey: string };
    await ctx.reply(
      [
        "<b>Private key (one-time)</b>",
        `<code>${escapeHtml(j.privateKey)}</code>`,
        "Delete this chat message after saving the key offline.",
      ].join("\n\n"),
      { parse_mode: "HTML" }
    );
    return;
  }
  if (sub === "balances") {
    const r = await internalGet(`/api/internal/vault/balances?telegramId=${encodeURIComponent(uid)}`);
    if (!r.ok) {
      await ctx.reply("Could not load balances.");
      return;
    }
    const j = (await r.json()) as { address?: string; ethWei?: string | null; polWei?: string | null };
    if (!j.address) {
      await ctx.reply("No vault yet — create one with <code>/wallet create</code> or the Mini App.", {
        parse_mode: "HTML",
      });
      return;
    }
    const eth =
      j.ethWei != null
        ? `${(Number(j.ethWei) / 1e18).toFixed(6)} ETH`
        : "—";
    const pol =
      j.polWei != null
        ? `${(Number(j.polWei) / 1e18).toFixed(6)} POL`
        : "—";
    await ctx.reply(
      [
        "💰 <b>Vault balances</b>",
        "",
        `<code>${escapeHtml(j.address)}</code>`,
        "",
        `⛓ Ethereum: <b>${escapeHtml(eth)}</b>`,
        `💜 Polygon: <b>${escapeHtml(pol)}</b>`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );
    return;
  }
  if (sub === "withdraw" || sub === "wd") {
    const c = parts[2]?.toLowerCase();
    const chainId: 1 | 137 =
      c === "137" || c === "poly" || c === "polygon" || c === "pol" ? 137 : 1;
    vaultWithdrawWait.set(uid, { chainId });
    const sym = chainId === 1 ? "ETH" : "POL";
    await ctx.reply(
      [
        `💸 <b>Withdraw ${sym}</b> — reply with one line:`,
        "<code>0xRecipient amountWei</code> or <code>0xRecipient MAX</code>",
      ].join("\n"),
      { parse_mode: "HTML" }
    );
    return;
  }
  await replyVaultStatus(ctx, uid);
});

async function startVoteWizard(ctx: Context, uid: string) {
  await sendChatAction(ctx, "typing");
  const res = await fetch(`${apiUrl}/api/votes?limit=8&omitRequests=1`);
  if (!res.ok) {
    await ctx.reply("Could not load disputes from the API.");
    return;
  }
  const data = (await res.json()) as { disputes?: ApiDispute[]; dvm?: { phase: string } | null };
  const disputes = data.disputes ?? [];
  if (disputes.length === 0) {
    await ctx.reply("No disputed queries in the index. Try again after the API indexes new disputes.");
    return;
  }
  const keys = disputes.map((d) => d.id);
  const proposedPrices = disputes.map((d) => d.proposedPrice ?? null);
  await saveWizardSession(uid, "vote_pick", { votePick: { keys, proposedPrices } });
  const phaseNote = data.dvm?.phase ? `DVM phase: <b>${escapeHtml(data.dvm.phase)}</b>` : "";
  const lines = disputes.map((d, i) => {
    const chain = d.chainId === 137 ? "Poly" : "ETH";
    const head = `${i + 1}. ${escapeHtml(d.source)} · ${chain}`;
    return `${head}${pmSummary(d.polymarket, d)}`;
  });
  const kb = new InlineKeyboard();
  for (let i = 0; i < disputes.length; i++) {
    kb.text(String(i + 1), `vw:${i}`).row();
  }
  kb.text("« 🏠 Home", "menu_home").text("✖️ Cancel", "vw_cancel").row();
  await ctx.reply(
    [
      "🧙 <b>Vote with vault</b>",
      phaseNote,
      "",
      "Pick a dispute — commit uses your <b>custodial</b> API wallet (not your browser wallet).",
      "",
      ...lines,
    ]
      .filter(Boolean)
      .join("\n\n"),
    { parse_mode: "HTML", reply_markup: kb }
  );
}

bot.command("vote", async (ctx) => {
  const uid = String(ctx.from?.id ?? "");
  if (!uid) return;
  if (!(await ensureInternal(ctx))) return;
  await internalJson("/api/internal/ensure-user", { telegramId: uid, username: ctx.from?.username, ref: null }).catch(
    () => {}
  );
  await startVoteWizard(ctx, uid);
});

bot.callbackQuery("vote_vault_start", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Loading wizard…" });
  const uid = String(ctx.from?.id ?? "");
  if (!uid) return;
  if (!(await ensureInternal(ctx))) return;
  await startVoteWizard(ctx, uid);
});

bot.callbackQuery("vw_cancel", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Cancelled" });
  const uid = String(ctx.from?.id ?? "");
  if (uid) await saveWizardSession(uid, "idle", {});
  await ctx.reply("Vote wizard cancelled.");
});

bot.callbackQuery(/^vw:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = String(ctx.from?.id ?? "");
  if (!uid) return;
  if (!(await ensureInternal(ctx))) return;
  const idx = Number(ctx.match![1]);
  const sess = await loadWizardSession(uid);
  const pick = sess?.payload.votePick;
  if (!pick || sess?.state !== "vote_pick" || idx < 0 || idx >= pick.keys.length) {
    await ctx.reply("Session expired — run /vote again.");
    return;
  }
  const disputeKey = pick.keys[idx]!;
  const proposed = pick.proposedPrices[idx] ?? null;
  await saveWizardSession(uid, "vote_price", {
    votePick: { keys: [disputeKey], proposedPrices: [proposed] },
  });
  const kb = new InlineKeyboard()
    .text("✅ Proposed OO price", "vwpr:prop")
    .row()
    .text("0️⃣ 0 wei", "vwpr:0")
    .text("1️⃣ 1e18", "vwpr:1e18")
    .row()
    .text("✏️ Custom (reply)", "vwpr:custom")
    .row()
    .text("✖️ Cancel", "vw_cancel");
  const propLine =
    proposed != null && proposed !== ""
      ? `Proposed: <code>${escapeHtml(proposed)}</code>`
      : "No proposed price on file — use custom.";
  await ctx.reply(
    [
      "<b>Choose vote price</b> (int256, wei)",
      propLine,
      "",
      "Or tap <b>Custom</b> and send a single integer in this chat.",
    ].join("\n\n"),
    { parse_mode: "HTML", reply_markup: kb }
  );
});

bot.callbackQuery(/^vwpr:(prop|0|1e18|custom)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = String(ctx.from?.id ?? "");
  if (!uid) return;
  if (!(await ensureInternal(ctx))) return;
  const kind = ctx.match![1];
  const sess = await loadWizardSession(uid);
  const pick = sess?.payload.votePick;
  if (!pick || sess?.state !== "vote_price" || pick.keys.length !== 1) {
    await ctx.reply("Session expired — run /vote again.");
    return;
  }
  const disputeKey = pick.keys[0]!;
  const proposed = pick.proposedPrices[0] ?? null;
  let priceStr: string | null = null;
  if (kind === "prop") {
    if (proposed == null || proposed === "") {
      await ctx.reply("No proposed price for this dispute. Use Custom and send the wei integer.");
      return;
    }
    priceStr = proposed.trim();
  } else if (kind === "0") priceStr = "0";
  else if (kind === "1e18") priceStr = WEI_1E18;
  else {
    vaultCustomPriceWait.set(uid, { disputeKey });
    await ctx.reply("Send one message with the price as a decimal integer (wei), e.g. 1000000000000000000");
    return;
  }
  const r = await internalJson("/api/internal/vault/vote/commit", {
    telegramId: uid,
    disputeKey,
    price: priceStr,
  });
  await saveWizardSession(uid, "idle", {});
  if (!r.ok) {
    const t = await r.text();
    await ctx.reply(`Commit failed: ${escapeHtml(t)}`, { parse_mode: "HTML" });
    return;
  }
  const j = (await r.json()) as { txHash: string };
  await ctx.reply(
    `<b>Commit sent.</b>\n<code>${escapeHtml(j.txHash)}</code>\n\nUse <code>/reveal</code> during the reveal phase.`,
    { parse_mode: "HTML" }
  );
});

async function startRevealFlow(ctx: Context, uid: string) {
  await sendChatAction(ctx, "typing");
  const r = await internalGet(
    `/api/internal/vault/pending-commits?telegramId=${encodeURIComponent(uid)}`
  );
  if (!r.ok) {
    await ctx.reply("Could not load pending commits.");
    return;
  }
  const j = (await r.json()) as { pending: { disputeKey: string; roundId: string; commitTxHash: string }[] };
  const pending = j.pending ?? [];
  if (pending.length === 0) {
    await ctx.reply("No unrevealed vault commits on file for your account.");
    return;
  }
  const keys = pending.map((p) => p.disputeKey);
  await saveWizardSession(uid, "reveal_pick", { revealPick: { keys } });
  const lines = pending.map((p, i) => {
    const short = p.disputeKey.length > 20 ? `${p.disputeKey.slice(0, 10)}…${p.disputeKey.slice(-6)}` : p.disputeKey;
    return `${i + 1}. <code>${escapeHtml(short)}</code> · round ${escapeHtml(p.roundId)}`;
  });
  const kb = new InlineKeyboard();
  for (let i = 0; i < pending.length; i++) kb.text(`Reveal ${i + 1}`, `vr:${i}`).row();
  kb.text("« 🏠 Home", "menu_home").text("✖️ Cancel", "vw_cancel").row();
  await ctx.reply(
    ["🔓 <b>Reveal with vault</b>", "", ...lines, "", "Pick one to reveal (reveal phase only)."].join("\n"),
    { parse_mode: "HTML", reply_markup: kb }
  );
}

bot.command("reveal", async (ctx) => {
  const uid = String(ctx.from?.id ?? "");
  if (!uid) return;
  if (!(await ensureInternal(ctx))) return;
  await internalJson("/api/internal/ensure-user", { telegramId: uid, username: ctx.from?.username, ref: null }).catch(
    () => {}
  );
  await startRevealFlow(ctx, uid);
});

bot.callbackQuery("reveal_vault_start", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Reveal flow…" });
  const uid = String(ctx.from?.id ?? "");
  if (!uid) return;
  if (!(await ensureInternal(ctx))) return;
  await startRevealFlow(ctx, uid);
});

bot.callbackQuery(/^vr:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = String(ctx.from?.id ?? "");
  if (!uid) return;
  if (!(await ensureInternal(ctx))) return;
  const idx = Number(ctx.match![1]);
  const sess = await loadWizardSession(uid);
  const pick = sess?.payload.revealPick;
  if (!pick || sess?.state !== "reveal_pick" || idx < 0 || idx >= pick.keys.length) {
    await ctx.reply("Session expired — run /reveal again.");
    return;
  }
  const disputeKey = pick.keys[idx]!;
  const r = await internalJson("/api/internal/vault/vote/reveal", { telegramId: uid, disputeKey });
  await saveWizardSession(uid, "idle", {});
  if (!r.ok) {
    const t = await r.text();
    await ctx.reply(`Reveal failed: ${escapeHtml(t)}`, { parse_mode: "HTML" });
    return;
  }
  const j = (await r.json()) as { txHash: string };
  await ctx.reply(`<b>Reveal sent.</b>\n<code>${escapeHtml(j.txHash)}</code>`, { parse_mode: "HTML" });
});

bot.callbackQuery(/^petition_sign:([a-f0-9]+)$/i, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Recording signature…" });
  const uid = String(ctx.from?.id ?? "");
  const pid = ctx.match![1]!.toLowerCase();
  if (!uid || !(await ensureInternal(ctx))) return;
  const r = await internalJson("/api/internal/petition/sign", { telegramId: uid, petitionId: pid, comment: null });
  if (!r.ok) {
    const t = await r.text();
    await ctx.reply(`Could not sign: ${escapeHtml(t)}`, { parse_mode: "HTML" });
    return;
  }
  const j = (await r.json()) as { signatureCount?: number };
  await ctx.reply(`✅ Signed. Current signatures: <b>${j.signatureCount ?? "—"}</b>.`, { parse_mode: "HTML" });
});

bot.callbackQuery(/^petition_report:([a-f0-9]+)$/i, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Thanks — recorded." });
  const uid = String(ctx.from?.id ?? "");
  const pid = ctx.match![1]!.toLowerCase();
  if (!uid || !(await ensureInternal(ctx))) return;
  await internalJson("/api/internal/petition/report", { telegramId: uid, petitionId: pid }).catch(() => {});
});

bot.on("message:text", async (ctx, next) => {
  const uid = String(ctx.from?.id ?? "");
  if (!uid || ctx.chat?.type !== "private") return next();
  const pDraft = petitionDraft.get(uid);
  if (pDraft && !ctx.message.text.trim().startsWith("/")) {
    const raw = ctx.message.text.trim();
    if (!(await ensureInternal(ctx))) return;
    if (pDraft.step === "title") {
      if (!raw) {
        await ctx.reply("Send a non-empty title.");
        return;
      }
      if (raw.length > 120) {
        await ctx.reply("Title is too long (max 120 characters for this wizard).");
        return;
      }
      petitionDraft.set(uid, { step: "body", title: raw });
      await ctx.reply(
        [
          "Now send the <b>petition body</b> (one message).",
          "",
          "<code>/petition_cancel</code> to abort.",
        ].join("\n"),
        { parse_mode: "HTML" }
      );
      return;
    }
    if (pDraft.step === "body") {
      if (!raw) {
        await ctx.reply("Send a non-empty body.");
        return;
      }
      const title = pDraft.title ?? "";
      const r = await internalJson("/api/internal/petition/create", {
        telegramId: uid,
        title,
        body: raw,
      });
      petitionDraft.delete(uid);
      if (!r.ok) {
        const t = await r.text();
        await ctx.reply(`Create failed: ${escapeHtml(t)}`, { parse_mode: "HTML" });
        return;
      }
      const j = (await r.json()) as { id?: string };
      const pid = (j.id ?? "").trim().toLowerCase();
      const me = await ctx.api.getMe();
      const un = (botUsername || me.username || "").replace(/^@/, "");
      const link = un ? `https://t.me/${un}?start=petition_${encodeURIComponent(pid)}` : "";
      await ctx.reply(
        [
          "✅ <b>Petition created</b>",
          pid ? `\n<code>${escapeHtml(pid)}</code>` : "",
          "",
          link ? `Share: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>` : "Set PUBLIC_BOT_USERNAME for a stable share link.",
        ]
          .filter(Boolean)
          .join("\n"),
        { parse_mode: "HTML" }
      );
      if (pid) await replyPetitionCard(ctx, pid);
      return;
    }
  }
  const wd = vaultWithdrawWait.get(uid);
  if (wd && !ctx.message.text.trim().startsWith("/")) {
    vaultWithdrawWait.delete(uid);
    if (!(await ensureInternal(ctx))) return;
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      await ctx.reply("Use: <code>0xRecipient amountWei</code> or <code>0xRecipient MAX</code>", { parse_mode: "HTML" });
      return;
    }
    const amountTok = parts[parts.length - 1]!;
    const toRaw = parts.slice(0, -1).join("");
    if (!/^0x[a-fA-F]{40}$/i.test(toRaw)) {
      await ctx.reply("Recipient must be one <code>0x</code> + 40 hex chars address.", { parse_mode: "HTML" });
      return;
    }
    const to = toRaw.toLowerCase();
    const amountWei = amountTok.toUpperCase() === "MAX" ? "MAX" : /^[0-9]+$/.test(amountTok) ? amountTok : null;
    if (amountWei === null) {
      await ctx.reply("Amount must be decimal digits (wei) or <code>MAX</code>.", { parse_mode: "HTML" });
      return;
    }
    const r = await internalJson("/api/internal/vault/withdraw", {
      telegramId: uid,
      chainId: wd.chainId,
      to,
      amountWei,
    });
    if (!r.ok) {
      const t = await r.text();
      await ctx.reply(`Withdraw failed: ${escapeHtml(t)}`, { parse_mode: "HTML" });
      return;
    }
    const j = (await r.json()) as { txHash: string; chainId: number };
    const exp =
      j.chainId === 137 ? `https://polygonscan.com/tx/${escapeHtml(j.txHash)}` : `https://etherscan.io/tx/${escapeHtml(j.txHash)}`;
    await ctx.reply(
      [`✅ <b>Withdraw sent</b>`, "", `<code>${escapeHtml(j.txHash)}</code>`, "", `<a href="${exp}">View on explorer</a>`].join(
        "\n"
      ),
      { parse_mode: "HTML" }
    );
    return;
  }
  const wait = vaultCustomPriceWait.get(uid);
  if (!wait) return next();
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) {
    return next();
  }
  vaultCustomPriceWait.delete(uid);
  if (!(await ensureInternal(ctx))) return;
  let priceStr: string;
  try {
    void BigInt(text);
    priceStr = text;
  } catch {
    await ctx.reply("Invalid integer. Run /vote and choose Custom again.");
    return;
  }
  const r = await internalJson("/api/internal/vault/vote/commit", {
    telegramId: uid,
    disputeKey: wait.disputeKey,
    price: priceStr,
  });
  await saveWizardSession(uid, "idle", {});
  if (!r.ok) {
    const t = await r.text();
    await ctx.reply(`Commit failed: ${t}`);
    return;
  }
  const j = (await r.json()) as { txHash: string };
  await ctx.reply(`Commit sent.\n${j.txHash}\n\nUse /reveal in the reveal phase.`);
});

async function runDisputeBatchAlerts() {
  if (!cronSecret) return;
  const r = await fetch(
    `${apiUrl}/api/cron/pending-dispute-alerts?secret=${encodeURIComponent(cronSecret)}`
  );
  if (!r.ok) return;
  const data = (await r.json()) as {
    batch: { keys: string[]; html: string } | null;
  };
  if (!data.batch?.keys?.length) return;
  const sub = await fetch(
    `${apiUrl}/api/cron/alert-subscribers?secret=${encodeURIComponent(cronSecret)}`
  );
  if (!sub.ok) return;
  const { telegramIds } = (await sub.json()) as { telegramIds: string[] };
  if (!telegramIds?.length) return;
  const kb = new InlineKeyboard()
    .url("🌐 Official voter dApp", "https://vote.umaproject.org/")
    .row();
  if (webAppUrl) {
    kb.webApp("🔍 Search / paste & vote", webAppUrlWithStartParam(webAppUrl, "vote")).row();
    kb.webApp("📱 Mini App home", webAppUrl).row();
  }
  for (const id of telegramIds) {
    try {
      await bot.api.sendMessage(id, data.batch.html, {
        parse_mode: "HTML",
        reply_markup: kb,
      });
    } catch (e) {
      console.error("dispute batch alert failed", id, e);
    }
  }
  const groupsRes = await fetch(
    `${apiUrl}/api/cron/group-broadcast-chats?secret=${encodeURIComponent(cronSecret)}`
  );
  let groupIds: string[] = [];
  if (groupsRes.ok) {
    try {
      const gj = (await groupsRes.json()) as { chatIds?: string[] };
      groupIds = gj.chatIds ?? [];
    } catch {
      groupIds = [];
    }
  }
  for (const chatId of groupIds) {
    try {
      await bot.api.sendMessage(chatId, data.batch.html, {
        parse_mode: "HTML",
        reply_markup: kb,
      });
    } catch (e: unknown) {
      const code =
        typeof e === "object" && e !== null && "error_code" in e ? (e as { error_code: number }).error_code : 0;
      if (code === 403 || code === 400) {
        await internalJson("/api/internal/group-broadcast-set", {
          chatId: String(chatId),
          enabled: false,
          title: null,
        }).catch(() => {});
      }
      console.error("group relay failed", chatId, e);
    }
    await sleep(GROUP_RELAY_DELAY_MS);
  }
  await fetch(
    `${apiUrl}/api/cron/dispute-alerts-mark?secret=${encodeURIComponent(cronSecret)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keys: data.batch.keys }),
    }
  );
}

async function runDigestOnce() {
  if (!cronSecret) return;
  const r = await fetch(
    `${apiUrl}/api/cron/digest-recipients?secret=${encodeURIComponent(cronSecret)}`
  );
  if (!r.ok) return;
  const data = (await r.json()) as { telegramIds: string[]; preview: string[] };
  if (!data.telegramIds?.length) return;
  const lines = data.preview?.length
    ? data.preview.map((p) => `• ${p}`).join("\n")
    : "• (see voter dApp)";
  const kb = new InlineKeyboard()
    .url("🌐 Official voter dApp", "https://vote.umaproject.org/")
    .row();
  if (webAppUrl) {
    kb.webApp("🔍 Search / paste & vote", webAppUrlWithStartParam(webAppUrl, "vote")).row();
    kb.webApp("📱 Mini App home", webAppUrl).row();
  }
  for (const id of data.telegramIds) {
    try {
      await bot.api.sendMessage(
        id,
        [
          "⏰ <b>UMA voting reminder</b>",
          "Unresolved DVM price requests are live.",
          "",
          lines,
          "",
          "👉 <b>Next:</b> stake if needed — then commit → reveal.",
          "🔍 Or paste a Polymarket link in the Mini App to find your market.",
        ].join("\n"),
        { parse_mode: "HTML", reply_markup: kb }
      );
      await fetch(
        `${apiUrl}/api/cron/digest-mark?secret=${encodeURIComponent(cronSecret)}&telegramId=${encodeURIComponent(id)}`,
        { method: "POST" }
      );
    } catch (e) {
      console.error("digest send failed", id, e);
    }
  }
}

const disputeAlertMs = Number(process.env.DISPUTE_ALERT_INTERVAL_MS ?? 45_000);
setInterval(() => {
  runDisputeBatchAlerts().catch(console.error);
}, disputeAlertMs);

const digestMs = Number(process.env.DIGEST_INTERVAL_MS ?? 3_600_000);
setInterval(() => {
  runDigestOnce().catch(console.error);
}, digestMs);

async function main() {
  await clearWebhookForPolling();
  await bot.start({
    onStart: (info) => {
      console.log(`Bot @${info.username} running (polling). Mini App: ${webAppUrl || "(set WEB_APP_URL)"}`);
      console.log(`API_PUBLIC_URL=${apiUrl}`);
      console.log(
        inlineShareEnabled
          ? "BOT_INLINE_SHARE on — share buttons use switch_inline (Inline mode must be ON in @BotFather)."
          : "BOT_INLINE_SHARE off — no switch_inline buttons (safe default; set BOT_INLINE_SHARE=1 after /setinline)."
      );
      if (!internalSecret) console.warn("INTERNAL_API_SECRET is empty — /wallet, /vote, alerts will fail");
      if (!webAppUrl) console.warn("WEB_APP_URL is empty — Web App menu buttons will be missing");
      if (botUsername && info.username !== botUsername) {
        console.warn(`PUBLIC_BOT_USERNAME (${botUsername}) does not match ${info.username}`);
      }
    },
  });
}

main().catch((e) => {
  console.error("Bot failed to start:", e);
  process.exit(1);
});
