# Marketing plan — UMA Vote

Telegram bot + Mini App (**uma.vote**): Polygon OOv2 disputes, Polymarket-flavored context where configured, UMA swap path, Ethereum `VotingV2` commit/reveal, community petitions. This plan assumes positioning stays **informational** (not trading or financial advice) and copy stays aligned with the repo disclaimer: **not affiliated with the UMA Foundation**.

---

## 1. Goals (pick 2–3 primary)

- **Acquisition:** bot starts, Mini App opens, `/votes` usage, dispute alert opt-ins.
- **Retention:** alert subscribers, repeat Mini App opens during commit/reveal windows.
- **Credibility:** known as **utility** for people who already use prediction markets and sometimes touch the oracle layer—not as a trading product.

**North-star proxies:** Telegram subscribers to alerts, Mini App DAU during disputed windows, petition shares, inbound links from UMA / Polymarket-adjacent communities.

---

## 2. Positioning (one sentence)

**When a market hits the oracle, this is the fastest way to see the dispute, line up UMA voting weight if you participate, and run commit/reveal—inside Telegram.**

Avoid competing on “better Polymarket UI.” Compete on **dispute lifecycle + DVM timing + mobile Telegram workflow**.

---

## 3. Audience segments

| Segment | Why they care |
|--------|----------------|
| **Active Polymarket traders** | They see odd resolutions and want to understand what happens on-chain. |
| **UMA voters / stakers** | Tooling, reminders, low-friction commit/reveal on mobile. |
| **Market makers / power users** | Resolution risk; disputes are high-signal events. |
| **Builders / data people** | Subgraph, indexing, Mini Apps—strong angles for Hacker News and dev social. |

---

## 4. Messaging pillars (use everywhere)

1. **Signal:** disputed state surfaced quickly; filters (e.g. Polymarket vs other, topic, minimum bond).
2. **Action:** path to UMA + clear staking reality: voting weight is **staked** UMA on Ethereum (`VotingV2`), not “tokens in wallet” alone—keep consistent with in-app FAQ.
3. **Execution:** commit/reveal from the Mini App; optional custodial vault only for users who understand operator/custody tradeoffs—market that path carefully.
4. **Community:** petitions as **coordination** around questions—not price calls.

---

## 5. Channel playbook

### Reddit (Polymarket-adjacent)

- **r/Polymarket** — strong fit if rules allow tool posts. Lead with a **concrete dispute** (screenshots + “what the bot shows in the first minutes”), not a generic homepage link.
- **r/predictionsmarkets** — educational comments when large disputes hit; post sparingly, comment generously.
- **r/UMAprotocol**, **r/ethereum**, **r/defi** — when there is a **technical** angle (indexing, subgraph vs RPC fallback, Telegram Mini App constraints).
- **Avoid:** drive-by link spam. **Prefer:** “I built X because during dispute Y I couldn’t get Z on mobile.”

**Tactic:** maintain a **dispute-day kit**: a few screenshots, a short screen recording, one paragraph of copy you can adapt per subreddit rules.

### Hacker News

HN rewards **builder story + technical depth**, not ads.

- **Good:** “Show HN: Telegram Mini App for UMA DVM disputes (Polygon OOv2 + Ethereum `VotingV2` timing)” with architecture: API, cron alerts, indexing choices, WalletConnect in Telegram.
- **Bad:** “New prediction markets app” with no technical substance.

**Tactic:** post Show HN on a **quiet US weekday morning**; stay in comments for several hours with honest MVP limits (and custody model if you mention vault mode).

### X (Twitter)

- Reply in **real dispute threads** with one clear visual and neutral copy.
- Tag UMA ecosystem accounts only when the substance is about **mechanics**, not promotion.
- One memorable handle; hashtags optional and light.

### Telegram (native)

- Participate in UMA- and voter-adjacent chats; run your own **announcement / digest** channel if useful.
- **Group relay** (`/relay_on`): pitch as **infra** for communities that want dispute summaries in their room—moderator buy-in first.

### Farcaster / Warpcast

- Short, crypto-native posts; reuse the same **dispute-day kit** as Reddit.

### Discord

- Polymarket or trading servers: only with **moderator blessing** or in designated **#tools** channels.
- When Discord mirroring ships (see README “coming soon”), market it as **distribution**: alerts mirrored into a server.

### YouTube, podcasts, newsletters

- **Later:** ~10-minute walkthrough tied to a **real** disputed market; pitch **infra / oracle** newsletters, not generic “crypto app” lists.

### Other places Polymarket customers congregate

- Polymarket community Discord (rules-dependent).
- “Resolution” and prediction-market Twitter—not only Polymarket’s brand account.
- **UMA** forum, governance, Discord (voter-heavy).
- **Dune / data Twitter** if you publish open dashboards that complement the app (credibility loop).

---

## 6. Content calendar (90 days, lightweight)

| Week | Focus |
|------|--------|
| 1–2 | One flagship narrative: “Why I built UMA Vote” + architecture (blog, Mirror, or README-adjacent doc); extract ~5 social snippets. |
| 3–4 | Show HN + 2–3 Reddit threads or **comment-first** participation tied to **live disputes**. |
| 5–8 | Weekly **dispute recap** (neutral, factual): what flipped, phase timing, link to official voter dApp plus the bot. |
| Ongoing | **One** public petition with a clear, non-financial narrative to demonstrate coordination—not speculation. |

---

## 7. Partnerships (low cost, high trust)

- **UMA community educators:** co-position as **education** (“how disputes work”) with links to official voter resources (e.g. vote.umaproject.org) for staking detail.
- **Creators** who explain resolution risk: offer relay or early heads-up on **high-signal** disputes.
- **Do not** imply Polymarket partnership unless contractual; keep Gamma/CLOB context framed as **informational** comparison (per product README).

---

## 8. Metrics

- Funnel: **link click → `/start` → alerts on → Mini App votes tab → commit/reveal attempts** (attempts signal intent even when users bounce on gas or staking).
- Qualitative: forwards, saved messages, FAQ traffic (“how much do I need to stake”).
- Reddit/HN: prioritize **quality replies** and DMs over raw upvotes.

**UTM / deep links:** use distinct `startapp=` (or equivalent) per channel where possible to see what converts.

---

## 9. Risk and compliance (brief)

- Prediction-market audiences are sensitive to **regulatory** and “is this advice?” framing. Keep language **informational**; repeat **non-affiliation** with UMA Foundation where appropriate.
- Custodial vault: any marketing that mentions it should surface **risk** plainly (operator capability, key export, DB + master key scenarios)—match production copy and runbooks.

---

## 10. 30-day execution checklist

1. One **dispute-day** asset pack: post + screenshots + ~60s screen recording.
2. Show HN draft reviewed for technical honesty and scope.
3. r/Polymarket (or closest allowed community): **comment-first** during the next visible dispute.
4. Telegram: confirm **inline mode** and relay story for **one** aligned community.
5. Track links per channel (UTM or `startapp` variants) to learn what works.

---

## Revision

Update this doc when positioning changes (e.g. Discord launch, new chains, or materially new features).
