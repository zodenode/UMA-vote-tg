import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { apiGet, apiPost, getInitData } from "../api";

type PetitionPublic = {
  id: string;
  hidden?: boolean;
  title: string;
  body: string | null;
  signatureCount: number;
  createdAt?: string;
  legalNote?: string;
};

export default function PetitionDetail() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = (rawId ?? "").trim().toLowerCase();
  const initData = getInitData();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["petition", id, initData.length],
    queryFn: () =>
      initData
        ? apiPost<PetitionPublic>("/api/me/petition/fetch", { initData, petitionId: id })
        : apiGet<PetitionPublic>(`/api/petitions/${encodeURIComponent(id)}`),
    enabled: Boolean(id && /^[a-f0-9]+$/.test(id)),
  });

  const signMut = useMutation({
    mutationFn: () =>
      apiPost<{ ok: boolean; signatureCount: number }>("/api/me/petition/sign", {
        initData,
        petitionId: id,
        comment: comment.trim() || undefined,
      }),
    onSuccess: (d) => {
      setMsg(`Signed. Total: ${d.signatureCount}`);
      void qc.invalidateQueries({ queryKey: ["petition", id, initData.length] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  if (!id || !/^[a-f0-9]+$/.test(id)) {
    return (
      <>
        <h1>Petition</h1>
        <div className="card">
          <p className="muted">Invalid link.</p>
          <Link to="/" className="btn btn-secondary btn-press">
            Home
          </Link>
        </div>
      </>
    );
  }

  if (q.isPending) {
    return (
      <>
        <h1>Petition</h1>
        <div className="card" aria-busy>
          <p className="muted">Loading…</p>
        </div>
      </>
    );
  }

  if (q.isError) {
    return (
      <>
        <h1>Petition</h1>
        <div className="card">
          <p className="muted">Could not load this petition.</p>
          <Link to="/" className="btn btn-secondary btn-press">
            Home
          </Link>
        </div>
      </>
    );
  }

  const p = q.data!;

  return (
    <>
      <Link to="/" className="votes-back-link">
        ← Home
      </Link>
      <h1 className="votes-detail-title">Community petition</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        {p.createdAt ? `Created ${p.createdAt}` : null}
      </p>

      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>{p.title}</h2>
        {p.body ? (
          <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{p.body}</p>
        ) : (
          <p className="muted">This petition is not publicly available.</p>
        )}
        <p style={{ marginTop: 12 }}>
          <b>Signatures:</b> {p.signatureCount}
        </p>
        {p.legalNote ? (
          <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            {p.legalNote}
          </p>
        ) : null}
      </div>

      {initData && p.body != null && !p.hidden ? (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Sign from Mini App</h3>
          <label className="muted" htmlFor="petition-comment" style={{ display: "block", marginBottom: 6 }}>
            Optional short comment
          </label>
          <textarea
            id="petition-comment"
            className="field"
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional (public to operators on export)"
            maxLength={200}
            style={{ width: "100%", resize: "vertical" }}
          />
          <button
            type="button"
            className="btn btn-primary btn-press"
            style={{ marginTop: 10 }}
            disabled={signMut.isPending}
            onClick={() => {
              setMsg(null);
              signMut.mutate();
            }}
          >
            {signMut.isPending ? "Signing…" : "Sign petition"}
          </button>
          {msg ? <p className="muted" style={{ marginTop: 10 }}>{msg}</p> : null}
        </div>
      ) : !initData ? (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="muted">Open this page from the Telegram Mini App to sign with your Telegram session.</p>
        </div>
      ) : null}
    </>
  );
}
