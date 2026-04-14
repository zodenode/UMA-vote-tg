import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ScrollText } from "lucide-react";
import { apiGet } from "../api";

type ActivePetition = {
  id: string;
  title: string;
  hidden?: boolean;
  imageUrl: string | null;
  signatureCount: number;
  verifiedSignatureCount: number;
  createdAt?: string;
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

export default function PetitionsHome() {
  const q = useQuery({
    queryKey: ["petitions-active"],
    queryFn: () => apiGet<{ petitions: ActivePetition[] }>("/api/petitions/active"),
  });

  return (
    <>
      <Link to="/" className="votes-back-link">
        ← Home
      </Link>
      <h1 className="votes-detail-title">Petitions</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        Community petitions linked to disputes or Polymarkets when you choose. Verified signatures use the same wallet
        you link in the Mini App.
      </p>

      <div style={{ marginTop: 16 }} className="petitions-active-section">
        <h2 className="petitions-section-title">
          <ScrollText size={18} aria-hidden style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
          Active petitions
        </h2>
        {q.isPending ? (
          <div className="card" aria-busy>
            <p className="muted">Loading…</p>
          </div>
        ) : q.isError ? (
          <div className="card">
            <p className="muted">Could not load petitions.</p>
          </div>
        ) : !q.data?.petitions.length ? (
          <div className="card petitions-empty-card">
            <div className="petitions-empty-inner">
              <PetitionEmptyIllustration />
              <p className="muted" style={{ marginTop: 12, textAlign: "center", maxWidth: 280 }}>
                No active petitions yet.
              </p>
              <p className="petitions-create-hint" style={{ marginTop: 8, textAlign: "center" }}>
                <Link to="/petitions/new" className="petitions-create-link">
                  Create a petition
                </Link>
                <span className="muted"> — add a title, image, and optional dispute link.</span>
              </p>
            </div>
          </div>
        ) : (
          <ul className="petitions-active-list">
            {q.data.petitions.map((p) => (
              <li key={p.id}>
                <Link to={`/petitions/${p.id}`} className="petitions-active-item">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" className="petitions-active-thumb" loading="lazy" />
                  ) : (
                    <div className="petitions-active-thumb petitions-active-thumb--placeholder" aria-hidden>
                      <ScrollText size={22} strokeWidth={1.5} />
                    </div>
                  )}
                  <div className="petitions-active-meta">
                    <span className="petitions-active-title">{p.title}</span>
                    <span className="muted petitions-active-sub">
                      {p.verifiedSignatureCount} verified · {p.signatureCount} total
                      {p.createdAt ? ` · ${p.createdAt}` : ""}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <Link to="/petitions/new" className="btn btn-primary btn-press">
          New petition
        </Link>
      </div>
    </>
  );
}
