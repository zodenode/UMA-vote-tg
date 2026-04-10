# UMA Vote (Telegram)

Telegram bot + Mini App for **acquiring UMA on Ethereum**, viewing **active DVM price requests** (via The Graph), and linking users to the official **[voter dApp](https://vote.umaproject.org/)**. Swap quotes are proxied through **0x** with optional integrator fee parameters.

**Scope (MVP):** Ethereum mainnet only for voting and UMA. This repo is **not** affiliated with the UMA Foundation.

## Monorepo layout

| Package    | Description                                      |
| ---------- | ------------------------------------------------ |
| `apps/web` | Vite + React Mini App (tabs, theme, swap, votes) |
| `apps/api` | Fastify API, SQLite, subgraph + 0x proxy         |
| `apps/bot` | Grammy bot: `/start`, alerts, group commands     |

## Quick start

1. Copy [`.env.example`](.env.example) to `.env` in the repo root (or set env per process). You need at least:

   - `BOT_TOKEN`, `WEB_APP_URL`, `API_PUBLIC_URL`, `INTERNAL_API_SECRET`, `CRON_SECRET`
   - `THEGRAPH_API_KEY` (see [UMA subgraph docs](https://docs.uma.xyz/resources/subgraph-data))
   - `ETH_RPC_URL` (HTTPS JSON-RPC) for **OptimisticOracleV2 `DisputePrice` log polling** and **VotingV2** commit/reveal countdowns
   - `ZEROX_API_KEY`, `FEE_RECIPIENT` (for fee disclosure in quotes)

### Disputes & DVM alignment

- **Detection:** The API watches Ethereum mainnet `0xA0Ae…3FFAe` (OptimisticOracleV2) for **`DisputePrice`** events (escalation to the DVM). This is faster than subgraph lag for “just flipped to disputed”.
- **Timing:** Reads **`VotingV2`** (`0x004395…34ac`) for `getVotePhase`, `voteTiming.phaseLength`, `getCurrentRoundId`, and `getRoundEndTime` to show **time left in commit** vs **reveal**.
- **Alerts:** The bot polls `/api/cron/pending-dispute-alerts` and messages subscribers with **“New disputed DVM query — commit/reveal ~Xh left”** (batched, de-duplicated per event).
- **Filters (Mini App / `GET /api/votes`):** `source` (`polymarket` / `other`), `topic` (`crypto`, `geopolitics`, `sports`, `general`), `minBondWei`.
- **Deep links:** Each dispute includes a **`vote.umaproject.org` URL** with `identifier`, `time`, and `ancillary` query params (`umaContext=1`) so users land with context (dApp may ignore unknown params).
- **`ProposePrice`:** Not indexed in this MVP; only the **disputed** flip is treated as the high-signal event. The same poller pattern can extend to proposals later.

2. Install and run:

```bash
npm install
npm run dev:api    # terminal 1 — http://localhost:8787
npm run dev:web    # terminal 2 — HTTPS needed for Telegram; use ngrok for WEB_APP_URL
npm run dev:bot    # terminal 3
```

3. In [@BotFather](https://t.me/BotFather), set the Mini App URL to your hosted `apps/web` build (HTTPS).

Set `VITE_API_URL` / `VITE_PUBLIC_BOT_USERNAME` when building the web app so the client can reach the API and build `t.me` referral links.

## Deploy to production (Railway)

This monorepo is intended to run as **three Railway services** from the **same GitHub repo** (API, bot, web). A single human-readable spec lives in **[`deploy/railway.yml`](deploy/railway.yml)**; Railway-native per-service configs are **[`deploy/api.railway.toml`](deploy/api.railway.toml)**, **[`deploy/bot.railway.toml`](deploy/bot.railway.toml)**, and **[`deploy/web.railway.toml`](deploy/web.railway.toml)**.

### 1. Create the project

1. In [Railway](https://railway.app), **New Project** → **Deploy from GitHub** → select this repository.
2. Add **three services** from the same repo (e.g. “Empty service” three times, each linked to the repo).

### 2. Point each service at config-as-code

For each service, open **Settings → Config-as-code** and set the path:

| Service | Config file           | Root directory |
| ------- | --------------------- | -------------- |
| API     | `deploy/api.railway.toml`  | `.`            |
| Bot     | `deploy/bot.railway.toml`  | `.`            |
| Web     | `deploy/web.railway.toml`  | `.`            |

Redeploy after saving. Railway merges these with any dashboard overrides (code wins).

### 3. Networking and domains

1. On the **API** service: **Settings → Networking → Generate domain**. Copy the HTTPS URL → set **`API_PUBLIC_URL`** to that value (no trailing slash).
2. On the **Web** service: generate a domain → set **`WEB_APP_URL`** (used by Telegram and the bot’s Mini App button) to that HTTPS URL.
3. **Rebuild the web service** whenever you change **`VITE_API_URL`** or **`VITE_PUBLIC_BOT_USERNAME`** (they are baked in at build time).

### 4. Environment variables

Set variables in Railway (**Variables** tab) per service. The full list, with descriptions, is in [`deploy/railway.yml`](deploy/railway.yml). Minimum:

- **API:** `BOT_TOKEN`, `INTERNAL_API_SECRET`, `CRON_SECRET`, `API_PUBLIC_URL`, `THEGRAPH_API_KEY`, `ETH_RPC_URL`, `ZEROX_API_KEY`, `FEE_RECIPIENT`, `DATABASE_PATH` (see below).
- **Bot:** `BOT_TOKEN`, `WEB_APP_URL`, `API_PUBLIC_URL`, `INTERNAL_API_SECRET`, `CRON_SECRET`, `PUBLIC_BOT_USERNAME` (optional).
- **Web (build-time):** `VITE_API_URL` (= your API public URL), `VITE_PUBLIC_BOT_USERNAME`.

Use **Reference variables** in Railway to share the same secret across API and bot if you prefer.

### 5. SQLite persistence (API)

The API defaults to a local SQLite file. On Railway, attach a **volume** mounted at **`/data`** and set:

`DATABASE_PATH=/data/uma-vote.db`

Otherwise the database is lost on every redeploy.

### 6. Bot service health check

The bot is a **long-polling worker** with no HTTP server. If Railway fails health checks, open the **bot** service → **Settings → Deploy → Healthcheck** and **disable** the HTTP health check (see note in [`deploy/bot.railway.toml`](deploy/bot.railway.toml)).

### 7. BotFather

Point the Mini App URL to your **`WEB_APP_URL`**. Keep **`WEB_APP_URL`** and **`API_PUBLIC_URL`** on **HTTPS**.

### 8. Railway SSO (teams)

Organization SSO (SAML/OIDC) is configured in the **Railway dashboard** (Team → Security), not in this repo. See [Railway docs](https://docs.railway.com/) for your plan.

---

**Alternative (two services):** run API + bot in one container with a process manager (e.g. `concurrently`) and keep web separate; hints are at the bottom of [`deploy/railway.yml`](deploy/railway.yml).

## GitHub and Cursor Cloud Agent

Cursor’s **Cloud Agent** expects a Git remote on **GitHub** or **GitLab** and a pushed default branch.

This project is already configured with a typical remote:

```bash
git remote -v
# origin  https://github.com/OWNER/REPO.git
```

If you see **“No Git Remote”**:

1. Create a new repository on [GitHub](https://github.com/new) (empty, no README required).
2. From this folder:

```bash
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git   # skip if origin exists
git branch -M main
git push -u origin main
```

After the first successful push, retry the Cloud Agent flow.

## Coming soon: Discord

The Mini App **Account** tab includes a **Discord — coming soon** card: the intent is OAuth to Discord plus optional bot/webhook posting so vote reminders can be **mirrored into a Discord channel** automatically (same privacy posture as Telegram: no vote choices, only links and timing).

## Legal / product copy

See [`docs/COPY.md`](docs/COPY.md) for bot/Mini App strings. **Phase 2** on-chain voting UX is described in [`docs/PHASE2.md`](docs/PHASE2.md).

## Scripts

- `npm run build` — build API, web, and bot
- `npm run dev:api` / `dev:web` / `dev:bot` — development servers
- `npm run start:api` / `start:bot` / `start:web` — production-style starts (web uses `PORT` for `vite preview`)
