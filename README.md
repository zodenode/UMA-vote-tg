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

## Deploy to production

Step-by-step **Railway** deployment (three services, env vars, volumes, BotFather) is in **[`docs/DEPLOY-PRODUCTION.md`](docs/DEPLOY-PRODUCTION.md)**. Machine-oriented specs: [`deploy/railway.yml`](deploy/railway.yml) and [`deploy/*.railway.toml`](deploy/).

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

See [`docs/COPY.md`](docs/COPY.md) for bot/Mini App strings. **Phase 2** on-chain voting UX is described in [`docs/PHASE2.md`](docs/PHASE2.md). **Production deploy:** [`docs/DEPLOY-PRODUCTION.md`](docs/DEPLOY-PRODUCTION.md).

## Scripts

- `npm run build` — build API, web, and bot
- `npm run dev:api` / `dev:web` / `dev:bot` — development servers
- `npm run start:api` / `start:bot` / `start:web` — production-style starts (web uses `PORT` for `vite preview`)
