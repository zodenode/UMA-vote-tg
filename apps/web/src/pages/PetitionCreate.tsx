import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, getInitData } from "../api";
import type { VotesPayload } from "../voteTypes";
import { disputeTitle } from "../voteUtils";

type ImageSuggestion = {
  imageUrl: string;
  thumbUrl: string;
  title: string;
  sourceUrl: string;
  licenseShort?: string;
};

export default function PetitionCreate() {
  const navigate = useNavigate();
  const initData = getInitData();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [disputeKey, setDisputeKey] = useState("");
  const [conditionIdManual, setConditionIdManual] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [debouncedImgQuery, setDebouncedImgQuery] = useState("");

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

  const imageSearchQuery = useMemo(() => {
    const chunks: string[] = [];
    if (selectedDispute) {
      chunks.push(disputeTitle(selectedDispute));
      const pm = selectedDispute.polymarket?.title?.trim();
      if (pm) chunks.push(pm);
    }
    const t = title.trim();
    if (t.length >= 3) chunks.push(t);
    return chunks.join(" ").replace(/\s+/g, " ").trim().slice(0, 220);
  }, [selectedDispute, title]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedImgQuery(imageSearchQuery), 450);
    return () => clearTimeout(t);
  }, [imageSearchQuery]);

  const imgSugQ = useQuery({
    queryKey: ["petition-image-suggestions", debouncedImgQuery, initData.length],
    queryFn: () =>
      apiPost<{ suggestions: ImageSuggestion[]; attributionNote?: string | null }>(
        "/api/me/petition/image-suggestions",
        { initData, query: debouncedImgQuery }
      ),
    enabled: initData.length > 0 && debouncedImgQuery.length >= 3,
    staleTime: 120_000,
  });

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
        Link an indexed dispute when you can — we use its wording to suggest <b>free Wikimedia Commons</b> cover images
        (no API key). You still paste or pick an <b>https</b> image URL to publish.
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

        <h3 style={{ marginTop: 16, marginBottom: 8 }}>Link to dispute / Polymarket (optional)</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Choosing a dispute improves image suggestions. You can paste a Polymarket <code>condition_id</code> (0x + 64 hex)
          when it matches an indexed dispute.
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
            {disputes.map((d) => (
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

        <h3 style={{ marginTop: 20, marginBottom: 8 }}>Cover image</h3>
        <label className="muted" htmlFor="pc-image" style={{ display: "block", marginBottom: 6 }}>
          Image URL (<code>https://</code> only)
        </label>
        <input
          id="pc-image"
          className="field"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…"
          style={{ width: "100%" }}
        />

        {debouncedImgQuery.length >= 3 ? (
          <div className="petition-img-sug-wrap" style={{ marginTop: 14 }}>
            <p className="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
              Suggested images for: <i>{debouncedImgQuery.length > 90 ? `${debouncedImgQuery.slice(0, 90)}…` : debouncedImgQuery}</i>
            </p>
            {imgSugQ.isPending ? <p className="muted">Searching Commons…</p> : null}
            {imgSugQ.isError ? (
              <p className="muted">Suggestions unavailable. Paste any https image URL.</p>
            ) : null}
            {imgSugQ.data?.suggestions?.length ? (
              <>
                <div className="petition-img-sug-strip" role="list">
                  {imgSugQ.data.suggestions.map((s) => (
                    <button
                      key={s.imageUrl}
                      type="button"
                      className={[
                        "petition-img-sug-tile",
                        imageUrl.trim() === s.imageUrl ? "petition-img-sug-tile--selected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setImageUrl(s.imageUrl)}
                      title={s.title}
                      role="listitem"
                    >
                      <img src={s.thumbUrl} alt="" className="petition-img-sug-thumb" loading="lazy" />
                      <span className="petition-img-sug-cap">{s.title}</span>
                    </button>
                  ))}
                </div>
                {imgSugQ.data.attributionNote ? (
                  <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                    {imgSugQ.data.attributionNote}{" "}
                    <a href="https://commons.wikimedia.org/wiki/Commons:Licensing" target="_blank" rel="noreferrer">
                      Commons licensing
                    </a>
                  </p>
                ) : null}
              </>
            ) : imgSugQ.isSuccess && !imgSugQ.isPending ? (
              <p className="muted">No Commons hits for this wording — try a shorter phrase or paste a URL.</p>
            ) : null}
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            Type at least <b>3 characters</b> in the title or select a dispute to load image ideas.
          </p>
        )}

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
