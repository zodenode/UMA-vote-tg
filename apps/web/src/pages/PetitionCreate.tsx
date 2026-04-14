import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { apiGet, apiPost, getInitData } from "../api";
import type { Dispute, VotesPayload } from "../voteTypes";
import { disputeTitle } from "../voteUtils";

export default function PetitionCreate() {
  const navigate = useNavigate();
  const initData = getInitData();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [disputeKey, setDisputeKey] = useState("");
  const [conditionIdManual, setConditionIdManual] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const disputesQ = useQuery({
    queryKey: ["votes-for-petition-create"],
    queryFn: () => apiGet<VotesPayload>("/api/votes?omitRequests=1&limit=40"),
  });

  const disputes = disputesQ.data?.disputes ?? [];

  const selectedDispute = useMemo(
    () => disputes.find((d) => d.id === disputeKey) ?? null,
    [disputes, disputeKey]
  );

  const conditionId = useMemo(() => {
    const m = conditionIdManual.trim().toLowerCase();
    if (/^0x[a-f0-9]{64}$/.test(m)) return m;
    const cid = selectedDispute?.polymarket?.conditionId?.trim().toLowerCase();
    if (cid && /^0x[a-f0-9]{64}$/.test(cid)) return cid;
    return "";
  }, [conditionIdManual, selectedDispute]);

  const createMut = useMutation({
    mutationFn: () =>
      apiPost<{ ok: boolean; id: string }>("/api/me/petition/create", {
        initData,
        title: title.trim(),
        body: body.trim(),
        imageUrl: imageUrl.trim(),
        disputeKey: disputeKey.trim() || undefined,
        conditionId: conditionId || undefined,
      }),
    onSuccess: (d) => {
      navigate(`/petitions/${d.id}`, { replace: true });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  if (!initData) {
    return (
      <>
        <Link to="/petitions" className="votes-back-link">
          ← Petitions
        </Link>
        <h1>New petition</h1>
        <div className="card">
          <p className="muted">Open this Mini App from the Telegram bot to create a petition with your session.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Link to="/petitions" className="votes-back-link">
        ← Petitions
      </Link>
      <h1 className="votes-detail-title">Create a petition</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        An <b>https</b> cover image is required. You can optionally tie this to an indexed UMA / Polymarket dispute.
      </p>

      <div className="card" style={{ marginTop: 12 }}>
        <label className="muted" htmlFor="pc-title" style={{ display: "block", marginBottom: 6 }}>
          Title
        </label>
        <input
          id="pc-title"
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          style={{ width: "100%" }}
        />

        <label className="muted" htmlFor="pc-body" style={{ display: "block", marginTop: 12, marginBottom: 6 }}>
          Body
        </label>
        <textarea
          id="pc-body"
          className="field"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ width: "100%", resize: "vertical" }}
        />

        <label className="muted" htmlFor="pc-image" style={{ display: "block", marginTop: 12, marginBottom: 6 }}>
          Cover image URL (https only)
        </label>
        <input
          id="pc-image"
          className="field"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…"
          style={{ width: "100%" }}
        />

        <h3 style={{ marginTop: 16, marginBottom: 8 }}>Link to dispute / Polymarket (optional)</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Choose a dispute we already index, or paste a Polymarket <code>condition_id</code> (0x + 64 hex) if it appears on
          one of those disputes.
        </p>
        {disputesQ.isPending ? (
          <p className="muted">Loading disputes…</p>
        ) : disputesQ.isError ? (
          <p className="muted">Could not load disputes list.</p>
        ) : (
          <select
            className="field"
            value={disputeKey}
            onChange={(e) => {
              setDisputeKey(e.target.value);
              setConditionIdManual("");
            }}
            style={{ width: "100%", marginTop: 8 }}
          >
            <option value="">— No linked dispute —</option>
            {disputes.map((d: Dispute) => (
              <option key={d.id} value={d.id}>
                {disputeTitle(d)}
              </option>
            ))}
          </select>
        )}

        <label className="muted" htmlFor="pc-cid" style={{ display: "block", marginTop: 12, marginBottom: 6 }}>
          Polymarket condition id (optional override)
        </label>
        <input
          id="pc-cid"
          className="field"
          value={conditionIdManual}
          onChange={(e) => setConditionIdManual(e.target.value)}
          placeholder={selectedDispute?.polymarket?.conditionId ?? "0x…"}
          style={{ width: "100%" }}
        />

        {msg ? (
          <p className="muted" style={{ marginTop: 12 }}>
            {msg}
          </p>
        ) : null}

        <button
          type="button"
          className="btn btn-primary btn-press"
          style={{ marginTop: 16 }}
          disabled={createMut.isPending || !title.trim() || !body.trim() || !imageUrl.trim()}
          onClick={() => {
            setMsg(null);
            createMut.mutate();
          }}
        >
          {createMut.isPending ? "Creating…" : "Publish petition"}
        </button>
      </div>
    </>
  );
}
