import { useMemo, type ReactNode } from "react";
import { getAddress } from "viem";

export type SignerFace = {
  wallet: string;
  illustrativeTotalPaidUsd: number;
  illustrativePotentialWonIfOverturnedUsd: number;
};

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) + h + s.charCodeAt(i);
    h = h >>> 0;
  }
  return h >>> 0;
}

function paletteFromSeed(seed: string): { bg: string; fg: string } {
  const h = djb2(seed.toLowerCase());
  const hue = h % 360;
  const hue2 = (h >> 8) % 360;
  return {
    bg: `hsl(${hue} 42% 22%)`,
    fg: `hsl(${hue2} 55% 58%)`,
  };
}

/** GitHub-style 5×6 identicon (mirrored 3 columns → 6). */
function WalletIdenticon({ address, size = 36 }: { address: string; size?: number }) {
  const seed = address.toLowerCase();
  const { bg, fg } = useMemo(() => paletteFromSeed(seed), [seed]);
  const bits = useMemo(() => {
    const h = djb2(seed);
    const out: boolean[] = [];
    for (let i = 0; i < 15; i++) {
      out.push(((h >> i) & 1) === 1);
    }
    return out;
  }, [seed]);

  const cell = size / 6;
  const rows = 5;
  const colCount = 6;
  const rects: ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 3; c++) {
      const on = bits[r * 3 + c] ?? false;
      const mirrorC = colCount - 1 - c;
      const fill = (cc: number) => {
        rects.push(
          <rect
            key={`${r}-${cc}`}
            x={cc * cell}
            y={r * cell}
            width={cell * 0.92}
            height={cell * 0.92}
            rx={cell * 0.12}
            fill={on ? fg : bg}
            opacity={on ? 1 : 0.35}
          />
        );
      };
      fill(c);
      if (mirrorC !== c) fill(mirrorC);
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="petition-identicon"
      aria-hidden
    >
      <rect width={size} height={size} rx={size * 0.12} fill={bg} />
      <g transform={`translate(${cell * 0.04},${cell * 0.04})`}>{rects}</g>
    </svg>
  );
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function checksummedWallet(w: string): string {
  try {
    return getAddress(w as `0x${string}`);
  } catch {
    return w;
  }
}

export default function PetitionSignerSocialStrip(props: {
  signerPreview: SignerFace[];
  verifiedCount: number;
  /** Max overlapping avatars */
  maxFaces?: number;
  /** compact row (browse cards) */
  compact?: boolean;
  note?: string | null;
}) {
  const { signerPreview, verifiedCount, maxFaces = 4, compact = false, note } = props;
  const shown = signerPreview.slice(0, maxFaces);
  const avatarCount = Math.min(maxFaces, signerPreview.length, Math.max(0, verifiedCount));
  const others = Math.max(0, verifiedCount - avatarCount);

  if (verifiedCount <= 0 && shown.length === 0) {
    return null;
  }

  const showFaces = shown.length > 0;

  const size = compact ? 28 : 36;
  const overlap = compact ? -9 : -11;

  return (
    <div className={compact ? "petition-social petition-social--compact" : "petition-social"}>
      {showFaces ? (
        <div className="petition-social__faces" aria-label={`${verifiedCount} wallet-verified signatures`}>
          {shown.map((s, i) => (
            <div
              key={s.wallet}
              className="petition-social__face"
              style={{ zIndex: shown.length - i, marginLeft: i === 0 ? 0 : overlap }}
              tabIndex={0}
            >
              <WalletIdenticon address={s.wallet} size={size} />
              <div className="petition-social__tip" role="tooltip">
                <div className="petition-social__tip-wallet">{checksummedWallet(s.wallet)}</div>
                <div className="petition-social__tip-paid">
                  Total paid (illustr.): <strong>{formatUsd(s.illustrativeTotalPaidUsd)}</strong>
                </div>
                <div className="petition-social__tip-win">
                  If overturned (illustr.): <strong>{formatUsd(s.illustrativePotentialWonIfOverturnedUsd)}</strong>
                </div>
                {note ? <div className="petition-social__tip-note">{note}</div> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="petition-social__copy">
        {verifiedCount > 0 ? (
          <p className="petition-social__line">
            <strong>{verifiedCount.toLocaleString("en-US")}</strong> wallet-verified
            {others > 0 ? (
              <>
                {" "}
                · <span className="petition-social__others">+{others.toLocaleString("en-US")} others</span>
              </>
            ) : null}
          </p>
        ) : (
          <p className="petition-social__line muted">Be the first wallet signature</p>
        )}
      </div>
    </div>
  );
}
