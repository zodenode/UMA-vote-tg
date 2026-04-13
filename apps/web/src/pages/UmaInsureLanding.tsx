import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { InsureThemeGraphic } from "../components/InsureThemeGraphic";
import LandingNav from "../components/LandingNav";
import { Activity, Vote, Zap, Clock, Repeat, AlertOctagon, ArrowRight, Lock } from "lucide-react";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.14, delayChildren: 0.12 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 90, damping: 20 } },
};

export default function UmaInsureLanding() {
  const [hoveredTrigger, setHoveredTrigger] = useState<number | null>(null);

  return (
    <div className="landing">
      <div className="landing-bg" aria-hidden />
      <LandingNav />

      <main className="landing-main landing-main--insure">
        <section className="landing-hero landing-hero--wide">
          <div className="landing-hero-split">
            <div className="landing-hero-copy">
              <p className="landing-eyebrow">USDC vault · Oracle-aware triggers</p>
              <h1 className="landing-title">
                Prediction market <br />
                <span className="landing-title-accent">Settlement protection.</span>
              </h1>
              <p className="landing-lead">
                Not a bet. Not a hedge. A pooled protection layer against <b>finality reversals</b>,{" "}
                <b>oracle contradictions</b>, and <b>settlement delays</b> — with Telegram voting signal, UMA
                monitoring, and automated USDC payouts.
              </p>
              <div className="landing-cta-row">
                <Link to="/swap" className="landing-btn landing-btn--primary" style={{ gap: "10px" }}>
                  Protect your position <ArrowRight style={{ width: "1.1rem", height: "1.1rem" }} aria-hidden />
                </Link>
                <Link to="/votes" className="landing-btn landing-btn--secondary">
                  View USDC vault
                </Link>
              </div>
              <p className="landing-note">
                Triggers are <b>system-verifiable</b> only — no user-fired claims tied to market direction. Same app
                shell as <Link to="/">uma.vote</Link> with shared nav and design tokens.
              </p>
            </div>
            <div className="landing-hero-art">
              <div className="insure-hero-art-wrap">
                <div className="insure-hero-art-glow" aria-hidden />
                <InsureThemeGraphic variant="hero" className="insure-wrap--light" />
              </div>
            </div>
          </div>
        </section>

        <section className="landing-steps" aria-labelledby="insure-how-title">
          <h2 id="insure-how-title" className="landing-section-title">
            How protection works
          </h2>
          <ol className="landing-step-list">
            <li>
              <span className="landing-step-num">1</span>
              <div>
                <strong>Allocate to the vault</strong>
                <p className="landing-step-desc">
                  Premiums pool as USDC. Liquidity is reserved so legitimate system-level triggers can pay without
                  directional bets on outcomes.
                </p>
              </div>
            </li>
            <li>
              <span className="landing-step-num">2</span>
              <div>
                <strong>Monitoring never sleeps</strong>
                <p className="landing-step-desc">
                  Polymarket state, resolution timing, and UMA oracle feeds are watched continuously — the same stack that
                  powers <Link to="/votes">uma.vote</Link> dispute surfacing.
                </p>
              </div>
            </li>
            <li>
              <span className="landing-step-num">3</span>
              <div>
                <strong>Only hard triggers pay</strong>
                <p className="landing-step-desc">
                  Payouts map to verifiable failures (finality reversal, contradiction, delay, invalidation). No
                  “I lost, pay me” button — the engine decides from chain and feed truth.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className="landing-steps insure-steps--follow insure-arch-wrap" aria-labelledby="insure-arch-title">
          <div className="insure-section-intro">
            <h2 id="insure-arch-title" className="landing-section-title" style={{ marginBottom: "12px" }}>
              Tri-layer architecture
            </h2>
            <p className="insure-section-lead">
              Voting, monitoring, and vault payouts — each layer does one job.
            </p>
          </div>

          <div
            className="pointer-events-none absolute right-0 top-0 hidden opacity-35 lg:block"
            style={{ transform: "translate(12%, -18%)" }}
          >
            <InsureThemeGraphic variant="watermark" className="insure-wrap--light" />
          </div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="landing-grid"
            style={{ marginTop: 8 }}
          >
            <motion.article variants={itemVariants} className="landing-card">
              <div
                className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-indigo-500/25 bg-indigo-500/10"
                style={{ color: "#a5b4fc" }}
              >
                <Vote className="h-7 w-7" />
              </div>
              <h3 className="landing-card-title">Telegram voting</h3>
              <p className="landing-card-text">
                Community consensus and rapid signal from Telegram — sentiment without easily gameable dashboards.
              </p>
            </motion.article>

            <motion.article variants={itemVariants} className="landing-card landing-card--glow">
              <div
                className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10"
                style={{ color: "var(--landing-accent2)" }}
              >
                <Activity className="h-7 w-7" />
              </div>
              <h3 className="landing-card-title">UMA monitoring</h3>
              <p className="landing-card-text">
                Tracks Polymarket states, resolutions, and UMA oracle feeds — disputes surface before they surprise you.
              </p>
            </motion.article>

            <motion.article variants={itemVariants} className="landing-card">
              <div
                className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10"
                style={{ color: "#34d399" }}
              >
                <Lock className="h-7 w-7" />
              </div>
              <h3 className="landing-card-title">USDC vault</h3>
              <p className="landing-card-text">
                Pooled premiums in, non-directional claims out — with a strict liquidity buffer so the vault stays
                solvent.
              </p>
            </motion.article>
          </motion.div>
        </section>

        <section className="landing-steps insure-steps--follow">
          <h2 className="landing-section-title">Attack-resistant trigger engine</h2>
          <p className="insure-section-lead text-center" style={{ maxWidth: "40rem", margin: "-8px auto 40px" }}>
            No user-triggerable events. No directional linkage. Payouts map to verifiable, system-level failures.
          </p>

          <div className="insure-split insure-split-visual">
            <div className="insure-split-watermark">
              <InsureThemeGraphic variant="compact" className="insure-wrap--light" />
            </div>
            <div>
              {[
                {
                  id: 1,
                  icon: Repeat,
                  title: "Finality reversal",
                  desc: "Outcome changes after the market is marked resolved.",
                },
                {
                  id: 2,
                  icon: Clock,
                  title: "Settlement delay",
                  desc: "Unresolved past threshold T (48–72h) after expected time.",
                },
                {
                  id: 3,
                  icon: AlertOctagon,
                  title: "Oracle contradiction",
                  desc: "Independent sources (e.g. Polymarket vs UMA) disagree.",
                },
                {
                  id: 4,
                  icon: Zap,
                  title: "Market invalidation",
                  desc: "Market reset or invalidated under platform rules.",
                },
              ].map((trigger) => (
                <motion.div
                  key={trigger.id}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: trigger.id * 0.05 }}
                  onMouseEnter={() => setHoveredTrigger(trigger.id)}
                  onMouseLeave={() => setHoveredTrigger(null)}
                  className={`insure-trigger${hoveredTrigger === trigger.id ? " insure-trigger--active" : ""}`}
                  style={{ marginBottom: "12px" }}
                >
                  <div className="insure-trigger-icon">
                    <trigger.icon style={{ width: "1.35rem", height: "1.35rem" }} />
                  </div>
                  <div>
                    <h4 className="landing-card-title" style={{ marginBottom: "6px", fontSize: "1.05rem" }}>
                      {trigger.title}
                    </h4>
                    <p className="landing-card-text" style={{ margin: 0 }}>
                      {trigger.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45 }}
              className="insure-terminal"
            >
              <div className="insure-terminal-bar">
                <span style={{ width: 10, height: 10, borderRadius: 999, background: "#f43f5e" }} />
                <span style={{ width: 10, height: 10, borderRadius: 999, background: "#f59e0b" }} />
                <span style={{ width: 10, height: 10, borderRadius: 999, background: "#34d399" }} />
                <span className="landing-card-text" style={{ marginLeft: 12, fontSize: "0.7rem", letterSpacing: "0.02em" }}>
                  uma.insure / engine / risk-eval
                </span>
              </div>
              <div className="insure-terminal-body">
                <div className="insure-term-row">
                  <span className="insure-term-label">Target market</span>
                  <span className="insure-term-tag">BTC ≥ 70k (Nov)</span>
                </div>
                <div className="insure-term-metrics">
                  <div className="insure-term-metric">
                    <span className="insure-term-label">Risk band</span>
                    <span className="insure-term-metric-val--amber">Medium</span>
                  </div>
                  <div className="insure-term-metric">
                    <span className="insure-term-label">Oracle dependency</span>
                    <span className="insure-term-metric-val--rose">High</span>
                  </div>
                  <div className="insure-term-metric">
                    <span className="insure-term-label">Premium rate</span>
                    <span className="insure-term-metric-val--cyan">5.00%</span>
                  </div>
                </div>
                <div className="landing-card insure-code-panel">
                  <div className="insure-scan-line" aria-hidden />
                  <code className="insure-code-block">
                    <span style={{ color: "#c084fc" }}>if</span> (market.status ==={" "}
                    <span style={{ color: "#4ade80" }}>&apos;RESOLVED&apos;</span>) {"{"}
                    {"\n"}
                    {"  "}
                    <span style={{ color: "#c084fc" }}>if</span> (outcome.hasChanged || isReopened) {"{"}
                    {"\n"}
                    {"    "}
                    <span style={{ color: "#60a5fa" }}>executePayout</span>(user.vault);{" "}
                    <span style={{ opacity: 0.65 }}>// Trigger 1</span>
                    {"\n"}
                    {"  }"}
                    {"\n"}
                    {"}"}
                  </code>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <footer className="landing-footer">
          <p>
            <strong>uma.insure</strong> — settlement protection narrative layer. Not affiliated with the UMA Foundation.
            Governance:{" "}
            <a href="https://docs.uma.xyz/community/governance" target="_blank" rel="noreferrer">
              docs.uma.xyz
            </a>
          </p>
          <p className="landing-footer-muted">
            <Link to="/" className="landing-link">
              uma.vote home
            </Link>{" "}
            ·{" "}
            <Link to="/voter" className="landing-link">
              Voter story
            </Link>{" "}
            ·{" "}
            <Link to="/swap" className="landing-link">
              Swap
            </Link>{" "}
            ·{" "}
            <Link to="/votes" className="landing-link">
              Web votes
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
