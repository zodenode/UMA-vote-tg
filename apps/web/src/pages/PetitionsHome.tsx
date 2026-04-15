import { Link } from "react-router-dom";

/**
 * Petitions hub — matches Mini App Home layout (intro + “Next step” card).
 * The campaign list lives at <code>/petitions/browse</code>.
 */
export default function PetitionsHome() {
  return (
    <>
      <Link to="/" className="votes-back-link">
        ← Home
      </Link>
      <h1>Petitions</h1>
      <p className="muted">
        Build signer-backed campaigns, each anchored to an indexed Polymarket dispute we track. Use them to organize materials
        for legal processes in the regions or jurisdictions that govern your claim. Verified signatures use the same
        wallet you link in the Mini App.
      </p>
      <div className="card">
        <span className="badge">MVP</span>
        <h2>Next step</h2>
        <p className="muted">Browse open campaigns or start your own petition.</p>
        <div className="row" style={{ marginTop: 12 }}>
          <Link to="/petitions/browse" className="btn btn-secondary" style={{ textDecoration: "none", flex: 1 }}>
            Browse petitions
          </Link>
          <Link to="/petitions/new" className="btn btn-primary" style={{ textDecoration: "none", flex: 1 }}>
            New petition
          </Link>
        </div>
        <p className="muted" style={{ marginTop: 14, fontSize: 13, lineHeight: 1.45 }}>
          See campaigns ranked by{" "}
          <Link to="/petitions/browse?sort=potential-won" style={{ fontWeight: 600 }}>
            illustrative coalition overturn upside
          </Link>{" "}
          (wallet-verified signers) — a lens for where the signal looks strongest, not a payout promise.
        </p>
      </div>
      <p className="muted" style={{ marginTop: 16 }}>
        Campaigns are community expression — not legal advice. Consult qualified counsel before filing in any jurisdiction.
      </p>
    </>
  );
}
