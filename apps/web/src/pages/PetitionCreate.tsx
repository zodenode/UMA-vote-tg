import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { mainnet } from "wagmi/chains";
import { useAccount, useChainId, useConnect, useSignMessage, useSwitchChain } from "wagmi";
import {
  apiGet,
  apiPost,
  getInitData,
  setWebPetitionSession,
  webPetitionSignOut,
  webPetitionVerify,
} from "../api";
import { useWebPetitionSessionToken } from "../useWebPetitionSessionToken";
import PolymarketWalletBanner from "../components/PolymarketWalletBanner";

type ImageSuggestion = {
  imageUrl: string;
  thumbUrl: string;
  title: string;
  sourceUrl: string;
  licenseShort?: string;
};

type PetitionDisputeSearchHit = {
  disputeKey: string;
  conditionId: string | null;
  label: string;
  polymarketUrl: string | null;
  polymarketSlug: string | null;
  imageUrl: string | null;
  chainId: string;
  matchSource: "polymarket-search" | "indexed-text";
};

export default function PetitionCreate() {
  const navigate = useNavigate();
  const initData = getInitData();
  const webTok = useWebPetitionSessionToken();
  const canUsePetitionTools = Boolean(initData.trim()) || Boolean(webTok);
  const sessionKey = initData.trim() ? `tg:${initData.length}` : webTok ? `web:${webTok.slice(0, 12)}` : "anon";

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { signMessageAsync, isPending: signing } = useSignMessage();
  const wrongChain = isConnected && chainId !== mainnet.id;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [debouncedImgQuery, setDebouncedImgQuery] = useState("");

  const [disputeQuery, setDisputeQuery] = useState("");
  const [debouncedDisputeQ, setDebouncedDisputeQ] = useState("");
  const [selectedDispute, setSelectedDispute] = useState<PetitionDisputeSearchHit | null>(null);
  const [disputeMenuOpen, setDisputeMenuOpen] = useState(false);
  const acWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedDisputeQ(disputeQuery.trim()), 320);
    return () => clearTimeout(t);
  }, [disputeQuery]);

  const disputeSearchQ = useQuery({
    queryKey: ["petition-dispute-search", debouncedDisputeQ],
    queryFn: () =>
      apiGet<{ hits: PetitionDisputeSearchHit[] }>(
        `/api/petitions/dispute-search?q=${encodeURIComponent(debouncedDisputeQ)}&limit=12`
      ),
    enabled: canUsePetitionTools && debouncedDisputeQ.length >= 2,
    staleTime: 45_000,
  });

  const imageSearchQuery = useMemo(() => {
    const chunks: string[] = [];
    if (selectedDispute?.label) chunks.push(selectedDispute.label);
    const t = title.trim();
    if (t.length >= 3) chunks.push(t);
    return chunks.join(" ").replace(/\s+/g, " ").trim().slice(0, 220);
  }, [selectedDispute, title]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedImgQuery(imageSearchQuery), 450);
    return () => clearTimeout(t);
  }, [imageSearchQuery]);

  const imgSugBody = useMemo(() => {
    const q = debouncedImgQuery;
    const base = { query: q };
    const trimmed = initData.trim();
    return trimmed ? { ...base, initData: trimmed } : base;
  }, [debouncedImgQuery, initData]);

  const imgSugQ = useQuery({
    queryKey: ["petition-image-suggestions", debouncedImgQuery, sessionKey],
    queryFn: () =>
      apiPost<{ suggestions: ImageSuggestion[]; attributionNote?: string | null }>(
        "/api/me/petition/image-suggestions",
        imgSugBody
      ),
    enabled: canUsePetitionTools && debouncedImgQuery.length >= 3,
    staleTime: 120_000,
  });

  const createBody = useMemo(() => {
    const trimmed = initData.trim();
    const base = {
      title: title.trim(),
      body: body.trim(),
      imageUrl: imageUrl.trim(),
      disputeKey: selectedDispute?.disputeKey ?? "",
      conditionId: selectedDispute?.conditionId ?? undefined,
    };
    return trimmed ? { ...base, initData: trimmed } : base;
  }, [initData, title, body, imageUrl, selectedDispute]);

  const createMut = useMutation({
    mutationFn: () => apiPost<{ ok: boolean; id: string }>("/api/me/petition/create", createBody),
    onSuccess: (d) => {
      navigate(`/petitions/${d.id}`, { replace: true });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const webSignInMut = useMutation({
    mutationFn: async () => {
      const ch = await apiPost<{ message: string; issuedAt: string }>("/api/web/petition/challenge", {});
      const signature = await signMessageAsync({ message: ch.message });
      const out = await webPetitionVerify(signature, ch.message, ch.issuedAt);
      setWebPetitionSession(out.token);
      return out.address;
    },
    onSuccess: () => setMsg(null),
    onError: (e: Error) => setMsg(e.message),
  });

  const pickDispute = (h: PetitionDisputeSearchHit) => {
    if (!h.conditionId) return;
    setSelectedDispute(h);
    setDisputeQuery(h.label);
    setDisputeMenuOpen(false);
  };

  const hits = disputeSearchQ.data?.hits?.filter((h) => h.conditionId) ?? [];
  const showDisputeDropdown =
    disputeMenuOpen && debouncedDisputeQ.length >= 2 && (disputeSearchQ.isFetching || hits.length > 0 || disputeSearchQ.isError);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = acWrapRef.current;
      if (!el || !disputeMenuOpen) return;
      if (e.target instanceof Node && !el.contains(e.target)) setDisputeMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [disputeMenuOpen]);

  if (!canUsePetitionTools) {
    return (
      <>
        <Link to="/petitions" className="votes-back-link">
          ← Petitions
        </Link>
        <h1>New petition</h1>
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            Open from the <b>Telegram</b> Mini App to use your Telegram session, or <b>sign in with Ethereum</b> below to
            create a petition from the browser (no gas — personal signature only).
          </p>
          {!isConnected ? (
            <div style={{ marginTop: 14 }}>
              {connectors.map((c) => (
                <button
                  key={c.uid}
                  type="button"
                  className="btn btn-primary btn-press"
                  style={{ marginRight: 8, marginTop: 6 }}
                  disabled={connecting}
                  onClick={() => connect({ connector: c, chainId: mainnet.id })}
                >
                  {connecting ? "Connecting…" : `Connect ${c.name}`}
                </button>
              ))}
            </div>
          ) : wrongChain ? (
            <div style={{ marginTop: 14 }}>
              <p className="muted">Use Ethereum mainnet for petition sign-in.</p>
              <button
                type="button"
                className="btn btn-primary btn-press"
                disabled={switching}
                onClick={() => switchChain({ chainId: mainnet.id })}
              >
                {switching ? "Switching…" : "Switch to Ethereum"}
              </button>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 14 }}>
              Connected <code>{address?.slice(0, 6)}…{address?.slice(-4)}</code>
            </p>
          )}
          {isConnected && !wrongChain ? <PolymarketWalletBanner /> : null}
          <p className="muted" style={{ marginTop: 10, fontSize: 12, lineHeight: 1.45 }}>
            Wallets: <b>MetaMask</b>, <b>Coinbase Wallet</b>
            {import.meta.env.VITE_MAGIC_PUBLISHABLE_KEY?.trim() ? ", " : ""}
            {import.meta.env.VITE_MAGIC_PUBLISHABLE_KEY?.trim() ? <b>Magic Link</b> : null}
            {import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() ? ", " : null}
            {import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() ? <b>WalletConnect</b> : null}
            {", and other "}
            <b>injected</b> browsers (e.g. Phantom with Ethereum enabled).
          </p>
          <button
            type="button"
            className="btn btn-primary btn-press"
            style={{ marginTop: 16 }}
            disabled={!isConnected || wrongChain || webSignInMut.isPending || signing}
            onClick={() => {
              setMsg(null);
              webSignInMut.mutate();
            }}
          >
            {webSignInMut.isPending || signing ? "Confirm in wallet…" : "Sign in with Ethereum"}
          </button>
          {msg ? (
            <p className="muted" style={{ marginTop: 12 }}>
              {msg}
            </p>
          ) : null}
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
        Every petition must tie to an <b>indexed</b> Polymarket-backed dispute we already track (search by market wording).
        We store the Polymarket <b>condition id</b> so signer views can anchor illustrative amounts; wallet signatures verify
        address control, not your Polymarket fills.
      </p>
      {webTok && !initData.trim() ? (
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          Signed in on the web.{" "}
          <button
            type="button"
            className="btn btn-secondary btn-press"
            style={{ display: "inline", padding: "4px 10px", minHeight: 0, width: "auto", fontSize: 13 }}
            onClick={() => {
              void webPetitionSignOut().catch(() => setWebPetitionSession(null));
            }}
          >
            Sign out
          </button>
        </p>
      ) : null}

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

        <h3 style={{ marginTop: 16, marginBottom: 8 }}>Polymarket dispute (required)</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Type a phrase from the market (example: <i>US and Iran ceasefire by April 7</i>), pick a result, then open Polymarket
          from the preview to confirm it is the market you mean.
        </p>
        <div className="petition-dispute-ac" ref={acWrapRef}>
          <div className="petition-dispute-ac-input-wrap">
            <input
              id="pc-dispute-search"
              className="field"
              style={{ flex: 1, minWidth: 0 }}
              value={disputeQuery}
              onChange={(e) => {
                setDisputeQuery(e.target.value);
                setSelectedDispute(null);
                setDisputeMenuOpen(true);
              }}
              onFocus={() => setDisputeMenuOpen(true)}
              placeholder="Search indexed disputes…"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={showDisputeDropdown}
              aria-controls="pc-dispute-list"
            />
            {selectedDispute ? (
              <button
                type="button"
                className="btn btn-secondary btn-press"
                onClick={() => {
                  setSelectedDispute(null);
                  setDisputeQuery("");
                  setDisputeMenuOpen(true);
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
          {showDisputeDropdown ? (
            <div id="pc-dispute-list" className="petition-dispute-ac-list" role="listbox">
              {disputeSearchQ.isFetching ? (
                <div className="petition-dispute-ac-item muted" style={{ cursor: "default" }}>
                  Searching…
                </div>
              ) : null}
              {disputeSearchQ.isError ? (
                <div className="petition-dispute-ac-item muted" style={{ cursor: "default" }}>
                  Search failed — try again or shorten the phrase.
                </div>
              ) : null}
              {!disputeSearchQ.isFetching && !disputeSearchQ.isError && hits.length === 0 ? (
                <div className="petition-dispute-ac-item muted" style={{ cursor: "default" }}>
                  No indexed match yet. Try different wording, a Polymarket URL, or a 0x… condition id — the dispute must
                  already appear in uma.vote's indexed list.
                </div>
              ) : null}
              {hits.map((h) => (
                <button
                  key={h.disputeKey}
                  type="button"
                  className="petition-dispute-ac-item"
                  role="option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickDispute(h)}
                >
                  <div className="petition-dispute-ac-item-title">{h.label}</div>
                  <div className="petition-dispute-ac-item-meta">
                    {h.matchSource === "polymarket-search" ? "Polymarket search → indexed" : "Indexed dispute text match"}
                    {h.polymarketUrl ? (
                      <>
                        {" · "}
                        <a href={h.polymarketUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          Open Polymarket
                        </a>
                      </>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {selectedDispute ? (
          <div className="petition-dispute-ac-selected">
            <div>
              <b>Selected:</b> {selectedDispute.label}
            </div>
            {selectedDispute.polymarketUrl ? (
              <div style={{ marginTop: 6 }}>
                <a href={selectedDispute.polymarketUrl} target="_blank" rel="noreferrer">
                  Polymarket page
                </a>
                {selectedDispute.conditionId ? (
                  <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                    · condition <code style={{ fontSize: 11 }}>{selectedDispute.conditionId.slice(0, 10)}…</code>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

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
            Select a dispute and type at least <b>3 characters</b> in the title (or rely on the market title) to load image ideas.
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
          disabled={
            createMut.isPending ||
            !title.trim() ||
            !body.trim() ||
            !imageUrl.trim() ||
            !selectedDispute?.disputeKey ||
            !selectedDispute.conditionId
          }
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
