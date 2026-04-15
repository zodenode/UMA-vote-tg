import type Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { getAddress, isAddress } from "viem";

const WEB_PREFIX = "web:" as const;

/** Stable synthetic user id for wallet-only petition flows (never overlaps numeric Telegram ids). */
export function webUserIdFromAddress(raw: string): string | null {
  const s = raw.trim();
  if (!isAddress(s)) return null;
  try {
    return `${WEB_PREFIX}${getAddress(s)}`;
  } catch {
    return null;
  }
}

export function parseWebUserAddress(userId: string): `0x${string}` | null {
  if (!userId.startsWith(WEB_PREFIX)) return null;
  const rest = userId.slice(WEB_PREFIX.length).trim();
  if (!isAddress(rest)) return null;
  try {
    return getAddress(rest) as `0x${string}`;
  } catch {
    return null;
  }
}

export function isWebUserId(userId: string): boolean {
  return Boolean(parseWebUserAddress(userId));
}

const TOKEN_PREFIX = "wps_";

export function newWebPetitionSessionToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
}

export function buildWebPetitionSignInMessage(issuedAt: string): string {
  return [
    "uma.vote — web petition sign-in",
    `Issued (UTC): ${issuedAt}`,
    "",
    "Signing does not cost gas. This proves you control the wallet so the site can create petitions from the browser.",
  ].join("\n");
}

export function webSignInMessageValid(message: string, issuedAt: string): boolean {
  return message.trim() === buildWebPetitionSignInMessage(issuedAt).trim();
}

export function purgeExpiredWebPetitionSessions(db: Database.Database): void {
  db.prepare(`DELETE FROM web_petition_sessions WHERE datetime(expires_at) < datetime('now')`).run();
}

export function insertWebPetitionSession(
  db: Database.Database,
  token: string,
  walletAddress: string,
  ttlDays: number
): void {
  purgeExpiredWebPetitionSessions(db);
  db.prepare(
    `INSERT INTO web_petition_sessions (token, wallet_address, expires_at)
     VALUES (?, ?, datetime('now', ?))`
  ).run(token, walletAddress.toLowerCase(), `+${ttlDays} days`);
}

export function loadWebPetitionSession(
  db: Database.Database,
  token: string
): { wallet_address: string } | undefined {
  purgeExpiredWebPetitionSessions(db);
  const row = db
    .prepare(
      `SELECT wallet_address FROM web_petition_sessions
       WHERE token = ? AND datetime(expires_at) >= datetime('now')`
    )
    .get(token) as { wallet_address: string } | undefined;
  return row;
}

export function deleteWebPetitionSession(db: Database.Database, token: string): void {
  db.prepare(`DELETE FROM web_petition_sessions WHERE token = ?`).run(token);
}
