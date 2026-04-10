# Copy deck (MVP)

## Bot `/start`

- **Title:** UMA Vote
- **Body:** Get UMA on Ethereum, see active DVM rounds, open the official voter dApp. Two taps: Mini App + alerts.
- **Footer:** Not affiliated with the UMA Foundation — docs.uma.xyz

## Bot digest (alerts)

- **Title:** UMA voting reminder
- **Body:** Unresolved DVM price requests are live. (bulleted identifiers). Next: stake → commit → reveal on official dApp.
- **Buttons:** Open voter dApp | Open Mini App

## Instant dispute batch (high signal)

- **Headline:** New disputed DVM query
- **Body:** Commit/reveal phase and ~hours left in current phase; numbered lines with source label, deep-link URL to voter dApp (context params), Etherscan tx.
- **Trigger:** On-chain `DisputePrice` indexed before subgraph catches up (requires `ETH_RPC_URL`).

## Mini App — swap disclaimer

- Network: Ethereum mainnet. Quotes via 0x. Gas separate. Non-custodial.
- Integrator fee disclosed via API / 0x `buyTokenPercentageFee` when configured.

## Mini App — Discord (coming soon)

- Connect Discord to auto-post vote reminders (and optional milestones) into a channel you choose. No vote choices shared — only timing and links.

## Referral invite (concept)

- “Join me on UMA Vote — swap UMA and get vote reminders: `t.me/Bot?start=ref_CODE`”
