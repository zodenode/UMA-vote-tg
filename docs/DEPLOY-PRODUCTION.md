# Deploy to production (Railway)

This guide deploys the **UMA Vote Telegram** monorepo as **three Railway services** from one GitHub repository: **API**, **bot**, and **web** (Mini App).

**Related files**

- **[`deploy/railway.yml`](../deploy/railway.yml)** — all-in-one YAML spec (env names, volumes, URLs, SSO notes).
- **[`deploy/api.railway.toml`](../deploy/api.railway.toml)**, **[`deploy/bot.railway.toml`](../deploy/bot.railway.toml)**, **[`deploy/web.railway.toml`](../deploy/web.railway.toml)** — Railway config-as-code (TOML).
- **[`.env.example`](../.env.example)** — local vs prod variable split and “who needs what” table.

---

## Prerequisites

- GitHub repo connected to [Railway](https://railway.app).
- Telegram **bot token** from [@BotFather](https://t.me/BotFather).
- Third-party keys: **The Graph** (UMA voting subgraph), **Ethereum JSON-RPC** (e.g. Alchemy/Infura), **0x** swap API, and an EVM address for **`FEE_RECIPIENT`** if you charge an integrator fee.
- Optional **custodial vault**: **`VAULT_MASTER_KEY`** on the API (32-byte secret) so users can commit/reveal via the bot/Mini App without a browser wallet; this is **custodial** — treat like hot-wallet ops (see README).

---

## 1. Create the Railway project

1. **New Project** → **Deploy from GitHub** → select this repository.
2. Add **three** services linked to the **same repo** (e.g. create an empty service three times and attach the repo to each, or duplicate service from template).

Name them clearly, e.g. `uma-api`, `uma-bot`, `uma-web`.

---

## 2. Config-as-code (per service)

For **each** service: **Settings → Config-as-code** → set the file path and ensure **root directory** is the repository root (`.`).

| Service | Config file path           | Root directory |
| ------- | -------------------------- | -------------- |
| API     | `deploy/api.railway.toml`  | `.`            |
| Bot     | `deploy/bot.railway.toml`  | `.`            |
| Web     | `deploy/web.railway.toml`  | `.`            |

Trigger a **redeploy** after saving. Values in these files override overlapping dashboard settings.

---

## 3. Public URLs and networking

Order matters the first time:

1. **API service** — **Settings → Networking → Generate domain**. Copy the HTTPS origin (no trailing slash), e.g. `https://uma-api-production-xxxx.up.railway.app`.
2. Set **`API_PUBLIC_URL`** on both **API** and **bot** services to that URL.
3. **Web service** — generate a domain. Set **`WEB_APP_URL`** on the **bot** service to the web HTTPS URL (Telegram requires HTTPS for Mini Apps).
4. On the **web** service, set **`VITE_API_URL`** to the **same API public URL** as in step 1. This is used at **build time** — see step 6.

---

## 4. Environment variables by service

Use **Variables** in the Railway dashboard. For secrets shared between API and bot, use **variable references** so you define `BOT_TOKEN`, `INTERNAL_API_SECRET`, and `CRON_SECRET` once and reference them.

**How to create `INTERNAL_API_SECRET` and `CRON_SECRET`:** Generate two different long random values (never commit them). For example:

```bash
openssl rand -hex 32   # use for INTERNAL_API_SECRET
openssl rand -hex 32   # use for CRON_SECRET (must differ)
```

Paste the first into **both** API and bot as `INTERNAL_API_SECRET`. Paste the second into **both** as `CRON_SECRET`. The API checks the Bearer token on `/api/internal/*` and the `secret` query param on `/api/cron/*`.

### API service

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `BOT_TOKEN` | Yes | Verifies Telegram Mini App **initData** (HMAC with bot token). |
| `INTERNAL_API_SECRET` | Yes | Bot sends header **Authorization: Bearer** plus this shared secret on internal POST routes (identical on API and bot). |
| `CRON_SECRET` | Yes | Shared secret for **?secret=** on **/api/cron/** URLs (bot and any cron caller). |
| `API_PUBLIC_URL` | Yes | Public HTTPS base URL of this API. |
| `DATABASE_PATH` | Yes (prod) | Use `/data/uma-vote.db` with a volume (see §5). |
| `THEGRAPH_API_KEY` | Recommended | UMA mainnet voting subgraph via The Graph gateway. If missing or the subgraph errors, **`ETH_RPC_URL` must be set** so `/api/votes` can list active DVM requests from `VotingV2` logs (`RequestAdded` + `getPriceRequestStatuses`). |
| `THEGRAPH_GATEWAY_BASE` | No | Defaults to `https://gateway-arbitrum.network.thegraph.com/api` (decentralized network). Use `https://gateway.thegraph.com/api` only if your key/subgraph still requires the legacy host. |
| `VOTING_SUBGRAPH_ID` | No | Defaults to UMA’s published mainnet voting Subgraph ID; override if Studio shows a new id. |
| `VOTING_REQUEST_LOG_*` / `ETH_HTTP_TIMEOUT_MS` | No | Tune on-chain DVM list fallback when The Graph fails (see `.env.example`). |
| `ETH_RPC_URL` | Yes | HTTPS Ethereum RPC for `VotingV2` DVM timing, optional Ethereum OOv2 `DisputePrice` indexing, and **on-chain DVM proposal list** when the subgraph is unavailable. `.env.example` defaults to **`https://ethereum-rpc.publicnode.com`** from [ethereum-lists/chains](https://github.com/ethereum-lists/chains) (the registry behind [chainlist.org](https://chainlist.org)). Prefer Alchemy/Infura in production. |
| `POLYGON_RPC_URL` | Optional | HTTPS Polygon RPC to index Polygon OOv2 `DisputePrice` (e.g. much prediction-market activity). DVM timing still uses Ethereum. `.env.example` defaults to **`https://polygon-bor-rpc.publicnode.com`** from the same list. |
| `OO_POLYGON_LOOKBACK_BLOCKS` | Optional | First Polygon poll lookback; defaults to `OO_LOOKBACK_BLOCKS`. |
| `ZEROX_API_KEY` | Yes | Swap quote proxy. |
| `FEE_RECIPIENT` | If charging a fee (`INTEGRATOR_FEE_BPS` > 0) | EVM address for 0x integrator fee. |
| `INTEGRATOR_FEE_BPS` | Optional | Default **50** (0.5% on buy side via 0x). Set `0` to disable. |
| `VAULT_MASTER_KEY` | Optional | 32-byte key (`openssl rand -hex 32` or base64). Enables per-user encrypted custodial wallets + `/api/vault/*`. **API only** — never in web build or bot env. |
| `PORT` | No | Railway sets automatically; local default is `8787`. |
| `OO_LOOKBACK_BLOCKS` | Optional | First poll lookback (default `4000`). |
| `DISPUTE_POLL_MS` | Optional | Dispute log poll interval (default `12000`). |
| `POLYMARKET_REQUESTER_ADDRESSES` | Optional | Comma-separated addresses for source tagging. |
| `DIGEST_INTERVAL_MS` | Optional | Daily-style digest interval (bot also uses this name if you add it to API later; bot lists it below). |

### Bot service

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `BOT_TOKEN` | Yes | Same bot as API. |
| `WEB_APP_URL` | Yes | HTTPS URL of the **web** service (Mini App). |
| `API_PUBLIC_URL` | Yes | Same as API service. |
| `INTERNAL_API_SECRET` | Yes | Same as API. |
| `CRON_SECRET` | Yes | Same as API. |
| `PUBLIC_BOT_USERNAME` | Optional | Bot username without `@`; referral links in Mini App. |
| `DIGEST_INTERVAL_MS` | Optional | Default e.g. `3600000` (1h) — see bot code / `.env.example`. |
| `DISPUTE_ALERT_INTERVAL_MS` | Optional | Default e.g. `45000` for dispute batch checks. |

### Web service

| Variable | When | Notes |
| -------- | ---- | ----- |
| `VITE_API_URL` | **Build** | Must equal public API HTTPS URL. |
| `VITE_PUBLIC_BOT_USERNAME` | **Build** | Bot username without `@` for `t.me/...` links. |
| `VITE_MAINNET_RPC_URL` | **Build** (recommended) | HTTPS Ethereum JSON-RPC for Mini App reads (`VotingV2`, stakes, request status). `.env.example` defaults to **`https://ethereum-rpc.publicnode.com`** (chainlist / ethereum-lists). Override with a dedicated provider in production. |
| `VITE_POLYGON_RPC_URL` | **Build** (recommended) | HTTPS Polygon JSON-RPC for Swap + Polygon wallet reads. `.env.example` defaults to **`https://polygon-bor-rpc.publicnode.com`**. |
| `VITE_WALLETCONNECT_PROJECT_ID` | **Build** (recommended) | [Reown / WalletConnect Cloud](https://cloud.reown.com/) project id so users without an injected wallet (typical in Telegram) can connect via WalletConnect. |
| `PORT` | **Do not set manually** | Railway injects this at runtime for `vite preview`. Overriding it (e.g. with `8787` from local dev) breaks public routing. |

**Important:** Changing `VITE_*` requires a **new build** of the web service, not only a restart.

### Vault master key rotation (optional)

Rotating **`VAULT_MASTER_KEY`** without losing user wallets requires a **one-off re-encryption** job: decrypt each `user_vaults.enc_private_key` with the old master, re-encrypt with the new master, update rows. If you skip migration, a new master makes old ciphertext unreadable — users must create new vaults (destructive). Never put **`VAULT_MASTER_KEY`** on the web or bot services.

---

## 5. SQLite persistence (API)

Without a volume, SQLite is wiped on each deploy.

1. Railway → **API** service → **Volumes** → add volume.
2. Mount path: **`/data`**.
3. Set **`DATABASE_PATH=/data/uma-vote.db`** on the API service.

---

## 6. Build order and redeploys

1. Deploy **API** first so you have a stable **`API_PUBLIC_URL`**.
2. Set **`VITE_API_URL`** and **`VITE_PUBLIC_BOT_USERNAME`** on **web**, then **redeploy web** so the client bundle embeds the correct API URL.
3. Set **`WEB_APP_URL`** and **`API_PUBLIC_URL`** on **bot**, then deploy **bot**.

Whenever the public API URL changes, **rebuild and redeploy web**.

---

## 7. Bot service health check

The bot uses **long polling** and does **not** listen for HTTP. If Railway marks the deployment unhealthy:

- Open the **bot** service → **Settings → Deploy → Healthcheck** → **disable** HTTP health checks (or equivalent).

Details: comment in [`deploy/bot.railway.toml`](../deploy/bot.railway.toml).

---

## 8. BotFather and Telegram

- Set the **Mini App URL** to your **`WEB_APP_URL`** (must be **HTTPS**).
- Keep **`API_PUBLIC_URL`** and **`WEB_APP_URL`** as **https** — no `http://` in production.

---

## 9. Verify

- `GET {API_PUBLIC_URL}/health` → `{ "ok": true }`.
- Open **`WEB_APP_URL`** in a browser — Mini App loads; **Votes** / **Swap** call the API.
- In Telegram, open the bot → **Open Mini App** → same checks. Use **Vote in Mini App** to land on the Votes tab when `start_param` / `startapp=vote` is passed through.
- Toggle **alerts** in the Mini App and confirm the bot receives updates (API + secrets must match).

---

## 10. Railway team SSO

Organization SSO (SAML/OIDC) is configured in the **Railway dashboard** (**Team → Security**), not in repository env files. See [Railway documentation](https://docs.railway.com/) for your plan.

---

## Optional: two services (API + bot in one)

To reduce the number of billable services, you can run **API and bot** in one process (e.g. `concurrently`) and keep **web** separate. Hints: bottom of [`deploy/railway.yml`](../deploy/railway.yml).

---

## Troubleshooting

| Symptom | Likely cause |
| ------- | ------------ |
| Mini App “session could not be verified” | `BOT_TOKEN` mismatch between Telegram and API, or wrong `API_PUBLIC_URL` / CORS. |
| Empty **Active DVM price requests** | Set **`ETH_RPC_URL`** on the API (required for RPC fallback). Without it, a broken or missing **`THEGRAPH_API_KEY`** leaves the list empty. Prefer a provider that allows **`eth_getLogs`** over a few thousand blocks (some free RPCs time out). |
| Empty **disputes** only | Missing `POLYGON_RPC_URL` / `ETH_RPC_URL` for OO indexing, or no `DisputePrice` events in the poll window yet. |
| Red **Subgraph** message but proposals still appear | Expected when using **RPC fallback** (`requestsSource: rpc` in JSON): The Graph failed; the list is built from chain. Fix the key or `VOTING_SUBGRAPH_ID` if you want subgraph extras (e.g. participation %). |
| Red **Subgraph: subgraph not found** (id shown) | Wrong gateway/subgraph id or deprecated deployment. Try [The Graph Studio](https://thegraph.com/studio/) / [UMA subgraph docs](https://docs.umaproject.org/resources/subgraph-data), or rely on **`ETH_RPC_URL`** fallback. |
| Swap errors | Missing or invalid `ZEROX_API_KEY` / `FEE_RECIPIENT`. |
| DB resets every deploy | No volume or wrong `DATABASE_PATH`. |
| Bot deploy never healthy | HTTP healthcheck enabled on worker — disable it. |
| Web hits wrong API | `VITE_API_URL` wrong at **build** time — rebuild web. |
| Mini App cannot connect a wallet in Telegram | Set **`VITE_WALLETCONNECT_PROJECT_ID`** and rebuild web; injected MetaMask is often unavailable inside Telegram WebView. |
| Vault create/commit 503 | Set **`VAULT_MASTER_KEY`** on the API; commit/reveal also need **`ETH_RPC_URL`**. |
| Vault “No vault for user” | User must **Create vault** in the Mini App or run **`/wallet create`** in the bot first. |
| Voting reads fail or time out | Set **`VITE_MAINNET_RPC_URL`** to a dedicated provider (Alchemy/Infura) and rebuild. |
| **“Application failed to respond”** on the **web** URL | **Wrong `PORT`.** Railway injects `PORT` (often a value like `8080`) and routes traffic to that port. If you set `PORT=8787` (from local `.env.example` / API default), the app listens on `8787` while the proxy hits the injected port → no response. **Fix:** remove any manual `PORT` variable on the **web** service (and usually the **API** service too) so Railway’s value is used. |

---

## Local vs production env

See **[`.env.example`](../.env.example)** for a single-file dev layout and a table of which variables belong to which process. Production splits those across three Railway services as above.
