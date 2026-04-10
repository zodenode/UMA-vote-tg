import { Bot, InlineKeyboard } from "grammy";

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

const bot = new Bot(token);

function mainKeyboard() {
  const kb = new InlineKeyboard();
  if (webAppUrl) {
    kb.webApp("Open Mini App", webAppUrl).row();
  }
  kb.text("Alerts: On", "alerts_on").text("Alerts: Off", "alerts_off").row();
  kb.url("Open voter dApp", "https://vote.umaproject.org/").row();
  kb.text("Help", "help");
  return kb;
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

bot.command("start", async (ctx) => {
  const ref = parseRefFromStart(ctx.message?.text);
  const uid = String(ctx.from?.id ?? "");
  if (uid && internalSecret) {
    await internalJson("/api/internal/ensure-user", {
      telegramId: uid,
      username: ctx.from?.username,
      ref,
    }).catch(() => {});
  }
  await ctx.reply(
    [
      "<b>UMA Vote</b>",
      "",
      "Get <b>UMA</b> on Ethereum, see active DVM rounds, and jump to the official voter dApp.",
      "",
      "<b>Two taps:</b> open the Mini App, then turn vote alerts on or off.",
      "",
      "<i>Not affiliated with the UMA Foundation — see docs.uma.xyz</i>",
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: mainKeyboard() }
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    [
      "<b>Commands</b>",
      "/start — menu & Mini App",
      "/help — this message",
      "/alerts_on — instant <b>dispute</b> pings + daily digest",
      "/alerts_off — stop all digests",
      "",
      "<b>Admins (groups)</b>",
      "/pin_vote_alert — short reminder + pin (needs pin permission)",
      "/squad — opted-in member count for this group",
      "",
      "<b>Coming soon</b>",
      "Discord login — connect Discord to auto-post vote reminders in your server.",
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: mainKeyboard() }
  );
});

async function setAlerts(
  ctx: {
    from?: { id: number };
    chat?: { id: number; type: string; title?: string };
    reply: (text: string, extra?: object) => Promise<unknown>;
  },
  on: boolean
) {
  const uid = ctx.from?.id;
  if (!uid) return;
  if (!internalSecret) {
    await ctx.reply("Server misconfigured: missing INTERNAL_API_SECRET on bot/API.");
    return;
  }
  const res = await internalJson("/api/internal/alerts", {
    telegramId: String(uid),
    alertsOn: on,
  });
  if (!res.ok) {
    await ctx.reply("Could not update alerts. Is the API running?");
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
  await ctx.reply(
    on
      ? "<b>Alerts on.</b> At most one digest per day while votes are active."
      : "<b>Alerts off.</b>",
    { parse_mode: "HTML", reply_markup: mainKeyboard() }
  );
}

bot.command("alerts_on", async (ctx) => setAlerts(ctx, true));
bot.command("alerts_off", async (ctx) => setAlerts(ctx, false));

bot.callbackQuery("alerts_on", async (ctx) => {
  await setAlerts(ctx, true);
  await ctx.answerCallbackQuery();
});
bot.callbackQuery("alerts_off", async (ctx) => {
  await setAlerts(ctx, false);
  await ctx.answerCallbackQuery();
});
bot.callbackQuery("help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Use /help for full commands. Mini App: Swap, Votes, Referrals, Discord (coming soon).",
    { reply_markup: mainKeyboard() }
  );
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
  if (webAppUrl) kb.webApp("Open UMA Vote Mini App", webAppUrl);
  const msg = await ctx.reply(
    [
      "<b>UMA DVM vote window</b>",
      "Commit and reveal on <b>vote.umaproject.org</b> (Ethereum).",
      "",
      "Mini App helps you swap into UMA and see active rounds.",
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
