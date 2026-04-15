import { Link } from "react-router-dom";
import LandingNav from "../components/LandingNav";
import { JusticeThemeGraphic } from "../components/JusticeThemeGraphic";
import PetitionsPotentialWonBand from "../components/PetitionsPotentialWonBand";

const botUser = import.meta.env.VITE_PUBLIC_BOT_USERNAME?.replace(/^@/, "") ?? "";
const tgHref = botUser ? `https://t.me/${botUser}` : "https://t.me";

export default function PetitionsLanding() {
  return (
    <div className="landing">
      <div className="landing-bg" aria-hidden />
      <LandingNav />

      <main className="landing-main">
        <section className="landing-hero landing-hero--wide">
          <div className="landing-hero-split">
            <div className="landing-hero-copy">
              <p className="landing-eyebrow">Wallet-backed campaigns · Community voice</p>
              <h1 className="landing-title">
                Petitions that travel
                <br />
                <span className="landing-title-accent">From signature to substance.</span>
              </h1>
              <p className="landing-lead">
                Start or join <strong>signer-backed campaigns</strong> anchored to indexed Polymarket disputes. Organize
                materials for processes in the regions or jurisdictions that govern your claim — with verification
                through the <b>same wallet</b> you use in the Mini App.{" "}
                <Link to="/petitions/browse?sort=potential-won" className="landing-lead-link">
                  Rank campaigns by coalition overturn upside
                </Link>{" "}
                to see where the crowd signal looks strongest.
              </p>
              <div className="landing-cta-row">
                <Link to="/petitions/browse" className="landing-btn landing-btn--primary">
                  Browse petitions
                </Link>
                <Link to="/petitions/new" className="landing-btn landing-btn--secondary">
                  New petition
                </Link>
              </div>
              <div className="landing-cta-row" style={{ marginTop: 4 }}>
                <a className="landing-btn landing-btn--ghost" href={tgHref} target="_blank" rel="noreferrer">
                  Open in Telegram
                </a>
              </div>
              <p className="landing-note">
                In Telegram, use <b>/petition</b> in DM to run the creation wizard; share links use{" "}
                <code>startapp=petition_{"<id>"}</code> so readers land on the same page in the web app.
              </p>
            </div>
            <div className="landing-hero-art">
              <JusticeThemeGraphic variant="hero" className="justice-wrap--light" />
            </div>
          </div>
        </section>

        <PetitionsPotentialWonBand />

        <section className="landing-grid" aria-label="Why petitions">
          <article className="landing-card landing-card--glow">
            <span className="landing-card-icon" aria-hidden>
              ✍
            </span>
            <h2 className="landing-card-title">Signer-backed</h2>
            <p className="landing-card-text">
              Each signature is tied to a linked wallet flow you control — not anonymous clicks — so campaigns stay
              grounded in accountable participation.
            </p>
          </article>
          <article className="landing-card">
            <span className="landing-card-icon" aria-hidden>
              ⧉
            </span>
            <h2 className="landing-card-title">Disputes &amp; markets</h2>
            <p className="landing-card-text">
              Each petition picks one indexed dispute so readers open the same Polymarket market and signers share one
              anchor for coalition math and context.
            </p>
          </article>
          <article className="landing-card">
            <span className="landing-card-icon" aria-hidden>
              ⚖
            </span>
            <h2 className="landing-card-title">Built for clarity</h2>
            <p className="landing-card-text">
              Use petitions to gather materials and voice — then consult qualified counsel before filing in any
              jurisdiction. This tool expresses community intent, not legal advice.
            </p>
          </article>
        </section>

        <section className="landing-steps">
          <h2 className="landing-section-title">How it works</h2>
          <ol className="landing-step-list">
            <li>
              <span className="landing-step-num">1</span>
              <div>
                <strong>Open the hub</strong>
                <p className="landing-step-desc">
                  Browse open campaigns or tap <b>New petition</b> to draft goals, text, and optional links from your
                  browser or Telegram.
                </p>
              </div>
            </li>
            <li>
              <span className="landing-step-num">2</span>
              <div>
                <strong>Connect &amp; sign</strong>
                <p className="landing-step-desc">
                  Verified signatures use the wallet you connect in the Mini App or web flow — consistent identity
                  across devices when you link your session.
                </p>
              </div>
            </li>
            <li>
              <span className="landing-step-num">3</span>
              <div>
                <strong>Share</strong>
                <p className="landing-step-desc">
                  Share your petition link; supporters read the case and sign on-chain where the product supports it.
                  Operators can export signer data on a schedule for your own compliance review.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <footer className="landing-footer">
          <p>
            Campaigns are <strong>community expression</strong> — not legal advice. Consult qualified counsel before
            filing in any jurisdiction.
          </p>
          <p className="landing-footer-muted">
            Governance context for UMA:{" "}
            <a href="https://docs.uma.xyz/community/governance" target="_blank" rel="noreferrer">
              docs.uma.xyz
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
