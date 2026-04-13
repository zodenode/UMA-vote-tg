import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Hex } from "viem";
import { mainnet } from "wagmi/chains";
import { useAccount, useConnect, useChainId, useSwitchChain } from "wagmi";
import { apiGet } from "../api";
import DvmInlineVote from "../components/DvmInlineVote";
import MarketDisputeFinder from "../components/MarketDisputeFinder";
import VaultCustodialPanel from "../components/VaultCustodialPanel";
import { decodeVoteFocusToken } from "../voteFocusToken";

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

type PolymarketOutcome = {
  label: string;
  tokenId: string;
  priceBuy: string | null;
  priceSell: string | null;
  mid: string | null;
};

type PolymarketBlock = {
  conditionId: string;
  title: string | null;
  slug: string | null;
  url: string | null;
  outcomes: PolymarketOutcome[];
  proposedPriceHint: string | null;
  fetchedAt: number;
  error?: string;
} | null;

type Dispute = {
  id: string;
  chainId: number;
  requester?: string;
  proposer?: string;
  disputer?: string;
  identifier: string;
  timestamp: string;
  ancillaryData?: string;
  proposedPrice?: string | null;
  source: string;
  topics: string[];
  bondWei: string | null;
  totalStakeWei: string | null;
  dvmRoundId: string | null;
  voterDappUrl: string;
  etherscanUrl: string;
  txHash: string;
  blockNumber?: number;
  polymarket?: PolymarketBlock;
};

type VotesPayload = {
  requests: VoteReq[];
  disputes: Dispute[];
  dvm: DvmTiming | null;
  rpcConfigured: boolean;
  polygonOoConfigured: boolean;
  subgraphError?: string;
  requestsSource?: "subgraph" | "rpc";
  vaultEnabled?: boolean;
};

function identifierToHex(id: string): Hex {
  const s = id.trim();
  if (s.startsWith("0x")) return s as Hex;
  if (/^[0-9a-fA-F]{64}$/.test(s)) return `0x${s}` as Hex;
  return s as Hex;
}

function formatDuration(sec: number): string {
  if (sec <= 0) return "0m";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function VotesWalletBar() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const wrongChain = isConnected && chainId !== mainnet.id;

  return (
    <div className="card">
      <h2>Wallet</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        <b>Polygon</b> is where most prediction-market OO disputes show up first. <b>DVM commit/reveal</b> still signs on{" "}
        <b>Ethereum mainnet</b> (<code>VotingV2</code>) — use a browser wallet or WalletConnect (set{" "}
        <code>VITE_WALLETCONNECT_PROJECT_ID</code> for Telegram mobile).
      </p>
      {!isConnected ? (
        <div style={{ marginTop: 8 }}>
          {connectors.map((c) => (
            <button
              key={c.uid}
              type="button"
              className="btn btn-primary"
              style={{ marginRight: 8, marginTop: 6 }}
              disabled={connecting}
              onClick={() => connect({ connector: c, chainId: mainnet.id })}
            >
              {connecting ? "Connecting…" : c.name}
            </button>
          ))}
        </div>
      ) : wrongChain ? (
        <div style={{ marginTop: 8 }}>
          <p className="muted">Switch to Ethereum mainnet to vote.</p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={switching}
            onClick={() => switchChain({ chainId: mainnet.id })}
          >
            {switching ? "Switching…" : "Switch to Ethereum"}
          </button>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 8 }}>
          Connected <code>{address?.slice(0, 6)}…{address?.slice(-4)}</code>
        </p>
      )}
    </div>
  );
}

function PolymarketInfo(props: { pm: NonNullable<PolymarketBlock> }) {
  const { pm } = props;
  const title = pm.title?.trim() ? pm.title : "Unknown market";
  const link = pm.url;
  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        borderRadius: 8,
        background: "rgba(127, 127, 127, 0.08)",
        border: "1px solid rgba(127, 127, 127, 0.2)",
      }}
    >
      <p style={{ margin: 0, fontSize: 13 }}>
        <b>Polymarket</b> <span className="muted">(informational, not advice)</span>
      </p>
      {link ? (
        <p style={{ margin: "6px 0 0", fontSize: 13 }}>
          <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => window.Telegram?.WebApp?.openLink(link, { try_instant_view: false }) ?? window.open(link, "_blank")}>
            {title}
          </button>
        </p>
      ) : (
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
          {title}
        </p>
      )}
      {pm.outcomes?.length ? (
        <ul className="muted" style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12 }}>
          {pm.outcomes.map((o) => (
            <li key={o.tokenId}>
              <b>{o.label}</b>
              {o.mid != null ? ` — mid ${o.mid}` : ""}
              {o.mid == null && o.priceBuy != null ? ` — buy ${o.priceBuy}` : ""}
              {o.mid == null && o.priceBuy == null && o.priceSell != null ? ` — sell ${o.priceSell}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {pm.proposedPriceHint ? (
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 11 }}>
          OO proposed (hint): {pm.proposedPriceHint}
        </p>
      ) : null}
      {pm.error ? (
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 11, color: "var(--danger)" }}>
          {pm.error}
        </p>
      ) : null}
    </div>
  );
}

export default function Votes() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");
  const [chain, setChain] = useState<string>("137");
  const [topic, setTopic] = useState<string>("");
  const [minBond, setMinBond] = useState<string>("");
  const [searchParams] = useSearchParams();
  const focusToken = searchParams.get("focus");
  const focusId = useMemo(() => (focusToken ? decodeVoteFocusToken(focusToken) : null), [focusToken]);
  const voteCardRefs = useRef(new Map<string, HTMLDivElement | null>());

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

  useEffect(() => {
    if (!focusId || !q.isSuccess || !q.data) return;
    const reqs = q.data.requests ?? [];
    if (reqs.some((r) => r.id === focusId)) setOpenId(focusId);
  }, [focusId, q.isSuccess, q.data]);

  useEffect(() => {
    if (!focusId || !q.isSuccess) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      voteCardRefs.current.get(focusId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [focusId, q.isSuccess, q.dataUpdatedAt]);

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
        <b>Active DVM requests</b> load from The Graph when <code>THEGRAPH_API_KEY</code> works, otherwise from{" "}
        <code>VotingV2</code> logs via <code>ETH_RPC_URL</code> (same data as vote.umaproject.org, without participation
        % from the indexer). <b>Disputed</b> OO queries use <code>DisputePrice</code> on Polygon (
        <code>POLYGON_RPC_URL</code>) and Ethereum. DVM commit/reveal timing is always mainnet <code>VotingV2</code>.
      </p>

      <div className="card">
        <MarketDisputeFinder className="market-finder--embedded" />
      </div>

      <VotesWalletBar />

      <VaultCustodialPanel apiVaultEnabled={Boolean(data.vaultEnabled)} />

      <h2>Active DVM price requests</h2>
      {data.subgraphError ? (
        <p className="muted" style={{ color: data.requestsSource === "rpc" ? "var(--muted)" : "var(--danger)" }}>
          {data.requestsSource === "rpc" ? (
            <>
              <b>Subgraph:</b> {data.subgraphError} — <b>list below uses on-chain RPC</b> (recent{" "}
              <code>RequestAdded</code> events + <code>getPriceRequestStatuses</code>).
            </>
          ) : (
            <>
              <b>Could not load proposals:</b> {data.subgraphError}
            </>
          )}
        </p>
      ) : null}
      {list.length === 0 ? (
        <div className="card">
          <p className="muted">
            No unresolved DVM price requests right now, or the API cannot reach Ethereum (set <code>ETH_RPC_URL</code>{" "}
            for the on-chain fallback when The Graph fails).
          </p>
        </div>
      ) : (
        list.map((r) => {
          const expanded = openId === r.id;
          return (
            <div
              key={r.id}
              className={`card${focusId === r.id ? " vote-card--focus" : ""}`}
              ref={(el) => {
                voteCardRefs.current.set(r.id, el);
              }}
            >
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
              <DvmInlineVote
                identifier={identifierToHex(r.identifierId)}
                time={r.time}
                ancillaryData={r.ancillaryData}
                proposedPrice={null}
                dvm={dvm}
              />
            </div>
          );
        })
      )}

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
          <option value="137">Polygon (default)</option>
          <option value="">All chains</option>
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
            <b>No POLYGON_RPC_URL or ETH_RPC_URL</b> — disputed-query indexing and the DVM RPC proposal fallback are off.
            Set <code>ETH_RPC_URL</code> to load active price requests when The Graph is unavailable.
          </p>
        </div>
      ) : null}
      {!data.rpcConfigured ? (
        <div className="card">
          <p className="muted">
            <code>ETH_RPC_URL</code> is unset — live DVM phase timing from <code>VotingV2</code> is unavailable (Ethereum
            OO indexing is off too).
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
          <div
            key={d.id}
            className={`card${focusId === d.id ? " vote-card--focus" : ""}`}
            ref={(el) => {
              voteCardRefs.current.set(d.id, el);
            }}
          >
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
            {d.polymarket ? <PolymarketInfo pm={d.polymarket} /> : null}
            <DvmInlineVote
              identifier={identifierToHex(d.identifier)}
              time={d.timestamp}
              ancillaryData={d.ancillaryData ?? "0x"}
              proposedPrice={d.proposedPrice ?? null}
              dvm={dvm}
              vaultDisputeKey={d.id}
              vaultSigningEnabled={Boolean(data.vaultEnabled)}
            />
          </div>
        ))
      )}

      <button type="button" className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => q.refetch()}>
        Refresh now
      </button>
    </>
  );
}
