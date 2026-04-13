import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { JusticeThemeGraphic } from "../components/JusticeThemeGraphic";
import LandingNav from "../components/LandingNav";
import {
  ShieldCheck,
  ArrowRightLeft,
  Lock,
  BellRing,
  Scale,
  Eye,
  Smartphone,
  Wallet,
  Hexagon,
} from "lucide-react";

const botUser = import.meta.env.VITE_PUBLIC_BOT_USERNAME?.replace(/^@/, "") ?? "";
const tgHref = botUser ? `https://t.me/${botUser}` : "https://t.me";

const features: {
  icon: typeof Eye;
  title: string;
  desc: string;
  iconWrap: string;
}[] = [
  {
    icon: Eye,
    title: "Dispute Monitoring",
    desc: "We prioritize Polygon OOv2 DisputePrice logs (prediction markets) and mirror Ethereum where it matters — catch flips fast.",
    iconWrap: "border-rose-500/20 bg-rose-500/10 text-rose-400",
  },
  {
    icon: Scale,
    title: "Commit & Reveal",
    desc: "Follow DVM phases and manage salts in the Mini App; final commits land on Ethereum VotingV2 (how UMA secures the DVM).",
    iconWrap: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
  },
  {
    icon: ArrowRightLeft,
    title: "In-App Swaps",
    desc: "Need UMA for weight? Route ETH → UMA via 0x on Ethereum mainnet, then track Polygon-native disputes in one flow.",
    iconWrap: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400",
  },
  {
    icon: BellRing,
    title: "Automated Alerts",
    desc: "Telegram alerts for new disputes and phase windows — tuned for busy prediction-market calendars.",
    iconWrap: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.12 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100, damping: 22 } },
};

export default function VoterLanding() {
  return (
    <div className="landing min-h-[320vh]">
      <div className="landing-bg" aria-hidden />
      <LandingNav />

      <main className="landing-main landing-main--voter">
        <section className="voter-hero">
          <div className="voter-hero-grid">
            <div className="voter-hero-copy order-2 text-center lg:order-1 lg:text-left">
              <div className="voter-eyebrow-row">
                <span className="voter-chip voter-chip--accent">
                  <Hexagon className="h-4 w-4" style={{ opacity: 0.9 }} />
                  Polygon-first disputes
                </span>
                <span className="voter-chip">
                  <Smartphone className="h-4 w-4" style={{ opacity: 0.85 }} />
                  Telegram Mini App
                </span>
              </div>

              <h1 className="voter-title">
                The UMA DVM. <br />
                <span className="voter-title-accent">Right in your pocket.</span>
              </h1>

              <p className="voter-lead mx-auto lg:mx-0">
                Track <b>Polygon</b> prediction-market disputes as they happen, get swap quotes, then{" "}
                <b>commit and reveal</b> on <b>Ethereum mainnet</b> where <code>VotingV2</code> lives — without leaving
                Telegram.
              </p>
            </div>

            <div className="order-1 flex justify-center lg:order-2">
              <div className="relative w-full max-w-[440px]">
                <div className="voter-mock-glow" aria-hidden />
                <JusticeThemeGraphic variant="hero" className="justice-wrap--light" />
              </div>
            </div>
          </div>

          <div className="voter-scroll-cue">
            <span className="voter-scroll-cue-label">Explore features</span>
            <svg className="justice-scroll-cue-icon mt-1" width="24" height="36" viewBox="0 0 24 40" aria-hidden>
              <path
                d="M12 5V33M12 33L5 26M12 33L19 26"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </section>

        <section className="voter-section voter-section--after-hero">
          <div className="pointer-events-none absolute right-[4%] top-[8%] hidden opacity-45 lg:block">
            <JusticeThemeGraphic variant="compact" className="justice-wrap--light" />
          </div>

          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 lg:grid-cols-2">
            <div className="voter-mock-wrap">
              <motion.div
                initial={{ y: 40, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="voter-mock-phone"
              >
                <div className="voter-mock-inner">
                  <div className="voter-mock-header">
                    <span>Active Disputes</span>
                    <span
                      className="rounded-md px-2 py-1 font-mono text-xs font-semibold"
                      style={{
                        background: "rgba(91, 141, 239, 0.2)",
                        color: "var(--landing-accent2)",
                      }}
                    >
                      Polygon
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px" }}>
                    <div className="landing-card" style={{ padding: "14px", margin: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          marginBottom: "8px",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                        }}
                      >
                        <span
                          style={{
                            borderRadius: "6px",
                            background: "rgba(239, 68, 68, 0.12)",
                            padding: "2px 8px",
                            fontSize: "0.6875rem",
                            fontWeight: 700,
                            color: "#f87171",
                          }}
                        >
                          COMMIT PHASE
                        </span>
                        <span className="voter-body" style={{ fontSize: "0.75rem" }}>
                          12h 40m left
                        </span>
                      </div>
                      <p className="voter-body" style={{ marginBottom: "12px", fontWeight: 500, color: "var(--text)" }}>
                        Polymarket: did this market resolve correctly vs the oracle?
                      </p>
                      <button
                        type="button"
                        className="landing-btn landing-btn--primary"
                        style={{ width: "100%", minHeight: "40px", fontSize: "0.875rem" }}
                      >
                        Commit Vote
                      </button>
                    </div>

                    <div className="landing-card" style={{ padding: "14px", margin: 0 }}>
                      <div className="voter-body" style={{ marginBottom: "8px", fontWeight: 700, color: "#22d3ee" }}>
                        0x SWAP QUOTE
                      </div>
                      <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="font-mono text-sm" style={{ color: "var(--text)" }}>
                          1 ETH
                        </span>
                        <ArrowRightLeft className="h-3 w-3" style={{ color: "var(--muted)" }} />
                        <span className="font-mono text-sm" style={{ color: "var(--text)" }}>
                          UMA
                        </span>
                      </div>
                      <button
                        type="button"
                        className="landing-btn landing-btn--secondary"
                        style={{ width: "100%", minHeight: "40px", fontSize: "0.875rem" }}
                      >
                        Execute Swap
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            <motion.div
              variants={containerVariants}
              initial="hidden"
              whileInView="show"
              viewport={{ once: false, margin: "-80px" }}
              style={{ display: "flex", flexDirection: "column", gap: "48px" }}
            >
              <div>
                <h2 className="voter-h2">Designed for Flexibility</h2>
                <p className="voter-body-lg">
                  Follow <b>Polygon</b> OO where the markets are, then sign <b>DVM</b> transactions on{" "}
                  <b>Ethereum</b> — or use the official voter dApp anytime.
                </p>
              </div>

              <motion.div variants={itemVariants} style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                <div className="voter-feature-icon voter-icon-emerald">
                  <Wallet className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="voter-h3">Non-Custodial by Default</h3>
                  <p className="voter-body">
                    Connect via WalletConnect and sign Commit/Reveal on Ethereum. Salts stay on your device for reveal.
                  </p>
                </div>
              </motion.div>

              <motion.div variants={itemVariants} style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                <div className="voter-feature-icon voter-icon-indigo">
                  <Lock className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="voter-h3">Optional Custodial Vault</h3>
                  <p className="voter-body">
                    Encrypted vault + Telegram commands (
                    <code
                      style={{
                        fontFamily: "var(--landing-mono)",
                        fontSize: "0.85em",
                        background: "rgba(255,255,255,0.06)",
                        padding: "2px 6px",
                        borderRadius: "6px",
                      }}
                    >
                      /vote
                    </code>
                    ,{" "}
                    <code
                      style={{
                        fontFamily: "var(--landing-mono)",
                        fontSize: "0.85em",
                        background: "rgba(255,255,255,0.06)",
                        padding: "2px 6px",
                        borderRadius: "6px",
                      }}
                    >
                      /reveal
                    </code>
                    ) when you want speed over holding keys in-wallet.
                  </p>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        <section className="voter-section">
          <div style={{ marginBottom: "56px", textAlign: "center" }}>
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="voter-h2"
              style={{ fontSize: "clamp(2rem, 5vw, 3rem)", marginBottom: "12px" }}
            >
              Everything You Need.
            </motion.h2>
            <p className="voter-body-lg mx-auto" style={{ maxWidth: "36rem", marginBottom: 0 }}>
              Polygon signal → Ethereum security — one loop inside Telegram.
            </p>
          </div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="landing-grid"
            style={{ marginTop: 0 }}
          >
            {features.map((card) => (
              <motion.div
                key={card.title}
                variants={itemVariants}
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                className="landing-card"
              >
                <div
                  className={`mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-solid ${card.iconWrap}`}
                >
                  <card.icon className="h-7 w-7" />
                </div>
                <h4 className="landing-card-title" style={{ fontSize: "1.125rem" }}>
                  {card.title}
                </h4>
                <p className="landing-card-text">{card.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <section className="voter-section voter-section--cta">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
          >
            <ShieldCheck
              className="mx-auto mb-6"
              style={{ width: "48px", height: "48px", color: "var(--landing-accent)" }}
            />
            <h2 className="voter-h2" style={{ fontSize: "clamp(2rem, 5vw, 3rem)", marginBottom: "12px" }}>
              Ready to Vote?
            </h2>
            <p className="voter-body-lg mx-auto" style={{ maxWidth: "32rem", marginBottom: "32px" }}>
              Open the bot, watch Polygon disputes, then secure the DVM on Ethereum — same app, clear separation of roles.
            </p>
            <div className="landing-cta-row" style={{ marginBottom: 0 }}>
              <a className="landing-btn landing-btn--primary" href={tgHref} target="_blank" rel="noreferrer">
                Open in Telegram
              </a>
              <Link to="/votes" className="landing-btn landing-btn--secondary">
                Vote in browser
              </Link>
            </div>
            <p className="voter-footer-note">
              Not affiliated with the UMA Foundation. ·{" "}
              <Link to="/" className="landing-link">
                Home
              </Link>
            </p>
          </motion.div>
        </section>
      </main>
    </div>
  );
}
