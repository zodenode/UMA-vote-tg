import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { apiGet } from "../api";
import DvmInlineVote from "../components/DvmInlineVote";
import PolymarketInfo from "../components/PolymarketInfo";
import PolymarketOddsCharts from "../components/PolymarketOddsCharts";
import VaultCustodialPanel from "../components/VaultCustodialPanel";
import VotesWalletBar from "../components/VotesWalletBar";
import type { DisputeDetailPayload } from "../voteTypes";
import { formatDuration, identifierToHex } from "../voteUtils";

export default function VoteDisputeDetail() {
  const { token } = useParams<{ token: string }>();
  const safeToken = token?.trim() ?? "";

  const q = useQuery({
    queryKey: ["dispute-detail", safeToken],
    queryFn: () => apiGet<DisputeDetailPayload>(`/api/dispute/${encodeURIComponent(safeToken)}`),
    enabled: Boolean(safeToken),
    refetchInterval: 30_000,
  });

  const openVoter = (url?: string) => {
    const u = url ?? "https://vote.umaproject.org/";
    window.Telegram?.WebApp?.openLink(u, { try_instant_view: false }) ?? window.open(u, "_blank");
  };

  if (!safeToken) {
    return (
      <>
        <Link to="/votes" className="votes-back-link">
          ← All disputes
        </Link>
        <h1>Vote</h1>
        <div className="card">
          <p className="muted">Missing dispute link.</p>
        </div>
      </>
    );
  }

  if (q.isPending) {
    return (
      <>
        <Link to="/votes" className="votes-back-link">
          ← All disputes
        </Link>
        <h1>Loading…</h1>
        <div className="card" aria-busy>
          <div className="skeleton" style={{ width: "70%" }} />
          <div className="skeleton" style={{ width: "90%" }} />
        </div>
      </>
    );
  }

  if (q.isError) {
    const msg = String(q.error ?? "");
    const notFound = msg.includes("404") || msg.includes("not found");
    return (
      <>
        <Link to="/votes" className="votes-back-link">
          ← All disputes
        </Link>
        <h1>{notFound ? "Dispute not found" : "Could not load"}</h1>
        <div className="card">
          <p className="muted">
            {notFound
              ? "This dispute is not in the index anymore, or the link is invalid. Open the list and search for your market."
              : "Check your connection and try again."}
          </p>
          <button type="button" className="btn btn-secondary btn-press" style={{ marginTop: 12 }} onClick={() => q.refetch()}>
            Retry
          </button>
        </div>
      </>
    );
  }

  const { dispute: d, dvm } = q.data!;
  const title =
    d.polymarket?.title?.trim() ||
    (d.identifier.length > 20 ? `${d.identifier.slice(0, 18)}…` : d.identifier);

  return (
    <>
      <Link to="/votes" className="votes-back-link">
        ← All disputes
      </Link>

      <h1 className="votes-detail-title">{title}</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        {d.source} · {d.chainId === 137 ? "Polygon" : "Ethereum"} oracle · DVM round {d.dvmRoundId ?? "—"}
      </p>

      {d.reversalWatch ? (
        <div
          className="card"
          style={{
            marginTop: 12,
            borderColor: "rgba(251, 191, 36, 0.35)",
            background: "rgba(251, 191, 36, 0.06)",
          }}
        >
          <p style={{ margin: 0, fontSize: 14 }}>
            <span className="badge badge--reversal-watch">Reversal watch (heuristic)</span>
          </p>
          {d.reversalWatchReason ? (
            <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
              {d.reversalWatchReason}
            </p>
          ) : null}
          <p className="muted" style={{ margin: "10px 0 0", fontSize: 12 }}>
            This compares the OO <code>proposedPrice</code> (0 vs 1e18) to Polymarket CLOB mids using a fixed outcome
            order guess — it is <b>not</b> a DVM forecast or trading advice.
          </p>
        </div>
      ) : null}

      {dvm ? (
        <div className="card votes-dvm-strip">
          <span className="badge">DVM round {dvm.roundId}</span>
          <p className="votes-dvm-strip-main">
            <strong>{dvm.phase === "commit" ? "Commit" : "Reveal"}</strong>
            <span className="muted"> · {formatDuration(dvm.secondsLeftInPhase)} left in phase</span>
          </p>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
            Round ends (UTC): {new Date(dvm.roundEndsAt * 1000).toLocaleString()}
          </p>
        </div>
      ) : (
        <div className="card">
          <p className="muted">DVM phase timing unavailable (API needs Ethereum RPC).</p>
        </div>
      )}

      <VotesWalletBar />

      <VaultCustodialPanel apiVaultEnabled={Boolean(q.data.vaultEnabled)} />

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Vote on-chain</h2>
        <p className="muted">Commit your vote during commit phase, then reveal when reveal opens. You can also use the official app.</p>
        <button type="button" className="btn btn-primary btn-press" style={{ marginTop: 8 }} onClick={() => openVoter(d.voterDappUrl)}>
          Open official voter dApp (with context)
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-press"
          style={{ marginTop: 8 }}
          onClick={() => openVoter(d.etherscanUrl)}
        >
          {d.chainId === 137 ? "Polygonscan" : "Etherscan"} (transaction)
        </button>
        {d.polymarket ? <PolymarketInfo pm={d.polymarket} reversalWatch={d.reversalWatch} /> : null}
        {d.polymarket && d.polymarket.outcomes?.length ? (
          <PolymarketOddsCharts outcomes={d.polymarket.outcomes} />
        ) : null}
        <DvmInlineVote
          identifier={identifierToHex(d.identifier)}
          time={d.timestamp}
          ancillaryData={d.ancillaryData ?? "0x"}
          proposedPrice={d.proposedPrice ?? null}
          dvm={dvm}
          vaultDisputeKey={d.id}
          vaultSigningEnabled={Boolean(q.data.vaultEnabled)}
        />
      </div>
    </>
  );
}
