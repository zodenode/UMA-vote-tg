import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiGet } from "../api";

type VoteReq = {
  id: string;
  time: string;
  identifierId: string;
  ancillaryData: string | null;
  roundId: string | null;
  participationPct: string | null;
};

export default function Votes() {
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["votes"],
    queryFn: () => apiGet<{ requests: VoteReq[]; error?: string }>("/api/votes"),
    refetchInterval: 120_000,
  });

  if (q.isPending) {
    return (
      <>
        <h1>Active rounds</h1>
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
        <h1>Active rounds</h1>
        <div className="card">
          <p className="muted">Could not load votes. Check your connection.</p>
          <button type="button" className="btn btn-secondary" onClick={() => q.refetch()}>
            Retry
          </button>
        </div>
      </>
    );
  }

  const data = q.data!;
  const list = data.requests ?? [];

  if (list.length === 0) {
    const err = (data as { error?: string }).error;
    return (
      <>
        <h1>Active rounds</h1>
        <div className="card">
          {err ? (
            <p className="muted" style={{ color: "var(--danger)", marginBottom: 12 }}>
              {err}
            </p>
          ) : null}
          <p className="muted">
            No unresolved price requests returned. If the subgraph key is missing, configure{" "}
            <code>THEGRAPH_API_KEY</code> on the API. Otherwise there may be nothing active right now.
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => q.refetch()}>
            Refresh
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Active rounds</h1>
      <p className="muted">Unresolved DVM requests (subgraph). Commit and reveal on the official dApp.</p>
      {list.map((r) => {
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
              onClick={() =>
                window.Telegram?.WebApp?.openLink("https://vote.umaproject.org/", {
                  try_instant_view: false,
                }) ?? window.open("https://vote.umaproject.org/", "_blank")
              }
            >
              Open voter dApp
            </button>
          </div>
        );
      })}
    </>
  );
}
