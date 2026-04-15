import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ScrollText } from "lucide-react";
import { apiGet } from "../api";
import PetitionSignerSocialStrip, { type SignerFace } from "../components/PetitionSignerSocialStrip";

export type PetitionBrowseRow = {
  id: string;
  title: string;
  hidden?: boolean;
  imageUrl: string | null;
  /** Present on current API; older servers may omit. */
  bodySnippet?: string;
  signatureCount: number;
  verifiedSignatureCount: number;
  createdAt?: string;
  polymarketUrl?: string | null;
  /** Sum of illustrative “won if overturned” across unique verified wallets (API v2+). */
  illustrativePotentialWonSumUsd?: number;
  signerPreview?: SignerFace[];
  signerPreviewNote?: string | null;
};

function PetitionEmptyIllustration() {
  return (
    <svg width="120" height="108" viewBox="0 0 120 108" aria-hidden className="petitions-empty-svg">
      <rect x="18" y="14" width="72" height="86" rx="6" fill="var(--surface)" stroke="var(--muted)" strokeWidth="1.5" />
      <line x1="30" y1="32" x2="78" y2="32" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" />
      <line x1="30" y1="44" x2="70" y2="44" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <line x1="30" y1="56" x2="65" y2="56" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path
        d="M78 10 L102 6 L96 26 Z"
        fill="var(--accent)"
        opacity="0.35"
        stroke="var(--accent)"
        strokeWidth="1.2"
      />
      <circle cx="88" cy="40" r="14" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path d="M82 40 L86 44 L96 34" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PetitionFirstCreateCallout() {
  return (
    <div className="petitions-first-create">
      <h3 className="petitions-first-create__title">Create your first Petition</h3>
      <p className="muted petitions-first-create__desc">
        Collect verified signers and a clear, exportable record you can use with counsel to pursue formal complaints in
        the regions or jurisdictions that apply—when you believe UMA DVM votes were wrongful. Each petition picks one
        indexed Polymarket dispute so readers can open the market and signers share a common anchor.
      </p>
      <Link to="/petitions/new" className="btn btn-primary btn-press">
        Start a petition
      </Link>
    </div>
  );
}

function formatStartedAt(createdAt?: string): string | null {
  if (!createdAt) return null;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatUsdCompact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function PetitionChangeCard({ p }: { p: PetitionBrowseRow }) {
  const total = p.signatureCount;
  const verified = p.verifiedSignatureCount;
  const walletPct = total <= 0 ? 0 : Math.min(100, Math.max(6, Math.round((verified / total) * 100)));
  const started = formatStartedAt(p.createdAt);
  const upside = p.illustrativePotentialWonSumUsd ?? 0;

  return (
    <Link to={`/petitions/${p.id}`} className="petitions-cg-card">
      <div className="petitions-cg-card__hero">
        {upside > 0 ? (
          <div className="petitions-cg-card__upside" title="Illustrative sum for wallet-verified signers only — not recoverable funds.">
            <span className="petitions-cg-card__upside-label">Coalition upside (illustr.)</span>
            <span className="petitions-cg-card__upside-num">+{formatUsdCompact(upside)}</span>
          </div>
        ) : null}
        {p.imageUrl ? (
          <img src={p.imageUrl} alt="" className="petitions-cg-card__hero-img" loading="lazy" decoding="async" />
        ) : (
          <div className="petitions-cg-card__hero-placeholder" aria-hidden>
            <ScrollText size={36} strokeWidth={1.25} />
          </div>
        )}
      </div>
      <div className="petitions-cg-card__body">
        <h2 className="petitions-cg-card__title">{p.title}</h2>
        {p.bodySnippet?.trim() ? <p className="petitions-cg-card__excerpt">{p.bodySnippet}</p> : null}
        <div className="petitions-cg-card__sigblock">
          <div className="petitions-cg-card__sigmain">
            <span className="petitions-cg-card__signum">{total.toLocaleString("en-US")}</span>
            <span className="petitions-cg-card__siglabel">signatures</span>
          </div>
          {total > 0 ? (
            <div
              className="petitions-cg-card__meter"
              role="img"
              aria-label={`${verified} of ${total} signers verified with a linked wallet`}
            >
              <div className="petitions-cg-card__meter-fill" style={{ width: `${walletPct}%` }} />
            </div>
          ) : (
            <div className="petitions-cg-card__meter petitions-cg-card__meter--empty" aria-hidden />
          )}
          <p className="petitions-cg-card__sigmeta">
            <strong>{verified.toLocaleString("en-US")}</strong> verified with a wallet
            {started ? (
              <>
                {" "}
                · Started {started}
              </>
            ) : null}
          </p>
          {verified > 0 || (p.signerPreview?.length ?? 0) > 0 ? (
            <div className="petitions-cg-card__social">
              <PetitionSignerSocialStrip
                signerPreview={p.signerPreview ?? []}
                verifiedCount={verified}
                maxFaces={3}
                compact
                note={p.signerPreviewNote ?? null}
              />
              <p className="muted petitions-cg-card__sig-hoverhint" style={{ margin: "6px 0 0", fontSize: 11, lineHeight: 1.35 }}>
                Hover avatars for wallet + illustrative paid (red) / overturn win (green).
              </p>
            </div>
          ) : null}
        </div>
        <span className="petitions-cg-card__cta">Read petition →</span>
      </div>
    </Link>
  );
}

export default function PetitionsBrowse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sortParam = (searchParams.get("sort") ?? "").toLowerCase();
  const sortPotentialWon = sortParam === "potential-won" || sortParam === "potentialwon" || sortParam === "win";

  const q = useQuery({
    queryKey: ["petitions-active", sortPotentialWon ? "potential-won" : "recent"],
    queryFn: () =>
      apiGet<{ sort?: string; petitions: PetitionBrowseRow[] }>(
        sortPotentialWon ? "/api/petitions/active?sort=potential-won" : "/api/petitions/active"
      ),
    retry: 1,
  });

  const hasList = Boolean(q.data?.petitions.length);

  const setSort = (mode: "recent" | "potential-won") => {
    const next = new URLSearchParams(searchParams);
    if (mode === "recent") next.delete("sort");
    else next.set("sort", "potential-won");
    setSearchParams(next, { replace: true });
  };

  return (
    <>
      <Link to="/petitions" className="votes-back-link">
        ← Petitions
      </Link>
      <h1>Browse petitions</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        Open campaigns you can read and sign. Cards show momentum, wallet-verified supporters, and (when present) a{" "}
        <b>coalition overturn upside</b> total — illustrative seeds so you can think about where aligned signatures cluster,
        not a legal recovery line-item.
      </p>

      <div className="petitions-browse-sort" role="group" aria-label="Sort petitions">
        <span className="muted" style={{ fontSize: 13, marginRight: 4 }}>
          Sort:
        </span>
        <button
          type="button"
          className={`petitions-browse-sort__btn${!sortPotentialWon ? " petitions-browse-sort__btn--active" : ""}`}
          onClick={() => setSort("recent")}
        >
          Recent
        </button>
        <button
          type="button"
          className={`petitions-browse-sort__btn${sortPotentialWon ? " petitions-browse-sort__btn--active" : ""}`}
          onClick={() => setSort("potential-won")}
        >
          By overturn upside (illustr.)
        </button>
      </div>

      {sortPotentialWon ? (
        <p className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.45 }}>
          Sorted by combined illustrative “won if overturned” across <b>unique wallet-verified</b> signers. Zero-wallet
          petitions sink to the bottom. This is a narrative lens — consult counsel before any formal action.
        </p>
      ) : null}

      <div style={{ marginTop: 16 }}>
        {q.isPending ? (
          <div className="card" aria-busy>
            <p className="muted">Loading campaigns…</p>
          </div>
        ) : q.isError ? (
          <div className="card petitions-empty-card">
            <div className="petitions-empty-inner">
              <PetitionFirstCreateCallout />
              <p className="muted" style={{ marginTop: 18, fontSize: 13, maxWidth: 320 }}>
                The list could not be loaded. Check <code>VITE_API_URL</code> (web) or open from the Telegram Mini App,
                then try again.
              </p>
              <button type="button" className="btn btn-secondary btn-press" style={{ marginTop: 12 }} onClick={() => q.refetch()}>
                Retry
              </button>
            </div>
          </div>
        ) : !hasList ? (
          <div className="card petitions-empty-card">
            <div className="petitions-empty-inner">
              <PetitionEmptyIllustration />
              <div style={{ marginTop: 8 }}>
                <PetitionFirstCreateCallout />
              </div>
            </div>
          </div>
        ) : (
          <div className="petitions-cg-list">
            {q.data!.petitions.map((p) => (
              <PetitionChangeCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>

      {hasList ? (
        <div className="card" style={{ marginTop: 16 }}>
          <Link to="/petitions/new" className="btn btn-primary btn-press">
            Start a petition
          </Link>
        </div>
      ) : null}
    </>
  );
}
