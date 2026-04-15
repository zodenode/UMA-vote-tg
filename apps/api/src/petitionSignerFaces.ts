import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { getAddress } from "viem";

export type SignerFaceRow = {
  wallet: string;
  /** Total amount paid into the position (illustrative display seed). */
  illustrativeTotalPaidUsd: number;
  /** Hypothetical recovery if the disputed outcome were overturned (illustrative). */
  illustrativePotentialWonIfOverturnedUsd: number;
};

const PREVIEW_NOTE =
  "Illustrative dollar amounts for social context only — not on-chain fills, not Polymarket account snapshots, and not legal or tax advice.";

export function signerPreviewDisclaimer(): string {
  return PREVIEW_NOTE;
}

/** Stable pseudo “total paid” (shown as amount lost / red) — not real trading data. */
export function illustrativeTotalPaidUsd(
  walletLower: string,
  petitionId: string,
  conditionId: string | null
): number {
  const h = createHash("sha256")
    .update(`total-paid|${walletLower}|${petitionId}|${conditionId ?? ""}`)
    .digest();
  const v = h.readUInt32BE(0) % 220_000;
  return 1_800 + v;
}

/** Stable pseudo upside if the market were overturned in the signer’s favor (green) — not real data. */
export function illustrativePotentialWonIfOverturnedUsd(
  walletLower: string,
  petitionId: string,
  conditionId: string | null
): number {
  const paid = illustrativeTotalPaidUsd(walletLower, petitionId, conditionId);
  const h = createHash("sha256")
    .update(`overturn-upside|${walletLower}|${petitionId}|${conditionId ?? ""}`)
    .digest();
  const mult = 1.2 + (h.readUInt32BE(4) % 450) / 100;
  return Math.min(Math.round(paid * mult), 2_500_000);
}

/**
 * Unique verified wallets per petition, most recently active first.
 */
export type PetitionSignerTableRow = {
  signedAt: string;
  /** Checksummed address when wallet-verified; otherwise null (e.g. legacy Telegram-only row). */
  wallet: string | null;
  walletVerified: boolean;
  /** Total paid into the position (displayed as amount lost; illustrative). */
  illustrativeTotalPaidUsd: number | null;
  /** Hypothetical win if outcome overturned in their favor (illustrative). */
  illustrativePotentialWonIfOverturnedUsd: number | null;
  /** Reserved for future email verification; always false until stored. */
  emailVerified: boolean;
};

export function loadPetitionSignerTableRows(
  db: Database.Database,
  petitionId: string,
  conditionId: string | null
): PetitionSignerTableRow[] {
  const rows = db
    .prepare(
      `SELECT signed_at, wallet_address, wallet_signature
       FROM petition_signatures
       WHERE petition_id = ?
       ORDER BY datetime(signed_at) DESC`
    )
    .all(petitionId) as {
    signed_at: string;
    wallet_address: string | null;
    wallet_signature: string | null;
  }[];

  return rows.map((r) => {
    const w = (r.wallet_address ?? "").trim();
    const sig = (r.wallet_signature ?? "").trim();
    const looksAddr = /^0x[a-fA-F0-9]{40}$/.test(w);
    const verified = Boolean(w && sig && looksAddr);
    let wallet: string | null = null;
    if (verified) {
      try {
        wallet = getAddress(w as `0x${string}`);
      } catch {
        wallet = w.toLowerCase();
      }
    }
    const wl = w.toLowerCase();
    return {
      signedAt: r.signed_at,
      wallet,
      walletVerified: verified,
      illustrativeTotalPaidUsd:
        verified && looksAddr ? illustrativeTotalPaidUsd(wl, petitionId, conditionId) : null,
      illustrativePotentialWonIfOverturnedUsd:
        verified && looksAddr ? illustrativePotentialWonIfOverturnedUsd(wl, petitionId, conditionId) : null,
      emailVerified: false,
    };
  });
}

export function loadSignerFaceRows(
  db: Database.Database,
  petitionId: string,
  limit: number,
  conditionId: string | null
): SignerFaceRow[] {
  const rows = db
    .prepare(
      `SELECT lower(trim(wallet_address)) as w
       FROM petition_signatures
       WHERE petition_id = ?
         AND wallet_address IS NOT NULL AND trim(wallet_address) != ''
         AND wallet_signature IS NOT NULL AND trim(wallet_signature) != ''
       GROUP BY lower(trim(wallet_address))
       ORDER BY max(datetime(signed_at)) DESC
       LIMIT ?`
    )
    .all(petitionId, limit) as { w: string }[];
  const out: SignerFaceRow[] = [];
  for (const r of rows) {
    if (!r.w || !/^0x[a-f0-9]{40}$/.test(r.w)) continue;
    out.push({
      wallet: r.w,
      illustrativeTotalPaidUsd: illustrativeTotalPaidUsd(r.w, petitionId, conditionId),
      illustrativePotentialWonIfOverturnedUsd: illustrativePotentialWonIfOverturnedUsd(r.w, petitionId, conditionId),
    });
  }
  return out;
}

/**
 * Up to `limitPer` verified faces per petition for browse cards (single round-trip).
 */
export function batchLoadSignerFaceRows(
  db: Database.Database,
  petitionIds: string[],
  limitPer: number,
  conditionByPetition: Map<string, string | null>
): Map<string, SignerFaceRow[]> {
  const map = new Map<string, SignerFaceRow[]>();
  if (!petitionIds.length) return map;
  const placeholders = petitionIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `WITH agg AS (
         SELECT petition_id,
                lower(trim(wallet_address)) as w,
                max(datetime(signed_at)) as last_ts
         FROM petition_signatures
         WHERE petition_id IN (${placeholders})
           AND wallet_address IS NOT NULL AND trim(wallet_address) != ''
           AND wallet_signature IS NOT NULL AND trim(wallet_signature) != ''
         GROUP BY petition_id, lower(trim(wallet_address))
       ),
       ranked AS (
         SELECT petition_id, w,
                ROW_NUMBER() OVER (PARTITION BY petition_id ORDER BY last_ts DESC) as rn
         FROM agg
       )
       SELECT petition_id, w as wallet FROM ranked WHERE rn <= ?`
    )
    .all(...petitionIds, limitPer) as { petition_id: string; wallet: string }[];

  for (const r of rows) {
    if (!r.wallet || !/^0x[a-f0-9]{40}$/.test(r.wallet)) continue;
    const cid = conditionByPetition.get(r.petition_id) ?? null;
    const face: SignerFaceRow = {
      wallet: r.wallet,
      illustrativeTotalPaidUsd: illustrativeTotalPaidUsd(r.wallet, r.petition_id, cid),
      illustrativePotentialWonIfOverturnedUsd: illustrativePotentialWonIfOverturnedUsd(
        r.wallet,
        r.petition_id,
        cid
      ),
    };
    const list = map.get(r.petition_id) ?? [];
    list.push(face);
    map.set(r.petition_id, list);
  }
  return map;
}

/**
 * Sum illustrative “potential won if overturned” across unique verified wallets per petition
 * (same seed math as signer previews — for browse ordering and coalition-style totals only).
 */
export function sumIllustrativePotentialWonByPetition(
  db: Database.Database,
  petitionIds: string[],
  conditionByPetition: Map<string, string | null>
): Map<string, number> {
  const sums = new Map<string, number>();
  if (!petitionIds.length) return sums;
  const ph = petitionIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT petition_id, lower(trim(wallet_address)) as w
       FROM petition_signatures
       WHERE petition_id IN (${ph})
         AND wallet_address IS NOT NULL AND trim(wallet_address) != ''
         AND wallet_signature IS NOT NULL AND trim(wallet_signature) != ''
       GROUP BY petition_id, lower(trim(wallet_address))`
    )
    .all(...petitionIds) as { petition_id: string; w: string }[];

  for (const r of rows) {
    if (!r.w || !/^0x[a-f0-9]{40}$/.test(r.w)) continue;
    const cid = conditionByPetition.get(r.petition_id) ?? null;
    const v = illustrativePotentialWonIfOverturnedUsd(r.w, r.petition_id, cid);
    sums.set(r.petition_id, (sums.get(r.petition_id) ?? 0) + v);
  }
  return sums;
}
