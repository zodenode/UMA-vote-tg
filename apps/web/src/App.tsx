import { ArrowLeftRight, Home as HomeIcon, ListTree, ScrollText, UserRound } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import HomePage from "./pages/Home";
import Landing from "./pages/Landing";
import UmaInsureLanding from "./pages/UmaInsureLanding";
import VoterLanding from "./pages/VoterLanding";
import Swap from "./pages/Swap";
import Votes from "./pages/Votes";
import VoteDisputeDetail from "./pages/VoteDisputeDetail";
import Account from "./pages/Account";
import PetitionDetail from "./pages/PetitionDetail";
import PetitionsHome from "./pages/PetitionsHome";
import PetitionsLanding from "./pages/PetitionsLanding";
import PetitionsBrowse from "./pages/PetitionsBrowse";
import PetitionCreate from "./pages/PetitionCreate";
import BlogIndex from "./pages/BlogIndex";
import BlogPost from "./pages/BlogPost";
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
  try {
    tw.setHeaderColor?.("secondary_bg_color");
  } catch {
    /* ignore */
  }
}

function subscribeMobileNav(cb: () => void) {
  const mql = window.matchMedia("(max-width: 639px)");
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

function getMobileNavSnapshot() {
  return window.matchMedia("(max-width: 639px)").matches;
}

function getMobileNavServerSnapshot() {
  return false;
}

function PetitionsHubRoute() {
  return Boolean(getInitData()) ? <PetitionsHome /> : <PetitionsLanding />;
}

function VoteStartRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const sp = getStartParam();
    if (!sp) return;
    if (sp === "vote") {
      navigate("/votes", { replace: true });
      return;
    }
    if (sp.startsWith("vote_")) {
      const token = sp.slice(5);
      if (token.length > 0 && token.length <= 512) {
        navigate(`/votes/dispute/${token}`, { replace: true });
      } else {
        navigate("/votes", { replace: true });
      }
      return;
    }
    if (sp === "petitions") {
      navigate("/petitions", { replace: true });
      return;
    }
    if (sp.startsWith("petition_")) {
      const pid = sp.slice(9).trim().toLowerCase();
      if (pid.length > 0 && pid.length <= 64 && /^[a-f0-9]+$/.test(pid)) {
        navigate(`/petitions/${pid}`, { replace: true });
      }
    }
  }, [navigate]);
  return null;
}

export default function App() {
  const location = useLocation();
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [session, setSession] = useState<Session>(null);

  const miniApp = Boolean(getInitData());
  const isMobileWebNav = useSyncExternalStore(
    subscribeMobileNav,
    getMobileNavSnapshot,
    getMobileNavServerSnapshot
  );
  const path = location.pathname;
  const onBlog = path === "/blog" || path.startsWith("/blog/");
  const petitionsMarketingHub = !miniApp && path === "/petitions";
  const onLanding =
    path === "/welcome" ||
    path === "/insure" ||
    path === "/voter" ||
    onBlog ||
    petitionsMarketingHub ||
    (path === "/" && !miniApp);
  const onVotesSection = path === "/votes" || path.startsWith("/votes/");
  const onPetitionSection = path === "/petitions" || path.startsWith("/petitions/");
  const onMobileWebShell =
    isMobileWebNav &&
    (path === "/" ||
      path === "/welcome" ||
      path === "/voter" ||
      path === "/insure" ||
      onBlog ||
      path === "/swap" ||
      onVotesSection ||
      onPetitionSection ||
      path === "/account");
  const showTabBar =
    (miniApp &&
      (path === "/" || path === "/swap" || onVotesSection || onPetitionSection || path === "/account")) ||
    (!miniApp && onMobileWebShell) ||
    (!miniApp && !isMobileWebNav && (path === "/swap" || onVotesSection || onPetitionSection || path === "/account"));

  const desktopWebNav = Boolean(!miniApp && !isMobileWebNav && showTabBar);

  useEffect(() => {
    applyTelegramTheme();
    const onChange = () => applyTelegramTheme();
    window.Telegram?.WebApp && window.addEventListener("theme_changed", onChange);
    return () => window.removeEventListener("theme_changed", onChange);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("uma-tg-miniapp", miniApp);
    return () => document.body.classList.remove("uma-tg-miniapp");
  }, [miniApp]);

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
    () =>
      [
        { to: "/", label: "Home", end: true as const, icon: HomeIcon, matchHomeAliases: true as const },
        { to: "/swap", label: "Swap", end: false as const, icon: ArrowLeftRight },
        { to: "/votes", label: "Votes", end: false as const, icon: ListTree },
        { to: "/petitions", label: "Petitions", end: false as const, icon: ScrollText },
        { to: "/account", label: "Account", end: false as const, icon: UserRound },
      ] as const,
    []
  );

  const tabNav = (variant: "bottom" | "desktop-top") => (
    <nav
      className={[
        "tabbar",
        variant === "desktop-top" ? "tabbar--desktop-web" : "",
        variant === "bottom" && miniApp ? "tabbar--miniapp" : "",
        variant === "bottom" && !miniApp && isMobileWebNav ? "tabbar--mobile-web" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Main"
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        return (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => {
              const active =
                "matchHomeAliases" in t && t.matchHomeAliases ? isActive || path === "/welcome" : isActive;
              return active ? "active" : "";
            }}
          >
            <Icon className="tabbar-icon" aria-hidden strokeWidth={2} />
            <span className="tabbar-text">{t.label}</span>
          </NavLink>
        );
      })}
    </nav>
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
      <div className={desktopWebNav ? "app-layout-desktop" : undefined}>
        {desktopWebNav ? tabNav("desktop-top") : null}
        <div
          className={[
            onLanding ? "landing-wrap" : "app-shell",
            showTabBar && onLanding ? "with-bottom-tabbar" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <VoteStartRedirect />
          <Routes>
            <Route path="/welcome" element={<Landing />} />
            <Route path="/voter" element={<VoterLanding />} />
            <Route path="/insure" element={<UmaInsureLanding />} />
            <Route path="/" element={miniApp ? <HomePage /> : <Landing />} />
            <Route path="/swap" element={<Swap />} />
            <Route path="/votes" element={<Votes />} />
            <Route path="/votes/dispute/:token" element={<VoteDisputeDetail />} />
            <Route path="/petitions" element={<PetitionsHubRoute />} />
            <Route path="/petitions/browse" element={<PetitionsBrowse />} />
            <Route path="/petitions/new" element={<PetitionCreate />} />
            <Route path="/petitions/:id" element={<PetitionDetail />} />
            <Route path="/blog" element={<BlogIndex />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/account" element={<Account />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        {showTabBar && !desktopWebNav ? tabNav("bottom") : null}
      </div>
    </SessionProvider>
  );
}
