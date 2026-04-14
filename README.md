# UMA Vote (Telegram)

Telegram bot + Mini App focused on **Polygon** prediction-market **OOv2 disputes** (plus Ethereum OO where configured), **acquiring UMA on Ethereum** (0x), **commit/reveal on `VotingV2` (Ethereum)** from the Mini App (browser or WalletConnect), and optional **custodial vault** voting (encrypted keys on the API; bot `/vote` / `/reveal` and Mini App vault mode). Swap quotes are proxied through **0x** with optional integrator fee parameters (default **0.5%** when `INTEGRATOR_FEE_BPS=50` and `FEE_RECIPIENT` is set).

**Scope (MVP):** **Polygon-first** dispute surfacing and filters; **Ethereum mainnet** for DVM voting, UMA swaps, and `VotingV2` timing. This repo is **not** affiliated with the UMA Foundation.

## Monorepo layout

| Package    | Description                                      |
| ---------- | ------------------------------------------------ |
| `apps/web` | Vite + React Mini App (tabs, theme, swap, votes) |
| `apps/api` | Fastify API, SQLite, subgraph + 0x proxy         |
| `apps/bot` | Grammy bot: `/start` (optional welcome photo), inline menus, alerts, group commands |

## Quick start

1. Copy [`.env.example`](.env.example) to `.env` in the repo root (or set env per process). You need at least:

   - `BOT_TOKEN`, `WEB_APP_URL`, `API_PUBLIC_URL`, `INTERNAL_API_SECRET`, `CRON_SECRET`
   - Optional **`WELCOME_PHOTO_URL`** (HTTPS) or **`WELCOME_PHOTO_FILE_ID`** (Telegram file id) on the **bot** for a richer `/start` (photo + HTML caption + inline menu)
   - `THEGRAPH_API_KEY` (recommended; see [UMA subgraph docs](https://docs.uma.xyz/resources/subgraph-data)). If The Graph fails or the key is unset, **`ETH_RPC_URL`** powers an on-chain **Active DVM price requests** list (`RequestAdded` + `getPriceRequestStatuses`).
   - `POLYGON_RPC_URL` for **Polygon** OOv2 `DisputePrice` indexing (pre-filled in `.env.example` with a public RPC from [chainlist.org](https://chainlist.org) / [ethereum-lists/chains](https://github.com/ethereum-lists/chains))
   - `ETH_RPC_URL` for **VotingV2** commit/reveal countdowns, **Ethereum** OOv2 `DisputePrice` indexing, and the DVM request RPC fallback above (same — default PublicNode URL in `.env.example`; use Alchemy/Infura in production)
   - `ZEROX_API_KEY`, `FEE_RECIPIENT` (required if `INTEGRATOR_FEE_BPS` > 0; default bps is **50** = 0.5% in `.env.example`)
   - `VAULT_MASTER_KEY` (optional) — **API only**; 32-byte secret for AES-GCM–encrypted per-user vault keys. **Custodial:** operator can sign txs the product allows; loss of DB + master key can drain vaults. Rotate/re-encrypt via your own runbook.

### Disputes & DVM alignment

- **Detection:** The API watches **Polygon** OOv2 (`0xee3a…7c24`) when `POLYGON_RPC_URL` is set and **Ethereum** OOv2 (`0xA0Ae…3FFAe`) when `ETH_RPC_URL` is set for **`DisputePrice`** events. Indexed rows are **ordered with Polygon first** in API responses. This is faster than subgraph lag for “just flipped to disputed”.
- **Timing:** Reads **`VotingV2`** (`0x004395…34ac`) for `getVotePhase`, `voteTiming.phaseLength`, `getCurrentRoundId`, and `getRoundEndTime` to show **time left in commit** vs **reveal**.
- **Alerts:** The bot polls `/api/cron/pending-dispute-alerts` and messages subscribers with **“New disputed DVM query — commit/reveal ~Xh left”** (batched, de-duplicated per event).
- **Filters (Mini App / `GET /api/votes`):** `source` (`polymarket` / `other`), `chain` (`137` Polygon default in UI / `1` Ethereum / omit for all), `topic` (`crypto`, `geopolitics`, `sports`, `general`), `minBondWei`.
- **Deep links:** Each dispute row is keyed for the Mini App vote flow; the API still exposes a legacy `voterDappUrl` field (UMA context params) for integrators who want it.
- **In-app voting:** The Mini App **Votes** tab can **`commitVote` / `revealVote`** on Ethereum mainnet (`VotingV2`). Commit salts are stored in **browser `localStorage`** for reveal; clearing site data requires using the dApp or re-committing. Set **`VITE_MAINNET_RPC_URL`** and **`VITE_WALLETCONNECT_PROJECT_ID`** for reliable RPC and mobile wallets (see `.env.example`).
- **Custodial vault:** With **`VAULT_MASTER_KEY`** and **`ETH_RPC_URL`** on the API, users can create a vault wallet (encrypted in SQLite), optionally **export the private key once**, and **commit/reveal** via **`/vote`**, **`/reveal`**, **`/wallet`** in the bot (internal API + `INTERNAL_API_SECRET`) or the **Vote with custodial vault** path in the Mini App. Salts for vault commits are stored in **`vault_vote_commits`** on the server.
- **Bot shortcut:** **Vote in Mini App** opens the web app with `startapp=vote` so the client navigates to the Votes tab when Telegram supplies the start parameter.
- **Bot voting flow:** **`/votes`** (or **Vote from bot**) loads disputes from the public API and attaches **Web App** buttons per row (`startapp=vote_<token>`). Use **`/vote`** for vault-signed commits or the Mini App wallet for browser signing.
- **Community petitions:** **`/petition`** in DM runs a two-step wizard; share links use **`/start petition_<id>`**; the Mini App opens **`startapp=petition_<id>`** to read/sign. CSV export: **`GET /api/cron/petition-export?secret=CRON_SECRET&petitionId=<id>`** (signer ids hashed by default; see **`PETITION_EXPORT_INCLUDES_USERNAME`** in `.env.example`). **`POST /api/internal/petition/set-hidden`** (internal) toggles visibility for moderation.
- **Polymarket context:** Disputed rows may include **Gamma + CLOB**-derived titles/links/outcome prices for **informational** comparison with OO proposed prices (not trading or financial advice).
- **Landing:** In a normal browser, **`/`** and **`/welcome`** render the **uma.vote** marketing page; the Telegram Mini App still opens **`/`** as the in-app home when `initData` is present.
- **`ProposePrice`:** Not indexed in this MVP; only the **disputed** flip is treated as the high-signal event. The same poller pattern can extend to proposals later.

2. Install and run:

```bash
npm install
npm run dev:api    # terminal 1 — http://localhost:8787
npm run dev:web    # terminal 2 — HTTPS needed for Telegram; use ngrok for WEB_APP_URL
npm run dev:bot    # terminal 3
```

3. In [@BotFather](https://t.me/BotFather), set the Mini App URL to your hosted `apps/web` build (HTTPS).

4. **Inline mode (optional but recommended for sharing):** In @BotFather run `/setinline`, pick your bot, enable **Inline mode**, and set a placeholder hint (e.g. `Search disputes…`). Users can then type `@YourBot vote` in any chat to pick a result card with Mini App buttons. **Group relay:** In a group or channel where the bot can post, an admin can run **`/relay_on`** so **new dispute indexer batches** are posted there (same summary as DM alerts). **`/relay_off`** stops relay; **daily digest** stays DM-only for subscribers.

Set `VITE_API_URL` / `VITE_PUBLIC_BOT_USERNAME` when building the web app so the client can reach the API and build `t.me` referral links. `VITE_MAINNET_RPC_URL` and `VITE_POLYGON_RPC_URL` default to the same chainlist-style public endpoints in `.env.example`; add `VITE_WALLETCONNECT_PROJECT_ID` for Telegram mobile wallets.

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
