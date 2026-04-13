/**
 * Justice-themed hero art: temple columns, pediment, balanced scales — motion is CSS-only
 * for smooth, editorial polish (see styles.css `.justice-*`).
 */

import { useId } from "react";

type Variant = "hero" | "compact" | "watermark";

export function JusticeThemeGraphic({
  variant = "hero",
  className = "",
}: {
  variant?: Variant;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const gidGold = `jg-${uid}`;
  const gidMarble = `jm-${uid}`;
  const gidSeal = `js-${uid}`;
  const fidGlow = `jfg-${uid}`;

  const wrap =
    variant === "hero"
      ? "justice-wrap justice-wrap--hero"
      : variant === "compact"
        ? "justice-wrap justice-wrap--compact"
        : "justice-wrap justice-wrap--watermark";

  return (
    <div className={`${wrap} ${className}`.trim()} aria-hidden>
      <svg
        className="justice-svg"
        viewBox="0 0 440 480"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={gidGold} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--justice-gold-bright)" />
            <stop offset="55%" stopColor="var(--justice-gold)" />
            <stop offset="100%" stopColor="var(--justice-bronze)" />
          </linearGradient>
          <linearGradient id={gidMarble} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--justice-marble-top)" />
            <stop offset="100%" stopColor="var(--justice-marble-bot)" />
          </linearGradient>
          <radialGradient id={gidSeal} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--justice-seal-core)" />
            <stop offset="70%" stopColor="var(--justice-seal-mid)" />
            <stop offset="100%" stopColor="var(--justice-seal-edge)" />
          </radialGradient>
          <filter id={fidGlow} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Slow rotating rays — behind architecture */}
        <g className="justice-rays" transform="translate(220 200)">
          {Array.from({ length: 16 }).map((_, i) => (
            <line
              key={i}
              x1="0"
              y1="0"
              x2="0"
              y2="-118"
              stroke="var(--justice-ray)"
              strokeWidth="1"
              opacity={0.15 + (i % 3) * 0.08}
              transform={`rotate(${i * 22.5} 0 0)`}
            />
          ))}
        </g>

        {/* Floating “truth” shards */}
        <path
          className="justice-shard justice-shard--a"
          d="M72 120 L88 98 L104 120 L88 142 Z"
          stroke="var(--justice-gold)"
          strokeWidth="1.2"
          fill="var(--justice-shard-fill)"
          opacity="0.85"
        />
        <path
          className="justice-shard justice-shard--b"
          d="M348 156 L368 128 L388 156 L368 184 Z"
          stroke="var(--justice-gold-dim)"
          strokeWidth="1.2"
          fill="var(--justice-shard-fill)"
          opacity="0.7"
        />
        <circle
          className="justice-shard justice-shard--c"
          cx="380"
          cy="88"
          r="5"
          fill="var(--justice-gold-bright)"
          opacity="0.5"
        />

        {/* Columns */}
        <g className="justice-columns">
          <rect
            x="64"
            y="188"
            width="52"
            height="220"
            rx="4"
            fill={`url(#${gidMarble})`}
            stroke="var(--justice-stone)"
            strokeWidth="1.5"
          />
          {[-18, -6, 6, 18].map((dx) => (
            <line
              key={`l${dx}`}
              x1={88 + dx * 0.9}
              y1="198"
              x2={88 + dx * 0.9}
              y2="398"
              stroke="var(--justice-flute)"
              strokeWidth="1.2"
              opacity="0.5"
            />
          ))}
          <rect
            x="324"
            y="188"
            width="52"
            height="220"
            rx="4"
            fill={`url(#${gidMarble})`}
            stroke="var(--justice-stone)"
            strokeWidth="1.5"
          />
          {[-18, -6, 6, 18].map((dx) => (
            <line
              key={`r${dx}`}
              x1={348 + dx * 0.9}
              y1="198"
              x2={348 + dx * 0.9}
              y2="398"
              stroke="var(--justice-flute)"
              strokeWidth="1.2"
              opacity="0.5"
            />
          ))}
          <rect x="58" y="176" width="64" height="14" rx="3" fill="var(--justice-cap)" stroke="var(--justice-stone)" strokeWidth="1" />
          <rect x="318" y="176" width="64" height="14" rx="3" fill="var(--justice-cap)" stroke="var(--justice-stone)" strokeWidth="1" />
        </g>

        {/* Pediment */}
        <path
          d="M52 178 L220 88 L388 178 Z"
          stroke={`url(#${gidGold})`}
          strokeWidth="2.5"
          strokeLinejoin="round"
          fill="var(--justice-pediment-fill)"
          filter={`url(#${fidGlow})`}
        />
        <path
          d="M220 98 L92 172 L348 172 Z"
          stroke="var(--justice-stone)"
          strokeWidth="1"
          fill="none"
          opacity="0.35"
        />

        {/* Central seal / oracle */}
        <circle
          cx="220"
          cy="158"
          r="28"
          fill={`url(#${gidSeal})`}
          stroke={`url(#${gidGold})`}
          strokeWidth="2"
          className="justice-seal"
        />
        <circle cx="220" cy="158" r="18" stroke="var(--justice-gold-dim)" strokeWidth="0.75" fill="none" opacity="0.6" />
        <path
          d="M220 148 v20 M210 158 h20"
          stroke="var(--justice-gold-bright)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.9"
          className="justice-crosshair"
        />

        {/* Scales — single calm sway on whole group */}
        <g className="justice-scales" transform="translate(0 0)">
          <line x1="220" y1="172" x2="220" y2="248" stroke="var(--justice-stone)" strokeWidth="3" strokeLinecap="round" />
          <line
            x1="220"
            y1="200"
            x2="118"
            y2="230"
            stroke={`url(#${gidGold})`}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <line
            x1="220"
            y1="200"
            x2="322"
            y2="230"
            stroke={`url(#${gidGold})`}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Pans */}
          <path
            d="M118 230 V278 H98 L118 302 L138 278 H118 Z"
            stroke="var(--justice-gold)"
            strokeWidth="1.8"
            fill="var(--justice-pan-fill-l)"
            strokeLinejoin="round"
          />
          <path
            d="M322 230 V278 H302 L322 302 L342 278 H322 Z"
            stroke="var(--justice-gold)"
            strokeWidth="1.8"
            fill="var(--justice-pan-fill-r)"
            strokeLinejoin="round"
          />
          <circle cx="118" cy="288" r="6" fill="var(--justice-orb-l)" opacity="0.85" />
          <circle cx="322" cy="288" r="6" fill="var(--justice-orb-r)" opacity="0.85" />
        </g>

        {/* Base / steps */}
        <rect x="40" y="400" width="360" height="10" rx="2" fill="var(--justice-base)" stroke="var(--justice-stone)" strokeWidth="1" />
        <rect x="28" y="412" width="384" height="12" rx="2" fill="var(--justice-base-deep)" stroke="var(--justice-stone)" strokeWidth="1" opacity="0.9" />
      </svg>
    </div>
  );
}
