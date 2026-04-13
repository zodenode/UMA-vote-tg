import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ShieldAlert,
  Activity,
  Vote,
  Zap,
  Clock,
  Repeat,
  AlertOctagon,
  ArrowRight,
  Lock,
} from "lucide-react";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.2, delayChildren: 0.3 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 80 } },
};

const floatingVariants = {
  animate: {
    y: [0, -15, 0],
    transition: { duration: 4, repeat: Infinity, ease: "easeInOut" as const },
  },
};

export default function UmaInsureLanding() {
  const [hoveredTrigger, setHoveredTrigger] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans overflow-hidden selection:bg-cyan-500/30">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.2, 0.3] }}
          transition={{ duration: 8, repeat: Infinity }}
          className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-cyan-900/20 blur-[120px]"
        />
        <motion.div
          animate={{ scale: [1, 1.5, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 12, repeat: Infinity, delay: 2 }}
          className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-indigo-900/20 blur-[150px]"
        />
      </div>

      <nav className="relative z-10 flex justify-between items-center p-6 lg:px-12 border-b border-slate-800/50 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2 font-bold text-2xl tracking-tighter"
        >
          <ShieldAlert className="text-cyan-400" />
          <span>
            uma.<span className="text-cyan-400">insure</span>
          </span>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Link
            to="/swap"
            className="inline-block bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-5 py-2 rounded-full font-medium text-sm hover:bg-cyan-500/20 transition-colors no-underline"
          >
            Launch App
          </Link>
        </motion.div>
      </nav>

      <main className="relative z-10 px-6 lg:px-12 pt-20 pb-32 max-w-7xl mx-auto flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800 mb-8"
        >
          <Activity className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium text-slate-300">Live UMA Monitoring Active</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-tight"
        >
          Prediction Market <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">
            Settlement Protection.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-lg md:text-xl text-slate-400 max-w-2xl mb-10"
        >
          Not a bet. Not a hedge. A pooled protection layer against finality reversals, oracle contradictions, and
          settlement delays.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-4"
        >
          <Link
            to="/swap"
            className="flex items-center justify-center gap-2 bg-cyan-500 text-slate-950 px-8 py-4 rounded-lg font-bold text-lg hover:bg-cyan-400 transition-colors shadow-[0_0_30px_-5px_rgba(34,211,238,0.4)] no-underline"
          >
            Protect Your Position <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            to="/votes"
            className="flex items-center justify-center gap-2 bg-slate-900 text-slate-200 border border-slate-800 px-8 py-4 rounded-lg font-bold text-lg hover:bg-slate-800 transition-colors no-underline"
          >
            View USDC Vault
          </Link>
        </motion.div>
      </main>

      <section className="relative z-10 py-24 bg-slate-900/50 border-y border-slate-800/50">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">The Tri-Layer Architecture</h2>
            <p className="text-slate-400">Voting, Monitoring, and automated USDC payouts.</p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            <motion.div
              variants={itemVariants}
              className="bg-slate-950 p-8 rounded-2xl border border-slate-800 hover:border-indigo-500/50 transition-colors group"
            >
              <motion.div
                variants={floatingVariants}
                animate="animate"
                className="w-14 h-14 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-6 border border-indigo-500/20"
              >
                <Vote className="w-7 h-7 text-indigo-400" />
              </motion.div>
              <h3 className="text-xl font-bold mb-3">Telegram Voting</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Community consensus and rapid signal generation right from Telegram. Monitor sentiment without relying
                on gameable metrics.
              </p>
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="bg-slate-950 p-8 rounded-2xl border border-slate-800 hover:border-cyan-500/50 transition-colors group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-[50px] group-hover:bg-cyan-500/10 transition-colors" />
              <motion.div
                variants={floatingVariants}
                animate="animate"
                className="w-14 h-14 bg-cyan-500/10 rounded-xl flex items-center justify-center mb-6 border border-cyan-500/20"
              >
                <Activity className="w-7 h-7 text-cyan-400" />
              </motion.div>
              <h3 className="text-xl font-bold mb-3">UMA Monitoring</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Real-time tracking of Polymarket states, resolution statuses, and UMA oracle feeds. We watch for disputes
                so you don&apos;t have to.
              </p>
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="bg-slate-950 p-8 rounded-2xl border border-slate-800 hover:border-emerald-500/50 transition-colors group"
            >
              <motion.div
                variants={floatingVariants}
                animate="animate"
                className="w-14 h-14 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-6 border border-emerald-500/20"
              >
                <Lock className="w-7 h-7 text-emerald-400" />
              </motion.div>
              <h3 className="text-xl font-bold mb-3">USDC Vault</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Single pooled fund. Premiums go in, non-directional claims are paid out. Maintained with a strict 20%
                unallocated liquidity buffer.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex flex-col lg:flex-row gap-16 items-center">
            <div className="lg:w-1/2">
              <h2 className="text-4xl font-bold mb-6">
                Attack-Resistant <br />
                <span className="text-cyan-400">Trigger Engine</span>
              </h2>
              <p className="text-slate-400 mb-8 text-lg">
                No user-triggerable events. No directional linkage. Payouts are hardcoded to verifiable, system-level
                failures.
              </p>

              <div className="space-y-4">
                {[
                  { id: 1, icon: Repeat, title: "Finality Reversal", desc: "Outcome changes after market is marked 'Resolved'." },
                  { id: 2, icon: Clock, title: "Settlement Delay", desc: "Unresolved past threshold T (48-72h) after expected time." },
                  { id: 3, icon: AlertOctagon, title: "Oracle Contradiction", desc: "Independent sources (e.g., Polymarket vs UMA) disagree." },
                  { id: 4, icon: Zap, title: "Market Invalidation", desc: "Market officially reset or invalidated by platform rules." },
                ].map((trigger) => (
                  <motion.div
                    key={trigger.id}
                    onHoverStart={() => setHoveredTrigger(trigger.id)}
                    onHoverEnd={() => setHoveredTrigger(null)}
                    className={`flex items-start gap-4 p-4 rounded-xl transition-all cursor-crosshair border ${
                      hoveredTrigger === trigger.id
                        ? "bg-slate-900 border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.1)]"
                        : "bg-slate-950/50 border-slate-800/50"
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg ${
                        hoveredTrigger === trigger.id ? "bg-cyan-500/20 text-cyan-400" : "bg-slate-900 text-slate-500"
                      }`}
                    >
                      <trigger.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-200">{trigger.title}</h4>
                      <p className="text-sm text-slate-500">{trigger.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="lg:w-1/2 w-full">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
                className="relative rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl"
              >
                <div className="flex items-center gap-2 p-4 border-b border-slate-800 bg-slate-900/50">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="ml-4 text-xs font-mono text-slate-500">uma.insure/engine/risk-eval</span>
                </div>

                <div className="p-6 font-mono text-sm">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-slate-400">Target Market:</span>
                    <span className="text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded">BTC ≥ 70k (Nov)</span>
                  </div>

                  <div className="space-y-3 mb-8">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Risk Band:</span>
                      <span className="text-amber-400">Medium</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Oracle Dependency:</span>
                      <span className="text-rose-400">High</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Premium Rate:</span>
                      <span className="text-cyan-400">5.00%</span>
                    </div>
                  </div>

                  <div className="bg-slate-900 rounded-lg p-4 border border-slate-800 relative overflow-hidden">
                    <motion.div
                      animate={{ top: ["-10%", "110%"] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="absolute left-0 right-0 h-[2px] bg-cyan-500/50 shadow-[0_0_8px_rgba(34,211,238,0.8)] opacity-50 z-10"
                    />
                    <code className="text-xs text-slate-400 block">
                      <span className="text-purple-400">if</span> (market.status ==={" "}
                      <span className="text-green-400">&apos;RESOLVED&apos;</span>) {"{"}
                      {"\n"}
                      {"  "}{" "}
                      <span className="text-purple-400">if</span> (outcome.hasChanged || isReopened) {"{"}
                      {"\n"}
                      {"    "}{" "}
                      <span className="text-blue-400">executePayout</span>(user.vault);{" "}
                      <span className="text-slate-500">// Trigger 1</span>
                      {"\n"}
                      {"  }"}
                      {"\n"}
                      {"}"}
                    </code>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800/50 py-12 text-center text-slate-500 text-sm">
        <p className="flex items-center justify-center gap-2 flex-wrap">
          <ShieldAlert className="w-4 h-4 shrink-0" /> uma.insure © 2026. Securing settlement certainty.
          <span className="text-slate-600">·</span>
          <Link to="/" className="text-cyan-500/80 hover:text-cyan-400 no-underline">
            uma.vote app
          </Link>
        </p>
      </footer>
    </div>
  );
}
