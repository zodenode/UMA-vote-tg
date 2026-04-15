import { Link } from "react-router-dom";

const CASCADE = [
  { amount: "+$1.02M", shift: 0, scale: 1.06, opacity: 1 },
  { amount: "+$394.2K", shift: 12, scale: 1, opacity: 0.95 },
  { amount: "+$2.18M", shift: 22, scale: 0.94, opacity: 0.88 },
  { amount: "+$127K", shift: 30, scale: 0.88, opacity: 0.78 },
  { amount: "+$56.4K", shift: 36, scale: 0.82, opacity: 0.68 },
  { amount: "+$892K", shift: 42, scale: 0.76, opacity: 0.58 },
];

/**
 * Petitions landing: visual + copy for “coalition upside” browse (illustrative seeds — not recoverable funds).
 */
export default function PetitionsPotentialWonBand() {
  return (
    <section className="petitions-upside-band" aria-labelledby="petitions-upside-heading">
      <div className="petitions-upside-band__inner">
        <div className="petitions-upside-band__visual" aria-hidden>
          <div className="petitions-upside-cascade">
            {CASCADE.map((row, i) => (
              <div
                key={i}
                className="petitions-upside-cascade__row"
                style={{
                  transform: `translateX(${row.shift}px) scale(${row.scale})`,
                  opacity: row.opacity,
                  zIndex: CASCADE.length - i,
                }}
              >
                <span className="petitions-upside-cascade__glow" />
                <span className="petitions-upside-cascade__amount">{row.amount}</span>
              </div>
            ))}
          </div>
          <p className="petitions-upside-band__visual-cap muted">Illustrative styling — not live PnL</p>
        </div>
        <div className="petitions-upside-band__copy">
          <p className="landing-eyebrow" style={{ marginBottom: 8 }}>
            Coalition view
          </p>
          <h2 id="petitions-upside-heading" className="petitions-upside-band__title">
            Browse by overturn upside
          </h2>
          <p className="landing-card-text" style={{ marginTop: 0 }}>
            Every petition ties to a real Polymarket dispute. We show each campaign ranked by the{" "}
            <strong>combined illustrative “won if overturned”</strong> across wallet-verified signers — a way to think
            about how much <em>symbolic recovery</em> is on the table if public pressure and process ever move in your
            favor.
          </p>
          <p className="landing-card-text" style={{ marginTop: 12 }}>
            The mental model is simple: <strong>more aligned signatures, more visible coalition weight</strong> — the
            kind of signal investors, media, and counsel notice when they ask whether the crowd is on your side.
          </p>
          <p className="petitions-upside-band__disclaimer muted" style={{ marginTop: 14, fontSize: 13, lineHeight: 1.45 }}>
            Figures are <strong>deterministic illustration seeds</strong>, not Polymarket balances, not legal damages,
            and not a promise of payout. They exist to help people imagine why showing up matters — then read each
            petition and consult qualified counsel before acting.
          </p>
          <div className="landing-cta-row" style={{ marginTop: 18 }}>
            <Link to="/petitions/browse?sort=potential-won" className="landing-btn landing-btn--primary">
              View petitions by upside
            </Link>
            <Link to="/petitions/browse" className="landing-btn landing-btn--secondary">
              Recent first
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
