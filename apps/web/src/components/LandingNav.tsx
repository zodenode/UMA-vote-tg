import { Link, useLocation } from "react-router-dom";

const botUser = import.meta.env.VITE_PUBLIC_BOT_USERNAME?.replace(/^@/, "") ?? "";

export default function LandingNav() {
  const path = useLocation().pathname;
  const tgHref = botUser ? `https://t.me/${botUser}` : "https://t.me";

  const isInsure = path === "/insure";
  const isVoter = path === "/voter";
  const isVotes = path === "/votes";
  const isSwap = path === "/swap";
  const isPetitions = path === "/petitions" || path.startsWith("/petitions/");
  const isBlog = path === "/blog" || path.startsWith("/blog/");

  const navLink = (to: string, active: boolean, label: string) => (
    <Link to={to} className={`landing-link${active ? " landing-link--active" : ""}`}>
      {label}
    </Link>
  );

  return (
    <header className="landing-nav">
      <Link to="/" className="landing-logo landing-logo--link">
        uma.vote
      </Link>
      <div className="landing-nav-actions">
        {navLink("/insure", isInsure, "uma.insure")}
        {navLink("/voter", isVoter, "Voter story")}
        {navLink("/votes", isVotes, "Web votes")}
        {navLink("/petitions", isPetitions, "Petitions")}
        {navLink("/blog", isBlog, "Blog")}
        {navLink("/swap", isSwap, "Swap")}
        <a className="landing-btn landing-btn--ghost" href={tgHref} target="_blank" rel="noreferrer">
          Telegram
        </a>
      </div>
    </header>
  );
}
