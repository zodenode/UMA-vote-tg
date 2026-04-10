import { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Swap from "./pages/Swap";
import Votes from "./pages/Votes";
import Account from "./pages/Account";
import { apiPost, getInitData, getStartParam } from "./api";
import { SessionProvider, type Session } from "./session";

function applyTelegramTheme() {
  const tw = window.Telegram?.WebApp;
  if (!tw) return;
  const p = tw.themeParams;
  const root = document.documentElement;
  if (p.bg_color) root.style.setProperty("--bg", p.bg_color);
  if (p.secondary_bg_color) root.style.setProperty("--surface", p.secondary_bg_color);
  if (p.text_color) root.style.setProperty("--text", p.text_color);
  if (p.hint_color) root.style.setProperty("--muted", p.hint_color);
  if (p.link_color) root.style.setProperty("--accent", p.link_color);
  if (p.button_color) root.style.setProperty("--accent", p.button_color);
}

export default function App() {
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [session, setSession] = useState<Session>(null);

  useEffect(() => {
    applyTelegramTheme();
    const onChange = () => applyTelegramTheme();
    window.Telegram?.WebApp && window.addEventListener("theme_changed", onChange);
    return () => window.removeEventListener("theme_changed", onChange);
  }, []);

  useEffect(() => {
    const initData = getInitData();
    if (!initData) {
      setSessionError(null);
      return;
    }
    const sp = getStartParam();
    const ref = sp?.startsWith("ref_") ? sp.slice(4) : null;
    apiPost<{ refCode: string; alertsOn: boolean }>("/api/session", { initData, ref })
      .then((s) => {
        setSessionError(null);
        setSession({ refCode: s.refCode, alertsOn: s.alertsOn });
      })
      .catch((e) => {
        setSessionError(String(e));
        setSession(null);
      });
  }, []);

  const tabs = useMemo(
    () => [
      { to: "/", label: "Home", end: true },
      { to: "/swap", label: "Swap" },
      { to: "/votes", label: "Votes" },
      { to: "/account", label: "Account" },
    ],
    []
  );

  return (
    <SessionProvider session={session} setSession={setSession}>
      {sessionError ? (
        <div className="app-shell">
          <div className="card">
            <p className="muted">
              Session could not be verified. Open this app from the Telegram bot (with{" "}
              <code>BOT_TOKEN</code> on the API).
            </p>
          </div>
        </div>
      ) : null}
      <div className="app-shell">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/swap" element={<Swap />} />
          <Route path="/votes" element={<Votes />} />
          <Route path="/account" element={<Account />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <nav className="tabbar" aria-label="Main">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </SessionProvider>
  );
}
