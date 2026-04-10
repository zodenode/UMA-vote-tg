import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiGet } from "../api";

type VoteReq = {
  id: string;
  time: string;
  identifierId: string;
  ancillaryData: string | null;
  roundId: string | null;
  participationPct: string | null;
};

type DvmTiming = {
  phase: "commit" | "reveal";
  roundId: string;
  phaseLengthSec: number;
  secondsLeftInPhase: number;
  phaseEndsAt: number;
  roundEndsAt: number;
  hoursLeftInPhase: number;
};

type Dispute = {
  id: string;
  chainId: number;
  identifier: string;
  timestamp: string;
  source: string;
  topics: string[];
  bondWei: string | null;
  totalStakeWei: string | null;
  dvmRoundId: string | null;
  voterDappUrl: string;
  etherscanUrl: string;
  txHash: string;
};

type VotesPayload = {
  requests: VoteReq[];
  disputes: Dispute[];
  dvm: DvmTiming | null;
  rpcConfigured: boolean;
  polygonOoConfigured: boolean;
  subgraphError?: string;
};

function formatDuration(sec: number): string {
  if (sec <= 0) return "0m";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function Votes() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");
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
  });

  if (q.isPending) {
    return (
      <>
        <h1>Votes & disputes</h1>
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
        <h1>Votes & disputes</h1>
        <div className="card">
          <p className="muted">Could not load data. Check your connection.</p>
          <button type="button" className="btn btn-secondary" onClick={() => q.refetch()}>
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

  const openVoter = (url?: string) => {
    const u = url ?? "https://vote.umaproject.org/";
    window.Telegram?.WebApp?.openLink(u, { try_instant_view: false }) ?? window.open(u, "_blank");
  };

  return (
    <>
      <h1>Votes & disputes</h1>
      <p className="muted">
        <b>Disputed</b> OO queries are indexed from <code>DisputePrice</code> logs on Ethereum (
        <code>ETH_RPC_URL</code>) and optionally Polygon (<code>POLYGON_RPC_URL</code>). DVM commit/reveal timing
        always comes from <code>VotingV2</code> on Ethereum mainnet — it is not chain-agnostic.
      </p>

      <div className="card">
        <h2>Filters</h2>
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
          <option value="">All</option>
          <option value="1">Ethereum</option>
          <option value="137">Polygon</option>
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
      </div>

      {dvm ? (
        <div className="card">
          <span className="badge">DVM round {dvm.roundId}</span>
          <h2 style={{ marginTop: 8 }}>
            {dvm.phase === "commit" ? "Commit phase" : "Reveal phase"}
          </h2>
          <p className="muted">
            ~<b>{formatDuration(dvm.secondsLeftInPhase)}</b> left in this phase (~
            {dvm.hoursLeftInPhase.toFixed(2)}h). Phases alternate every{" "}
            <b>{(dvm.phaseLengthSec / 3600).toFixed(1)}h</b> (commit → reveal).
          </p>
          <p className="muted">
            Round ends (UTC): {new Date(dvm.roundEndsAt * 1000).toLocaleString()}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => openVoter()}>
            Open voter dApp
          </button>
        </div>
      ) : (
        <div className="card">
          <h2>DVM timing</h2>
          <p className="muted">
            Set <code>ETH_RPC_URL</code> on the API to show live commit/reveal countdown from VotingV2.
          </p>
        </div>
      )}

      {!data.rpcConfigured && !data.polygonOoConfigured ? (
        <div className="card">
          <p className="muted" style={{ color: "var(--danger)" }}>
            <b>No ETH_RPC_URL or POLYGON_RPC_URL</b> — on-chain disputed-query indexing is off. The subgraph list
            below may still show DVM price requests.
          </p>
        </div>
      ) : null}
      {!data.rpcConfigured ? (
        <div className="card">
          <p className="muted">
            <code>ETH_RPC_URL</code> is unset — Ethereum OO disputes and live DVM phase timing are unavailable.
          </p>
        </div>
      ) : null}

      <h2>Disputed queries (OO → DVM)</h2>
      {disputes.length === 0 ? (
        <div className="card">
          <p className="muted">
            No disputes in the local index yet. After RPC polling runs, new <code>DisputePrice</code> events appear
            here within ~
            {data.rpcConfigured || data.polygonOoConfigured ? "one poll interval" : "—"}.
          </p>
        </div>
      ) : (
        disputes.map((d) => (
          <div key={d.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong>{d.source}</strong>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span className="badge">{d.chainId === 137 ? "Polygon OO" : "Ethereum OO"}</span>
                <span className="badge">{d.topics.join(", ")}</span>
              </span>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              DVM round (current): <b>{d.dvmRoundId ?? "—"}</b>
            </p>
            {d.bondWei != null ? (
              <p className="muted">
                Bond (settings): <code>{d.bondWei}</code> wei
                {d.totalStakeWei != null ? (
                  <>
                    {" "}
                    · est. stake signal: <code>{d.totalStakeWei}</code>
                  </>
                ) : null}
              </p>
            ) : null}
            <p className="muted" style={{ fontSize: 12, wordBreak: "break-all" }}>
              {d.identifier}
            </p>
            <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => openVoter(d.voterDappUrl)}>
              Open voter dApp (with context)
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 8 }}
              onClick={() => openVoter(d.etherscanUrl)}
            >
              {d.chainId === 137 ? "Polygonscan tx" : "Etherscan tx"}
            </button>
          </div>
        ))
      )}

      <h2>DVM price requests (subgraph)</h2>
      {data.subgraphError ? (
        <p className="muted" style={{ color: "var(--danger)" }}>
          Subgraph: {data.subgraphError}
        </p>
      ) : null}
      {list.length === 0 ? (
        <div className="card">
          <p className="muted">No unresolved price requests from the voting subgraph (or nothing active).</p>
        </div>
      ) : (
        list.map((r) => {
          const expanded = openId === r.id;
          return (
            <div key={r.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>{r.identifierId}</strong>
                <span className="badge">Round {r.roundId ?? "—"}</span>
              </div>
              <p className="muted" style={{ marginTop: 8 }}>
                Requested: {new Date(Number(r.time) * 1000).toLocaleString()}
              </p>
              {r.participationPct != null ? (
                <p className="muted">Participation: {r.participationPct}%</p>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 8 }}
                onClick={() => setOpenId(expanded ? null : r.id)}
              >
                {expanded ? "Hide details" : "Details"}
              </button>
              {expanded ? (
                <pre
                  className="muted"
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontSize: 12,
                    marginTop: 8,
                  }}
                >
                  id: {r.id}
                  {"\n"}
                  ancillary: {r.ancillaryData ?? "—"}
                </pre>
              ) : null}
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: 8 }}
                onClick={() => openVoter()}
              >
                Open voter dApp
              </button>
            </div>
          );
        })
      )}

      <button type="button" className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => q.refetch()}>
        Refresh now
      </button>
    </>
  );
}
