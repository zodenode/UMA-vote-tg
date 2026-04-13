/**
 * Insurance / settlement protection hero art — layered shield, coverage arcs, tri-layer nodes.
 * Motion is CSS-only (see `.insure-*` in styles.css).
 */

import { useId } from "react";

type Variant = "hero" | "compact" | "watermark";

export function InsureThemeGraphic({
  variant = "hero",
  className = "",
}: {
  variant?: Variant;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const gShield = `ish-${uid}`;
  const gFlow = `ifl-${uid}`;
  const gGlow = `igl-${uid}`;

  const wrap =
    variant === "hero"
      ? "insure-wrap insure-wrap--hero"
      : variant === "compact"
        ? "insure-wrap insure-wrap--compact"
        : "insure-wrap insure-wrap--watermark";

  return (
    <div className={`${wrap} ${className}`.trim()} aria-hidden>
      <svg className="insure-svg" viewBox="0 0 420 400" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gShield} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--insure-cyan-bright)" />
            <stop offset="45%" stopColor="var(--insure-cyan)" />
            <stop offset="100%" stopColor="var(--insure-indigo)" />
          </linearGradient>
          <linearGradient id={gFlow} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--insure-flow-top)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--insure-flow-bot)" stopOpacity="0.2" />
          </linearGradient>
          <radialGradient id={gGlow} cx="50%" cy="40%" r="55%">
            <stop offset="0%" stopColor="var(--insure-glow-core)" stopOpacity="0.55" />
            <stop offset="70%" stopColor="var(--insure-glow-edge)" stopOpacity="0" />
          </radialGradient>
          <filter id={`isf-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient glow */}
        <ellipse cx="210" cy="200" rx="140" ry="130" fill={`url(#${gGlow})`} className="insure-ambient" />

        {/* Expanding coverage ripples (local coords: shield centroid) */}
        <g transform="translate(210 232)">
          <circle
            className="insure-ripple insure-ripple--1"
            r="36"
            fill="none"
            stroke="var(--insure-cyan)"
            strokeWidth="1.35"
            opacity="0"
          />
          <circle
            className="insure-ripple insure-ripple--2"
            r="36"
            fill="none"
            stroke="var(--insure-indigo)"
            strokeWidth="1.1"
            opacity="0"
          />
          <circle
            className="insure-ripple insure-ripple--3"
            r="36"
            fill="none"
            stroke="var(--insure-emerald)"
            strokeWidth="1"
            opacity="0"
          />
        </g>

        {/* Coverage arcs (umbrella) */}
        <path
          className="insure-arc insure-arc--a"
          d="M 70 195 Q 210 85 350 195"
          stroke="var(--insure-arc)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          opacity="0.5"
        />
        <path
          className="insure-arc insure-arc--b"
          d="M 95 210 Q 210 115 325 210"
          stroke="var(--insure-arc)"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.35"
        />

        {/* Market / oracle node above */}
        <g className="insure-market-node">
          <circle cx="210" cy="58" r="22" stroke={`url(#${gShield})`} strokeWidth="2.5" fill="var(--insure-node-fill)" />
          <path
            d="M210 48v20M200 58h20"
            stroke="var(--insure-cyan-bright)"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.85"
          />
        </g>

        {/* Flow column */}
        <rect x="206" y="82" width="8" height="48" rx="4" fill={`url(#${gFlow})`} className="insure-flow-column" />

        {/* Sentinel pings (monitoring) */}
        <g className="insure-sentinel insure-sentinel--L" transform="translate(118 168)">
          <circle r="5" fill="var(--insure-cyan)" />
        </g>
        <g className="insure-sentinel insure-sentinel--R" transform="translate(302 168)">
          <circle r="5" fill="var(--insure-indigo)" />
        </g>

        {/* Shield group */}
        <g className="insure-shield-group" filter={`url(#isf-${uid})`}>
          <path
            className="insure-shield-fill"
            d="M210 128 L 292 158 V 248 Q 292 310 210 352 Q 128 310 128 248 V 158 Z"
            fill="var(--insure-shield-bg)"
            stroke={`url(#${gShield})`}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            className="insure-shield-ring"
            d="M210 138 L 278 162 V 246 Q 278 298 210 332 Q 142 298 142 246 V 162 Z"
            fill="none"
            stroke="var(--insure-ring)"
            strokeWidth="1.2"
            strokeDasharray="6 10"
          />
          {/* Inner policy window */}
          <rect
            x="168"
            y="188"
            width="84"
            height="56"
            rx="6"
            stroke="var(--insure-cyan)"
            strokeWidth="1"
            fill="var(--insure-window-fill)"
            opacity="0.9"
          />
          <line
            x1="178"
            y1="204"
            x2="242"
            y2="204"
            stroke="var(--insure-line-dim)"
            strokeWidth="1"
            className="insure-policy-line insure-policy-line--1"
          />
          <line
            x1="178"
            y1="216"
            x2="228"
            y2="216"
            stroke="var(--insure-line-dim)"
            strokeWidth="1"
            className="insure-policy-line insure-policy-line--2"
          />
          <line
            x1="178"
            y1="228"
            x2="235"
            y2="228"
            stroke="var(--insure-line-dim)"
            strokeWidth="1"
            className="insure-policy-line insure-policy-line--3"
          />
          {/* Verified payout check — stroke draws on a loop */}
          <path
            className="insure-check-draw"
            d="M 184 216 L 196 228 L 236 196"
            fill="none"
            stroke="var(--insure-emerald)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* Tri-layer bar + nodes */}
        <g className="insure-layers">
          <rect
            x="118"
            y="318"
            width="184"
            height="6"
            rx="3"
            fill="var(--insure-line-dim)"
            opacity="0.35"
          />
          <g className="insure-layer-node insure-layer-node--1" transform="translate(155 338)">
            <circle r="10" fill="var(--insure-layer-1)" stroke="var(--insure-cyan)" strokeWidth="1.2" />
            <path d="M-4 0h8M0-4v8" stroke="var(--insure-node-cross)" strokeWidth="1" />
          </g>
          <g className="insure-layer-node insure-layer-node--2" transform="translate(210 338)">
            <circle r="10" fill="var(--insure-layer-2)" stroke="var(--insure-cyan)" strokeWidth="1.2" />
            <path d="M-5-2 L0 3 L5-4" stroke="var(--insure-node-cross)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </g>
          <g className="insure-layer-node insure-layer-node--3" transform="translate(265 338)">
            <circle r="10" fill="var(--insure-layer-3)" stroke="var(--insure-emerald)" strokeWidth="1.2" />
            <rect x="-4" y="-5" width="8" height="10" rx="1" stroke="var(--insure-node-cross)" strokeWidth="1" fill="none" />
          </g>
        </g>
      </svg>
    </div>
  );
}
