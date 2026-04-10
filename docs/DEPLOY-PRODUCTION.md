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
| `THEGRAPH_API_KEY` | Yes | UMA mainnet voting subgraph via The Graph gateway. |
| `ETH_RPC_URL` | Yes | HTTPS Ethereum RPC for `DisputePrice` polling + `VotingV2` timing. |
| `ZEROX_API_KEY` | Yes | Swap quote proxy. |
| `FEE_RECIPIENT` | If charging fee | EVM address for 0x integrator fee. |
| `INTEGRATOR_FEE_BPS` | Optional | Default sensible value in code; e.g. `25`. |
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
| `PORT` | Runtime | Set by Railway for `vite preview`. |

**Important:** Changing `VITE_*` requires a **new build** of the web service, not only a restart.

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
- In Telegram, open the bot → **Open Mini App** → same checks.
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
| Empty votes / disputes | Missing `THEGRAPH_API_KEY` or `ETH_RPC_URL` on API. |
| Swap errors | Missing or invalid `ZEROX_API_KEY` / `FEE_RECIPIENT`. |
| DB resets every deploy | No volume or wrong `DATABASE_PATH`. |
| Bot deploy never healthy | HTTP healthcheck enabled on worker — disable it. |
| Web hits wrong API | `VITE_API_URL` wrong at **build** time — rebuild web. |

---

## Local vs production env

See **[`.env.example`](../.env.example)** for a single-file dev layout and a table of which variables belong to which process. Production splits those across three Railway services as above.
