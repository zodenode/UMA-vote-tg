import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import DvmInlineVote from "../components/DvmInlineVote";
import DvmPhaseStickyBar from "../components/DvmPhaseStickyBar";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiGet } from "../api";
import MarketDisputeFinder from "../components/MarketDisputeFinder";
import VaultCustodialPanel from "../components/VaultCustodialPanel";
import VotesWalletBar from "../components/VotesWalletBar";
import { encodeVoteFocusToken } from "../voteFocusToken";
import type { Dispute, VoteReq, VotesPayload } from "../voteTypes";
import {
  decodeDvmIdentifierLabel,
  disputeEnglishTitle,
  formatEnDateTime,
  identifierToHex,
  summarizeAncillaryData,
  umaVoterDappUrl,
  voteRequestEnglishTitle,
} from "../voteUtils";

const DISPUTES_PAGE_SIZE = 10;
const DISPUTES_PRELOAD_LIMIT = 50;

export default function Votes() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const legacyFocus = searchParams.get("focus")?.trim();

  useEffect(() => {
    if (legacyFocus) {
      navigate(`/votes/dispute/${legacyFocus}`, { replace: true });
    }
  }, [legacyFocus, navigate]);

  /** Inline commit/reveal for a row from Active DVM votes (URLs cannot carry large ancillary payloads). */
  const [activeVoteReq, setActiveVoteReq] = useState<VoteReq | null>(null);
  const activePanelRef = useRef<HTMLDivElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [source, setSource] = useState<string>("");
  /** Default all chains so Ethereum + Polygon disputes both show (Polygon-only filter hid mainnet rows). */
  const [chain, setChain] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [minBond, setMinBond] = useState<string>("");
  const [disputesPage, setDisputesPage] = useState(1);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(DISPUTES_PRELOAD_LIMIT));
    if (source) p.set("source", source);
    if (chain) p.set("chain", chain);
    if (topic) p.set("topic", topic);
    if (minBond.trim()) p.set("minBondWei", minBond.trim());
    return p.toString();
  }, [source, chain, topic, minBond]);

  useEffect(() => {
    setDisputesPage(1);
  }, [queryString]);

  const q = useQuery({
    queryKey: ["votes", queryString],
    queryFn: () => apiGet<VotesPayload>(`/api/votes?${queryString}`),
    refetchInterval: 30_000,
    /** Show last payload while refetching (tab revisit / poll) instead of a blank skeleton. */
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });

  const disputesLoaded = q.data?.disputes ?? [];
  const disputePages = useMemo(
    () => Math.max(1, Math.ceil(disputesLoaded.length / DISPUTES_PAGE_SIZE)),
    [disputesLoaded]
  );

  useEffect(() => {
    setDisputesPage((p) => Math.min(p, disputePages));
  }, [disputePages]);

  const safePage = Math.min(disputesPage, disputePages);
  const disputeSlice = useMemo(() => {
    const start = (safePage - 1) * DISPUTES_PAGE_SIZE;
    return disputesLoaded.slice(start, start + DISPUTES_PAGE_SIZE);
  }, [disputesLoaded, safePage]);

  useEffect(() => {
    if (!activeVoteReq) return;
    activePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeVoteReq?.id]);

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
  const disputeTotal = disputesLoaded.length;
  const dvm = data.dvm;

  const pageShellClass = dvm ? "votes-page votes-page--phase-sticky" : "votes-page";

  return (
    <div className={pageShellClass}>
      <h1>Vote on a dispute</h1>
      <p className="muted">
        Open <b>disputes</b> below are indexed <code>DisputePrice</code> rows (English titles when we can decode them).
        <b> Active DVM votes</b> are live <code>VotingV2</code> requests — expand a row to commit or reveal here. DVM
        phase timing is pinned to the bottom of the screen.
      </p>

      <VotesWalletBar />

      <VaultCustodialPanel apiVaultEnabled={Boolean(data.vaultEnabled)} />

      <h2 style={{ marginTop: 20 }}>Disputes</h2>
      <p className="muted" style={{ marginTop: 4 }}>
        Up to {DISPUTES_PRELOAD_LIMIT} rows load at once; flip pages here. Use filters to change the set.
      </p>

      {disputeTotal === 0 ? (
        <div className="card">
          <p className="muted">
            No rows in this index yet — check <b>Active DVM votes</b> below, use search, or wait for the API poller to
            ingest new <code>DisputePrice</code> events.
          </p>
        </div>
      ) : (
        <>
          <div className="votes-disputes-pager" aria-label="Dispute list pagination">
            <span className="votes-disputes-pager__label">
              Page {safePage} of {disputePages} · {disputeTotal} dispute{disputeTotal === 1 ? "" : "s"}
            </span>
            <div className="votes-disputes-pager__nav">
              <button
                type="button"
                className="btn btn-secondary btn-press"
                disabled={safePage <= 1}
                onClick={() => setDisputesPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-press"
                disabled={safePage >= disputePages}
                onClick={() => setDisputesPage((p) => Math.min(disputePages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
          {disputeSlice.map((d: Dispute) => (
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
                  <h3 className="votes-dispute-preview-title">{disputeEnglishTitle(d)}</h3>
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
          ))}
        </>
      )}

      <details
        className="card votes-filters"
        style={{ marginTop: 20 }}
        open={filtersOpen}
        onToggle={(e) => setFiltersOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="votes-filters-summary">Filter dispute list</summary>
        <p className="muted" style={{ marginTop: 4 }}>
          Changes reload up to {DISPUTES_PRELOAD_LIMIT} disputes from the index (same set as above).
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

      <div className="card" style={{ marginTop: 16 }}>
        <MarketDisputeFinder className="market-finder--embedded" />
      </div>

      <details className="votes-technical" style={{ marginTop: 12 }}>
        <summary className="votes-technical-summary">How data loads (technical)</summary>
        <p className="muted" style={{ marginTop: 8 }}>
          <b>Disputes</b> come from indexed <code>DisputePrice</code> events on Polygon/Ethereum OOv2.{" "}
          <b>Active DVM votes</b> load from The Graph or <code>ETH_RPC_URL</code> log scan. <b>DVM timing</b> is from{" "}
          <code>VotingV2</code>.
        </p>
      </details>

      <h2 style={{ marginTop: 28 }}>Active DVM votes</h2>
      <p className="muted" style={{ marginTop: 4 }}>
        Unresolved requests on Ethereum <code>VotingV2</code> — tap <b>Vote in app</b> to open commit or reveal here.
        Titles prefer English question text from ancillary data when present.
      </p>
      {list.length === 0 ? (
        <div className="card">
          <p className="muted">
            No active DVM price requests right now, or the API cannot load them (set <code>THEGRAPH_API_KEY</code> and/or{" "}
            <code>ETH_RPC_URL</code> on the API).
          </p>
        </div>
      ) : (
        list.map((r: VoteReq) => {
          const displayTitle = voteRequestEnglishTitle(r);
          const labelRaw = decodeDvmIdentifierLabel(r.identifierId);
          const anc = summarizeAncillaryData(r.ancillaryData);
          const voterUrl = umaVoterDappUrl(identifierToHex(r.identifierId), r.time, r.ancillaryData);
          const open = activeVoteReq?.id === r.id;
          return (
            <div
              key={r.id}
              ref={open ? activePanelRef : undefined}
              className="card votes-active-preview"
            >
              <div className="votes-active-preview-head">
                <h3 className="votes-active-preview-title">{displayTitle}</h3>
                <span className="badge">Round {r.roundId ?? "—"}</span>
              </div>
              {displayTitle !== labelRaw ? (
                <p className="muted votes-dispute-preview-id" style={{ margin: "6px 0 0", fontSize: 12 }} title={r.identifierId}>
                  {labelRaw}
                </p>
              ) : null}
              {anc.outcomes?.length ? (
                <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
                  <b>Outcomes:</b>{" "}
                  {anc.outcomes.map((o, i) => (
                    <span key={`${o}-${i}`}>
                      {i > 0 ? " · " : null}
                      <code style={{ fontSize: 12 }}>{o}</code>
                    </span>
                  ))}
                </p>
              ) : null}
              <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
                Requested: {formatEnDateTime(Number(r.time) * 1000)}
                {r.participationPct != null ? ` · Participation ${r.participationPct}%` : ""}
              </p>
              <p style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  className={
                    open ? "btn btn-secondary btn-press votes-dispute-vote-cta" : "btn btn-primary btn-press votes-dispute-vote-cta"
                  }
                  aria-expanded={open}
                  onClick={() => setActiveVoteReq((cur) => (cur?.id === r.id ? null : r))}
                >
                  {open ? "Close" : "Vote in app"}
                </button>
                <a className="btn btn-secondary btn-press votes-dispute-vote-cta" href={voterUrl} target="_blank" rel="noreferrer">
                  Open official voter
                </a>
              </p>
              {open ? (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <DvmInlineVote
                    identifier={identifierToHex(r.identifierId)}
                    time={r.time}
                    ancillaryData={r.ancillaryData ?? "0x"}
                    proposedPrice={null}
                    dvm={dvm}
                    vaultDisputeKey={null}
                    vaultSigningEnabled={Boolean(data.vaultEnabled)}
                    embedWallet
                    officialVoterUrl={voterUrl}
                  />
                </div>
              ) : null}
            </div>
          );
        })
      )}

      {data.subgraphError && data.requestsSource !== "rpc" ? (
        <p className="muted" style={{ color: "var(--danger)", marginTop: 16 }}>
          <b>Could not load proposals:</b> {data.subgraphError}
        </p>
      ) : null}

      {!data.rpcConfigured && !data.polygonOoConfigured ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted" style={{ color: "var(--danger)" }}>
            <b>No Polygon / Ethereum RPC</b> — dispute indexing and DVM fallback are limited. See README for env vars.
          </p>
        </div>
      ) : !dvm ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted">DVM countdown unavailable until the API has <code>ETH_RPC_URL</code>.</p>
        </div>
      ) : null}

      <button type="button" className="btn btn-secondary btn-press" style={{ marginTop: 16 }} onClick={() => q.refetch()}>
        Refresh
      </button>

      {dvm ? <DvmPhaseStickyBar dvm={dvm} /> : null}
    </div>
  );
}
