import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { encodeVoteFocusToken } from "../voteFocusToken";
import LandingVotesFeedLoader from "./LandingVotesFeedLoader";

type LandingDispute = {
  id: string;
  chainId: number;
  source: string;
  topics: string[];
  identifier: string;
  timestamp: string;
  voterDappUrl: string;
  polymarket?: { title?: string | null; url?: string | null } | null;
};

type VotesPayloadLite = {
  disputes: LandingDispute[];
  polygonOoConfigured?: boolean;
  rpcConfigured?: boolean;
};

function chainLabel(chainId: number): string {
  if (chainId === 137) return "Polygon";
  if (chainId === 1) return "Ethereum";
  return `Chain ${chainId}`;
}

function shortHex(s: string, head = 10, tail = 6): string {
  const t = s.trim();
  if (t.length <= head + tail + 3) return t;
  return `${t.slice(0, head)}…${t.slice(-tail)}`;
}

const FEED_TITLE = "Votes & disputes";
const INITIAL_VISIBLE = 5;

export default function LandingDisputesFeed() {
  const [expanded, setExpanded] = useState(false);
  const q = useQuery({
    queryKey: ["landing-disputes", "omitRequests"],
    queryFn: () =>
      apiGet<VotesPayloadLite>("/api/votes?limit=12&chain=137&omitRequests=1"),
    staleTime: 120_000,
    refetchInterval: 60_000,
  });

  if (q.isPending) {
    return (
      <section className="landing-feed" aria-labelledby="landing-feed-title">
        <h2 id="landing-feed-title" className="landing-section-title">
          {FEED_TITLE}
        </h2>
        <LandingVotesFeedLoader />
      </section>
    );
  }

  if (q.isError) {
    return (
      <section className="landing-feed" aria-labelledby="landing-feed-title">
        <h2 id="landing-feed-title" className="landing-section-title">
          {FEED_TITLE}
        </h2>
        <p className="landing-feed-muted">
          Could not load disputes. Use a reachable API (same-origin <code className="landing-feed-code">/api</code> or set{" "}
          <code className="landing-feed-code">VITE_API_URL</code>), then retry.
        </p>
        <p className="landing-feed-retry">
          <button type="button" className="landing-btn landing-btn--ghost" onClick={() => q.refetch()}>
            Retry
          </button>
        </p>
      </section>
    );
  }

  const disputes = q.data?.disputes ?? [];
  const visibleDisputes =
    expanded || disputes.length <= INITIAL_VISIBLE ? disputes : disputes.slice(0, INITIAL_VISIBLE);
  const hasMore = !expanded && disputes.length > INITIAL_VISIBLE;

  return (
    <section className="landing-feed" aria-labelledby="landing-feed-title">
      <h2 id="landing-feed-title" className="landing-section-title">
        {FEED_TITLE}
      </h2>
      <p className="landing-feed-lead">
        Polygon OO disputes headed to the DVM. <strong>Stake</strong> UMA on Ethereum VotingV2 for voting weight (use
        the official voter dApp); <strong>commit / reveal</strong> here is a separate wallet step. Commits without stake
        can be submitted but carry no weight until you are staked — timing of when new stake counts is determined by
        VotingV2 (often the next round).
      </p>

      {disputes.length === 0 ? (
        <p className="landing-feed-muted">
          No active disputes in the index for Polygon right now, or the API is still warming up.{" "}
          <Link to="/votes" className="landing-feed-link">
            Open the full votes page
          </Link>{" "}
          for filters and DVM requests.
        </p>
      ) : (
        <ul className="landing-dispute-list">
          {visibleDisputes.map((d) => {
            const title =
              d.polymarket?.title?.trim() ||
              `${d.source} · ${shortHex(d.identifier, 12, 8)}`;
            const focus = encodeVoteFocusToken(d.id);
            const voteHref = `/votes/dispute/${focus}`;
            const stakeHref = d.voterDappUrl?.trim() || "https://vote.umaproject.org/";

            return (
              <li key={d.id} className="landing-dispute-row">
                <div className="landing-dispute-row-main">
                  <div className="landing-dispute-row-badges">
                    <span className="landing-dispute-badge">{chainLabel(d.chainId)}</span>
                    {d.topics.length ? (
                      <span className="landing-dispute-badge landing-dispute-badge--soft">{d.topics.join(", ")}</span>
                    ) : null}
                  </div>
                  <p className="landing-dispute-title">{title}</p>
                  <p className="landing-dispute-meta">
                    {d.source}
                    {d.timestamp ? (
                      <>
                        {" "}
                        · {new Date(Number(d.timestamp) * 1000).toLocaleString()}
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="landing-dispute-row-actions">
                  <Link to={voteHref} className="landing-btn landing-btn--primary landing-btn--compact">
                    Vote (web)
                  </Link>
                  <a
                    className="landing-btn landing-btn--secondary landing-btn--compact"
                    href={stakeHref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Stake / official dApp
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore ? (
        <p className="landing-feed-more-wrap">
          <button type="button" className="landing-btn landing-btn--ghost" onClick={() => setExpanded(true)}>
            Show {disputes.length - INITIAL_VISIBLE} more
          </button>
        </p>
      ) : null}

      <p className="landing-feed-footer">
        <Link to="/votes" className="landing-feed-link">
          All disputes &amp; DVM requests →
        </Link>
      </p>
    </section>
  );
}
