import { Link } from "react-router-dom";

const botUser = import.meta.env.VITE_PUBLIC_BOT_USERNAME?.replace(/^@/, "") ?? "";

export default function Landing() {
  const tgHref = botUser ? `https://t.me/${botUser}` : "https://t.me";

  return (
    <div className="landing">
      <div className="landing-bg" aria-hidden />
      <header className="landing-nav">
        <span className="landing-logo">uma.vote</span>
        <div className="landing-nav-actions">
          <Link to="/insure" className="landing-link">
            uma.insure
          </Link>
          <Link to="/votes" className="landing-link">
            Web votes
          </Link>
          <Link to="/swap" className="landing-link">
            Swap
          </Link>
          <a className="landing-btn landing-btn--ghost" href={tgHref} target="_blank" rel="noreferrer">
            Telegram
          </a>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <p className="landing-eyebrow">Ethereum · UMA DVM</p>
          <h1 className="landing-title">
            Vote the oracle.
            <br />
            <span className="landing-title-accent">From Telegram or the web.</span>
          </h1>
          <p className="landing-lead">
            <strong>uma.vote</strong> is your companion for UMA: swap into UMA, track disputed price requests, commit and
            reveal on <code>VotingV2</code>, and get alerts — without giving up custody.
          </p>
          <div className="landing-cta-row">
            <a className="landing-btn landing-btn--primary" href={tgHref} target="_blank" rel="noreferrer">
              Open in Telegram
            </a>
            <Link to="/votes" className="landing-btn landing-btn--secondary">
              Vote in browser
            </Link>
          </div>
          <p className="landing-note">
            On-chain actions use your wallet (injected or WalletConnect). In Telegram, use <b>/votes</b> for per-request
            vote buttons that open the same secure flow.
          </p>
        </section>

        <section className="landing-grid" aria-label="Features">
          <article className="landing-card landing-card--glow">
            <span className="landing-card-icon" aria-hidden>
              ◈
            </span>
            <h2 className="landing-card-title">DVM voting</h2>
            <p className="landing-card-text">
              Commit and reveal directly against UMA VotingV2 on mainnet, or fall back to the official voter dApp anytime.
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
            <h2 className="landing-card-title">ETH → UMA</h2>
            <p className="landing-card-text">
              Route swaps through 0x with clear fee disclosure so you can acquire voting power on Ethereum.
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
                <p className="landing-step-desc">WalletConnect or a browser wallet on mainnet.</p>
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
                <p className="landing-step-desc">Salt stored locally for reveal; stake UMA on VotingV2 for weight.</p>
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
