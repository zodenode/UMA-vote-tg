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
/** Optional HTTPS URL or Telegram file_id for / start welcome image (caption uses HTML). */
const welcomePhotoUrl = process.env.WELCOME_PHOTO_URL?.trim();
const welcomePhotoFileId = process.env.WELCOME_PHOTO_FILE_ID?.trim();

const bot = new Bot(token);

/** Pass-through start param for Mini App (Telegram passes as start_param / tgWebAppStartParam when supported). */
function webAppUrlWithStartParam(base: string, startapp: string): string {
  const b = base.replace(/\/$/, "");
  const join = b.includes("?") ? "&" : "?";
  return `${b}${join}startapp=${encodeURIComponent(startapp)}`;
}

function welcomeCaptionHtml(): string {
  return [
    "<b>uma.vote</b>",
    "",
    "Swap into <b>UMA</b>, track DVM rounds, and <b>vote</b> (Mini App + wallet). Use <code>/votes</code> for per-dispute buttons.",
    "",
    "<b>Tip:</b> open the Mini App or tap <b>Vote from bot</b> below.",
    "",
    "<i>Not affiliated with the UMA Foundation — see docs.uma.xyz</i>",
  ].join("\n");
}

function mainMenuKeyboard(alertsOn: boolean) {
  const kb = new InlineKeyboard();
  if (webAppUrl) {
    kb.webApp("📱 Open Mini App", webAppUrl).row();
    kb.webApp("🗳 Vote in Mini App", webAppUrlWithStartParam(webAppUrl, "vote")).row();
  }
  kb.text("📋 Vote from bot", "vote_list").row();
  kb.text("🔐 Vault (custody)", "vault_menu").row();
  kb.text(alertsOn ? "🔔 ON ✓" : "🔔 On", "alerts_on").text(alertsOn ? "🔕 Off" : "🔕 OFF ✓", "alerts_off").row();
  kb.url("🌐 Official voter dApp", "https://vote.umaproject.org/").row();
  kb.text("❓ Help", "help").text("🔄 Refresh", "menu_home").row();
  return kb;
}

function isMainMenuMessage(msg: unknown): boolean {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as { reply_markup?: { inline_keyboard?: { callback_data?: string }[][] } };
  const rows = m.reply_markup?.inline_keyboard;
  if (!rows) return false;
  return rows.flat().some((b) => b.callback_data === "help" || b.callback_data === "menu_home");
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
  const res = await fetch(`${apiUrl}/api/votes?limit=8`);
  if (!res.ok) {
    await ctx.reply("Could not load disputes from the API. Check API_PUBLIC_URL and the API service.");
    return;
  }
  const data = (await res.json()) as { disputes?: DisputeRow[] };
  const disputes = data.disputes ?? [];
  if (disputes.length === 0) {
    await ctx.reply(
      [
        "<b>uma.vote</b>",
        "No <b>disputed</b> queries in the index yet.",
        "",
        "Open the Mini App for the full DVM list (including subgraph requests).",
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
    const label = `${i + 1}. ${d.source} · ${d.chainId === 137 ? "Poly" : "ETH"}`.slice(0, 64);
    kb.webApp(label, webAppUrlWithStartParam(webAppUrl, startapp)).row();
  }
  kb.webApp("All votes & swap", webAppUrlWithStartParam(webAppUrl, "vote")).row();
  kb.text("« Main menu", "menu_home").row();
  const lines = disputes.map(
    (d, i) => `${i + 1}. ${escapeHtml(d.source)} · chain ${d.chainId}`
  );
  await ctx.reply(
    [
      "<b>Vote from the bot</b>",
      "Each button opens the <b>Mini App</b> on that dispute — lists prioritize <b>Polygon</b> OO; DVM signing is still on <b>Ethereum</b>.",
      "",
      ...lines.map((l) => `• ${l}`),
      "",
      "<i>On-chain signing happens in the Web App (WalletConnect or browser wallet), not inside this chat.</i>",
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
};

function pmSummary(pm: ApiPm): string {
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
  const bits = [title && `<i>${title}</i>`, prices && `<small>${prices}</small>`, hint && `<small>${hint}</small>`].filter(
    Boolean
  );
  return bits.length ? `\n${bits.join("\n")}` : "";
}

async function ensureInternal(ctx: Context): Promise<boolean> {
  if (!internalSecret) {
    await ctx.reply("Server misconfigured: set INTERNAL_API_SECRET on bot and API.");
    return false;
  }
  return true;
}

bot.command("start", async (ctx) => {
  const ref = parseRefFromStart(ctx.message?.text);
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
  const kb = mainMenuKeyboard(alertsOn);
  const cap = welcomeCaptionHtml();
  const photo = welcomePhotoUrl || welcomePhotoFileId;
  if (photo) {
    await sendChatAction(ctx, "upload_photo");
    await ctx.replyWithPhoto(photo, { caption: cap, parse_mode: "HTML", reply_markup: kb });
  } else {
    await ctx.reply(cap, { parse_mode: "HTML", reply_markup: kb });
  }
});

bot.command("votes", async (ctx) => {
  await replyVotePicker(ctx);
});

bot.command("help", async (ctx) => {
  const uid = String(ctx.from?.id ?? "");
  const alertsOn = await getAlertsOn(uid);
  await ctx.reply(
    [
      "<b>Commands</b>",
      "/start — menu & Mini App",
      "/votes — disputed queries + Web App buttons to vote",
      "/wallet — custodial vault (create / export-once / status)",
      "/vote — commit via vault wizard (API-signed)",
      "/reveal — reveal a pending vault commit",
      "/help — this message",
      "/alerts_on — instant <b>dispute</b> pings + daily digest",
      "/alerts_off — stop all digests",
      "",
      "<b>Admins (groups)</b>",
      "/pin_vote_alert — short reminder + pin (needs pin permission)",
      "/squad — opted-in member count for this group",
      "",
      "<b>Chains</b>",
      "Dispute picks prioritize <b>Polygon</b> OO (prediction markets). DVM signing is on <b>Ethereum</b> (VotingV2).",
      "",
      "<b>Custody</b>",
      "Vault keys are encrypted on the server; the operator can sign allowed txs. Not a hardware wallet.",
      "",
      "<b>Coming soon</b>",
      "Discord login — connect Discord to auto-post vote reminders in your server.",
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
    "Use /help for full commands. Mini App: Swap, Votes, Account. Try /votes to vote via Web App buttons.",
    { reply_markup: mainMenuKeyboard(alertsOn) }
  );
});

bot.callbackQuery("menu_home", async (ctx) => {
  try {
    await refreshMainMenuFromCallback(ctx);
    await ctx.answerCallbackQuery({ text: "Main menu" });
  } catch {
    await ctx.answerCallbackQuery({ text: "Use /start", show_alert: true });
  }
});

bot.callbackQuery("vote_list", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Loading disputes…" });
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
    .url("Open voter dApp", "https://vote.umaproject.org/")
    .row();
  if (webAppUrl) {
    kb.webApp("Open uma.vote Mini App", webAppUrl).row();
    kb.webApp("Vote in Mini App", webAppUrlWithStartParam(webAppUrl, "vote")).row();
  }
  const msg = await ctx.reply(
    [
      "<b>UMA DVM vote window</b>",
      "Commit and reveal on <b>vote.umaproject.org</b> (Ethereum DVM).",
      "",
      "Mini App highlights Polygon disputes and helps you swap into UMA on Ethereum.",
    ].join("\n"),
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
    "<b>Custodial vault</b>",
    "",
    st.address
      ? `Address:\n<code>${escapeHtml(st.address)}</code>`
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
  if (!st.address) kb.text("Create vault", "vault_create").row();
  else {
    kb.text("Refresh", "vault_menu").row();
    if (!st.exportedOnce) kb.text("Export key (once)", "vault_export").row();
  }
  kb.text("Vote wizard", "vote_vault_start").text("Reveal", "reveal_vault_start").row();
  kb.text("« Main menu", "menu_home").row();
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
  await replyVaultStatus(ctx, uid);
});

async function startVoteWizard(ctx: Context, uid: string) {
  await sendChatAction(ctx, "typing");
  const res = await fetch(`${apiUrl}/api/votes?limit=8`);
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
    return `${head}${pmSummary(d.polymarket)}`;
  });
  const kb = new InlineKeyboard();
  for (let i = 0; i < disputes.length; i++) {
    kb.text(String(i + 1), `vw:${i}`).row();
  }
  kb.text("« Main menu", "menu_home").text("Cancel", "vw_cancel").row();
  await ctx.reply(
    [
      "<b>Vote with vault</b>",
      phaseNote,
      "",
      "Pick a dispute. Commit uses your <b>custodial</b> wallet on the API (not your browser wallet).",
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
    .text("Proposed OO price", "vwpr:prop")
    .row()
    .text("0 (wei)", "vwpr:0")
    .text("1e18", "vwpr:1e18")
    .row()
    .text("Custom (reply)", "vwpr:custom")
    .row()
    .text("Cancel", "vw_cancel");
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
  kb.text("« Main menu", "menu_home").text("Cancel", "vw_cancel").row();
  await ctx.reply(
    ["<b>Reveal with vault</b>", "", ...lines, "", "Pick which commit to reveal (reveal phase only)."].join("\n"),
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

bot.on("message:text", async (ctx, next) => {
  const uid = String(ctx.from?.id ?? "");
  if (!uid || ctx.chat?.type !== "private") return next();
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
    .url("Open voter dApp", "https://vote.umaproject.org/")
    .row();
  if (webAppUrl) kb.webApp("Open Mini App", webAppUrl);
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
    .url("Open voter dApp", "https://vote.umaproject.org/")
    .row();
  if (webAppUrl) kb.webApp("Open Mini App", webAppUrl);
  for (const id of data.telegramIds) {
    try {
      await bot.api.sendMessage(
        id,
        [
          "<b>UMA voting reminder</b>",
          "Unresolved DVM price requests are live.",
          "",
          lines,
          "",
          "<b>Next:</b> stake if needed, then commit → reveal on the official dApp.",
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

bot.start({
  onStart: (info) => {
    console.log(`Bot @${info.username} running (polling). Mini App: ${webAppUrl || "(set WEB_APP_URL)"}`);
    if (botUsername && info.username !== botUsername) {
      console.warn(`PUBLIC_BOT_USERNAME (${botUsername}) does not match ${info.username}`);
    }
  },
});
