import { Link } from "react-router-dom";
import LandingDisputesFeed from "../components/LandingDisputesFeed";
import MarketDisputeFinder from "../components/MarketDisputeFinder";
import { JusticeThemeGraphic } from "../components/JusticeThemeGraphic";
import LandingNav from "../components/LandingNav";

const botUser = import.meta.env.VITE_PUBLIC_BOT_USERNAME?.replace(/^@/, "") ?? "";

export default function Landing() {
  const tgHref = botUser ? `https://t.me/${botUser}` : "https://t.me";

  return (
    <div className="landing">
      <div className="landing-bg" aria-hidden />
      <LandingNav />

      <main className="landing-main">
        <section className="landing-hero landing-hero--wide">
          <div className="landing-hero-split">
            <div className="landing-hero-copy">
              <p className="landing-eyebrow">Polygon markets · Ethereum DVM</p>
              <h1 className="landing-title">
                Vote the oracle.
                <br />
                <span className="landing-title-accent">From Telegram or the web.</span>
              </h1>
              <p className="landing-lead">
                <strong>uma.vote</strong> is your companion for UMA: follow <b>Polygon</b> prediction-market disputes,
                swap into UMA on Ethereum, commit and reveal on <code>VotingV2</code> (Ethereum), and get alerts —
                without giving up custody.
              </p>
              <MarketDisputeFinder id="find-market" />
              <div className="landing-cta-row">
                <a className="landing-btn landing-btn--primary" href={tgHref} target="_blank" rel="noreferrer">
                  Open in Telegram
                </a>
                <Link to="/votes" className="landing-btn landing-btn--secondary">
                  Vote in browser
                </Link>
              </div>
              <p className="landing-note">
                On-chain actions use your wallet (injected or WalletConnect). In Telegram, use <b>/votes</b> for
                per-request vote buttons that open the same secure flow.
              </p>
            </div>
            <div className="landing-hero-art">
              <JusticeThemeGraphic variant="hero" className="justice-wrap--light" />
            </div>
          </div>
        </section>

        <LandingDisputesFeed />

        <section className="landing-grid" aria-label="Features">
          <article className="landing-card landing-card--glow">
            <span className="landing-card-icon" aria-hidden>
              ◈
            </span>
            <h2 className="landing-card-title">DVM voting</h2>
            <p className="landing-card-text">
              Most live OO disputes surface on Polygon first; DVM commits still go to VotingV2 on Ethereum — or use the
              official voter dApp anytime.
            </p>
          </article>
          <article className="landing-card">
            <span className="landing-card-icon" aria-hidden>
              ⚡
            </span>
            <h2 className="landing-card-title">Bot + Mini App</h2>
            <p className="landing-card-text">
              Browse live disputes from chat, tap Web App buttons to vote with your wallet, and turn on optional alerts.
            </p>
          </article>
          <article className="landing-card">
            <span className="landing-card-icon" aria-hidden>
              ⇄
            </span>
            <h2 className="landing-card-title">ETH → UMA (mainnet)</h2>
            <p className="landing-card-text">
              Acquire UMA for DVM weight via 0x on Ethereum; dispute lists emphasize Polygon OO where the action is.
            </p>
          </article>
        </section>

        <section className="landing-steps">
          <h2 className="landing-section-title">How it works</h2>
          <ol className="landing-step-list">
            <li>
              <span className="landing-step-num">1</span>
              <div>
                <strong>Connect</strong>
                <p className="landing-step-desc">WalletConnect or a browser wallet on Ethereum for DVM signing.</p>
              </div>
            </li>
            <li>
              <span className="landing-step-num">2</span>
              <div>
                <strong>Pick a request</strong>
                <p className="landing-step-desc">Disputed OO queries or subgraph price requests, with DVM phase timing.</p>
              </div>
            </li>
            <li>
              <span className="landing-step-num">3</span>
              <div>
                <strong>Commit → reveal</strong>
                <p className="landing-step-desc">
                  Salt stored locally for reveal. Stake on VotingV2 (official dApp) for weight — not bundled with commit
                  here; commits without stake do not count until you are staked.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <footer className="landing-footer">
          <p>
            Not affiliated with the UMA Foundation. Governance docs:{" "}
            <a href="https://docs.uma.xyz/community/governance" target="_blank" rel="noreferrer">
              docs.uma.xyz
            </a>
          </p>
          <p className="landing-footer-muted">
            Deploy this UI at <strong>uma.vote</strong> — point your DNS here and set{" "}
            <code>VITE_PUBLIC_BOT_USERNAME</code> for the Telegram CTA.
          </p>
        </footer>
      </main>
    </div>
  );
}
