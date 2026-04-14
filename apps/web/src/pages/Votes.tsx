import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import DvmInlineVote from "../components/DvmInlineVote";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiGet } from "../api";
import MarketDisputeFinder from "../components/MarketDisputeFinder";
import VaultCustodialPanel from "../components/VaultCustodialPanel";
import VotesWalletBar from "../components/VotesWalletBar";
import { encodeVoteFocusToken } from "../voteFocusToken";
import type { Dispute, VoteReq, VotesPayload } from "../voteTypes";
import { disputeTitle, formatDuration, identifierToHex } from "../voteUtils";

export default function Votes() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const legacyFocus = searchParams.get("focus")?.trim();

  useEffect(() => {
    if (legacyFocus) {
      navigate(`/votes/dispute/${legacyFocus}`, { replace: true });
    }
  }, [legacyFocus, navigate]);

  if (legacyFocus) {
    return (
      <>
        <h1>Votes</h1>
        <div className="card" aria-busy>
          <div className="skeleton" style={{ width: "55%" }} />
          <div className="skeleton" style={{ width: "80%" }} />
        </div>
      </>
    );
  }

  /** Inline commit/reveal for a row from Active DVM votes (URLs cannot carry large ancillary payloads). */
  const [activeVoteReq, setActiveVoteReq] = useState<VoteReq | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [source, setSource] = useState<string>("");
  /** Default all chains so Ethereum + Polygon disputes both show (Polygon-only filter hid mainnet rows). */
  const [chain, setChain] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [minBond, setMinBond] = useState<string>("");
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", "30");
    if (source) p.set("source", source);
    if (chain) p.set("chain", chain);
    if (topic) p.set("topic", topic);
    if (minBond.trim()) p.set("minBondWei", minBond.trim());
    return p.toString();
  }, [source, chain, topic, minBond]);

  const q = useQuery({
    queryKey: ["votes", queryString],
    queryFn: () => apiGet<VotesPayload>(`/api/votes?${queryString}`),
    refetchInterval: 30_000,
    /** Show last payload while refetching (tab revisit / poll) instead of a blank skeleton. */
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });

  if (q.isPending) {
    return (
      <>
        <h1>Vote on a dispute</h1>
        <div className="card" aria-busy>
          <div className="skeleton" style={{ width: "60%" }} />
          <div className="skeleton" style={{ width: "90%" }} />
          <div className="skeleton" style={{ width: "75%" }} />
        </div>
      </>
    );
  }

  if (q.isError) {
    return (
      <>
        <h1>Vote on a dispute</h1>
        <div className="card">
          <p className="muted">Could not load data. Check your connection.</p>
          <button type="button" className="btn btn-secondary btn-press" onClick={() => q.refetch()}>
            Retry
          </button>
        </div>
      </>
    );
  }

  const data = q.data!;
  const list = data.requests ?? [];
  const disputes = data.disputes ?? [];
  const dvm = data.dvm;

  return (
    <>
      <h1>Vote on a dispute</h1>
      <p className="muted">
        <b>Active DVM votes</b> are live <code>VotingV2</code> requests (same pool as vote.uma.xyz). <b>Open disputes</b>{" "}
        are only OO <code>DisputePrice</code> rows we have indexed — a smaller set. Search finds Polymarket markets linked
        to disputes.
      </p>
      <details className="votes-technical">
        <summary className="votes-technical-summary">How data loads (technical)</summary>
        <p className="muted" style={{ marginTop: 8 }}>
          <b>Active DVM votes</b> load from The Graph or <code>ETH_RPC_URL</code> log scan. <b>Open disputes</b> come from
          indexed <code>DisputePrice</code> events on Polygon/Ethereum OOv2. <b>DVM timing</b> is from{" "}
          <code>VotingV2</code>.
        </p>
      </details>

      <div className="card">
        <MarketDisputeFinder className="market-finder--embedded" />
      </div>

      {dvm ? (
        <div className="card votes-dvm-strip">
          <span className="badge">DVM round {dvm.roundId}</span>
          <p className="votes-dvm-strip-main">
            <strong>{dvm.phase === "commit" ? "Commit phase" : "Reveal phase"}</strong>
            <span className="muted"> · {formatDuration(dvm.secondsLeftInPhase)} left</span>
          </p>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
            Round ends (UTC): {new Date(dvm.roundEndsAt * 1000).toLocaleString()}
          </p>
          <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
            Pick an <b>Active DVM vote</b> or an indexed dispute below to commit or reveal in this app.
          </p>
        </div>
      ) : (
        <div className="card">
          <p className="muted">DVM countdown unavailable until the API has <code>ETH_RPC_URL</code>.</p>
        </div>
      )}

      <VotesWalletBar />

      <VaultCustodialPanel apiVaultEnabled={Boolean(data.vaultEnabled)} />

      <h2>Active DVM votes</h2>
      <p className="muted" style={{ marginTop: 4 }}>
        Unresolved requests on Ethereum <code>VotingV2</code> — tap <b>Vote in app</b> to open commit/reveal here (same
        flow as other UMA voters). Custodial vault voting still uses an indexed dispute row.
      </p>
      {list.length === 0 ? (
        <div className="card">
          <p className="muted">
            No active DVM price requests right now, or the API cannot load them (set <code>THEGRAPH_API_KEY</code> and/or{" "}
            <code>ETH_RPC_URL</code> on the API).
          </p>
        </div>
      ) : (
        list.map((r: VoteReq) => (
          <div key={r.id} className="card votes-active-preview">
            <div className="votes-active-preview-head">
              <h3 className="votes-active-preview-title">{r.identifierId}</h3>
              <span className="badge">Round {r.roundId ?? "—"}</span>
            </div>
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
              Requested: {new Date(Number(r.time) * 1000).toLocaleString()}
              {r.participationPct != null ? ` · Participation ${r.participationPct}%` : ""}
            </p>
            <button
              type="button"
              className={
                activeVoteReq?.id === r.id
                  ? "btn btn-secondary btn-press votes-dispute-vote-cta"
                  : "btn btn-primary btn-press votes-dispute-vote-cta"
              }
              style={{ marginTop: 12 }}
              onClick={() => setActiveVoteReq((cur) => (cur?.id === r.id ? null : r))}
            >
              {activeVoteReq?.id === r.id ? "Close" : "Vote in app"}
            </button>
          </div>
        ))
      )}

      {activeVoteReq ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Commit / reveal</h3>
          <p className="muted" style={{ fontSize: 13 }}>
            {activeVoteReq.identifierId} · requested {new Date(Number(activeVoteReq.time) * 1000).toLocaleString()}
          </p>
          <DvmInlineVote
            identifier={identifierToHex(activeVoteReq.identifierId)}
            time={activeVoteReq.time}
            ancillaryData={activeVoteReq.ancillaryData ?? "0x"}
            proposedPrice={null}
            dvm={dvm}
            vaultDisputeKey={null}
            vaultSigningEnabled={Boolean(data.vaultEnabled)}
          />
        </div>
      ) : null}

      <h2 style={{ marginTop: 28 }}>Open disputes</h2>
      <p className="muted" style={{ marginTop: 4 }}>
        Oracle disputes we indexed from <code>DisputePrice</code> (Polygon/Eth). The same market can already be an{" "}
        <b>Active DVM vote</b> above even if it does not appear here yet.
      </p>
      {disputes.length === 0 ? (
        <div className="card">
          <p className="muted">
            No rows in this index yet — check <b>Active DVM votes</b> above, use search, or wait for the API poller to
            ingest new <code>DisputePrice</code> events.
          </p>
        </div>
      ) : (
        disputes.map((d: Dispute) => (
          <div key={d.id} className="card votes-dispute-preview">
            <div
              className={
                d.polymarket?.image
                  ? "votes-dispute-preview-row votes-dispute-preview-row--media"
                  : "votes-dispute-preview-row"
              }
            >
              {d.polymarket?.image ? (
                <img
                  className="votes-dispute-preview-img"
                  src={d.polymarket.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : null}
              <div className="votes-dispute-preview-head">
                <h3 className="votes-dispute-preview-title">{disputeTitle(d)}</h3>
                <span className="votes-dispute-preview-badges">
                  {d.reversalWatch ? (
                    <span className="badge badge--reversal-watch" title={d.reversalWatchReason ?? undefined}>
                      Reversal watch
                    </span>
                  ) : null}
                  <span className="badge">{d.chainId === 137 ? "Polygon" : "Ethereum"}</span>
                  {d.topics.length ? <span className="badge">{d.topics.join(", ")}</span> : null}
                </span>
              </div>
            </div>
            {d.polymarket ? (
              <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
                Matched Polymarket market — tap below for full vote flow.
              </p>
            ) : (
              <p className="muted votes-dispute-preview-id" title={d.identifier}>
                {d.identifier}
              </p>
            )}
            <Link
              to={`/votes/dispute/${encodeVoteFocusToken(d.id)}`}
              className="btn btn-primary btn-press votes-dispute-vote-cta"
            >
              View status & vote
            </Link>
          </div>
        ))
      )}

      <details
        className="card votes-filters"
        open={filtersOpen}
        onToggle={(e) => setFiltersOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="votes-filters-summary">Filter dispute list</summary>
        <p className="muted" style={{ marginTop: 4 }}>
          Narrow the <b>Open disputes</b> list below (not the Active DVM list).
        </p>
        <label className="muted" htmlFor="src">
          Source
        </label>
        <select
          id="src"
          className="field"
          style={{ marginTop: 8 }}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="">All</option>
          <option value="polymarket">Polymarket</option>
          <option value="other">Other (exclude Polymarket)</option>
        </select>
        <label className="muted" htmlFor="ch" style={{ display: "block", marginTop: 12 }}>
          OO chain
        </label>
        <select
          id="ch"
          className="field"
          style={{ marginTop: 8 }}
          value={chain}
          onChange={(e) => setChain(e.target.value)}
        >
          <option value="">All chains</option>
          <option value="137">Polygon</option>
          <option value="1">Ethereum</option>
        </select>
        <label className="muted" htmlFor="top" style={{ display: "block", marginTop: 12 }}>
          Topic tag
        </label>
        <select
          id="top"
          className="field"
          style={{ marginTop: 8 }}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        >
          <option value="">All</option>
          <option value="crypto">Crypto</option>
          <option value="geopolitics">Geopolitics</option>
          <option value="sports">Sports</option>
          <option value="general">General</option>
        </select>
        <label className="muted" htmlFor="bond" style={{ display: "block", marginTop: 12 }}>
          Min bond (wei)
        </label>
        <input
          id="bond"
          className="field"
          style={{ marginTop: 8 }}
          placeholder="e.g. 1000000000000000000"
          value={minBond}
          onChange={(e) => setMinBond(e.target.value)}
        />
      </details>

      {data.subgraphError && data.requestsSource !== "rpc" ? (
        <p className="muted" style={{ color: "var(--danger)" }}>
          <b>Could not load proposals:</b> {data.subgraphError}
        </p>
      ) : null}

      {!data.rpcConfigured && !data.polygonOoConfigured ? (
        <div className="card">
          <p className="muted" style={{ color: "var(--danger)" }}>
            <b>No Polygon / Ethereum RPC</b> — dispute indexing and DVM fallback are limited. See README for env vars.
          </p>
        </div>
      ) : null}

      <button type="button" className="btn btn-secondary btn-press" style={{ marginTop: 16 }} onClick={() => q.refetch()}>
        Refresh
      </button>
    </>
  );
}
