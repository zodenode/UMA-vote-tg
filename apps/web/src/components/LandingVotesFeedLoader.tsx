/**
 * Branded loading state for the landing “Votes & disputes” feed (replaces flat skeleton bars).
 */
export default function LandingVotesFeedLoader() {
  return (
    <div className="landing-votes-loader" aria-busy="true" aria-live="polite">
      <div className="landing-votes-loader__hero">
        <div className="landing-votes-loader__seal" aria-hidden>
          <svg className="landing-votes-loader__scales" viewBox="0 0 120 100" width="120" height="100">
            <defs>
              <linearGradient id="landingLoaderGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--landing-accent2)" stopOpacity="0.95" />
                <stop offset="100%" stopColor="var(--landing-accent)" stopOpacity="0.75" />
              </linearGradient>
            </defs>
            <line x1="60" y1="12" x2="60" y2="52" stroke="rgba(148,163,184,0.45)" strokeWidth="3" strokeLinecap="round" />
            <line x1="28" y1="28" x2="92" y2="28" stroke="rgba(148,163,184,0.35)" strokeWidth="2" strokeLinecap="round" />
            <path
              d="M32 28 L32 68 M88 28 L88 68"
              stroke="rgba(148,163,184,0.35)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path d="M32 68 L48 82 M88 68 L72 82" stroke="url(#landingLoaderGold)" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="48" cy="86" r="5" fill="rgba(248,113,113,0.35)" />
            <circle cx="72" cy="86" r="5" fill="rgba(34,211,238,0.35)" />
            <circle cx="60" cy="18" r="10" fill="none" stroke="url(#landingLoaderGold)" strokeWidth="1.5" opacity="0.85" />
          </svg>
        </div>
        <div className="landing-votes-loader__status">
          <p className="landing-votes-loader__title">Pulling live disputes</p>
          <p className="landing-votes-loader__subtitle">
            <span className="landing-votes-loader__dot" />
            Polygon OO index
            <span className="landing-votes-loader__sep" aria-hidden>
              ·
            </span>
            <span className="landing-votes-loader__dot landing-votes-loader__dot--delay" />
            Polymarket titles
          </p>
        </div>
      </div>
      <ul className="landing-votes-loader__ghost-list" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li key={i} className="landing-votes-loader__ghost" style={{ animationDelay: `${i * 0.14}s` }}>
            <span className="landing-votes-loader__ghost-badge" />
            <span className="landing-votes-loader__ghost-line landing-votes-loader__ghost-line--a" />
            <span className="landing-votes-loader__ghost-line landing-votes-loader__ghost-line--b" />
          </li>
        ))}
      </ul>
    </div>
  );
}
