import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { encodeVoteFocusToken } from "../voteFocusToken";
import type { Dispute, VotesPayload } from "../voteTypes";
import { disputeTitle } from "../voteUtils";

function chainLabel(chainId: number): string {
  if (chainId === 137) return "Polygon";
  if (chainId === 1) return "Ethereum";
  return `Chain ${chainId}`;
}

type Props = {
  /** Card heading */
  heading?: string;
  /** Optional extra class on the outer card (e.g. animation utilities). */
  className?: string;
  /** Max rows to show */
  limit?: number;
};

/**
 * Compact list of indexed OOv2 `DisputePrice` disputes — same source as Votes → Open disputes.
 * Shown on Home / Swap / Account so Polygon oracle activity is visible outside the Votes tab.
 */
export default function OODisputesTeaser(props: Props) {
  const { heading = "Oracle disputes (OO)", className = "", limit = 6 } = props;
  const cap = Math.min(12, Math.max(1, limit));

  const q = useQuery({
    queryKey: ["oo-disputes-teaser", cap],
    queryFn: () => apiGet<VotesPayload>(`/api/votes?limit=${cap}&omitRequests=1`),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (q.isPending) {
    return (
      <div className={`card oo-disputes-teaser ${className}`.trim()}>
        <h2>{heading}</h2>
        <div className="skeleton" style={{ width: "55%", marginTop: 8 }} />
        <div className="skeleton" style={{ width: "88%", marginTop: 8 }} />
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className={`card oo-disputes-teaser ${className}`.trim()}>
        <h2>{heading}</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          Could not load disputes. Open <Link to="/votes">Votes</Link> to retry.
        </p>
      </div>
    );
  }

  const disputes = q.data?.disputes ?? [];

  return (
    <div className={`card oo-disputes-teaser ${className}`.trim()}>
      <h2>{heading}</h2>
      <p className="muted oo-disputes-lead">
        Recent <code>DisputePrice</code> events we indexed (Polygon/Eth OOv2). Often lines up with prediction markets
        before the full DVM list updates.
      </p>
      {disputes.length === 0 ? (
        <p className="muted" style={{ marginTop: 10 }}>
          No indexed disputes right now. <Link to="/votes">Votes</Link> also lists active DVM requests.
        </p>
      ) : (
        <ul className="oo-disputes-list">
          {disputes.map((d: Dispute) => {
            const href = `/votes/dispute/${encodeVoteFocusToken(d.id)}`;
            return (
              <li key={d.id} className="oo-disputes-item">
                <div className="oo-disputes-item-main">
                  <span className="oo-disputes-badge">{chainLabel(d.chainId)}</span>
                  <p className="oo-disputes-title">{disputeTitle(d)}</p>
                  <p className="oo-disputes-meta">
                    {d.source}
                    {d.timestamp ? (
                      <>
                        {" "}
                        · {new Date(Number(d.timestamp) * 1000).toLocaleString()}
                      </>
                    ) : null}
                  </p>
                </div>
                <Link to={href} className="btn btn-secondary btn-press oo-disputes-cta">
                  Vote
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted oo-disputes-footer">
        <Link to="/votes">All votes &amp; filters →</Link>
      </p>
    </div>
  );
}
