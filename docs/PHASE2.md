# Phase 2 — in-app stake / commit / reveal

**Not part of the current MVP.** The official flow remains on [vote.umaproject.org](https://vote.umaproject.org/) (Ethereum mainnet).

A production-ready Phase 2 would include:

- Contract ABIs and addresses for the current UMA DVM / voting contracts
- `wagmi`/`viem` write flows for stake, commit, and reveal with clear UX for the 24h / 24h windows
- Optional DVM 2.0 **delegation** (cold → hot wallet) with security copy and testing
- External **audit** or formal review before handling user funds at scale
- Legal review before any revenue share tied to staking rewards (typically non-custodial products monetize on swap/on-ramp only)

Until then, the Mini App intentionally **deep-links** to the official voter dApp for staking and voting.
