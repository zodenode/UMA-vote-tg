import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export type UserRow = {
  telegram_id: string;
  ref_code: string;
  referred_by: string | null;
  alerts_on: number;
  created_at: string;
};

export function openDb(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(filePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id TEXT PRIMARY KEY,
      ref_code TEXT UNIQUE NOT NULL,
      referred_by TEXT,
      alerts_on INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_ref ON users(ref_code);

    CREATE TABLE IF NOT EXISTS group_stats (
      chat_id TEXT PRIMARY KEY,
      title TEXT,
      alerts_members INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alert_digest (
      telegram_id TEXT PRIMARY KEY,
      last_sent_at TEXT
    );
  `);
  return db;
}

export function randomRefCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function getOrCreateUser(
  db: Database.Database,
  telegramId: string,
  referredByCode: string | null
): UserRow {
  const existing = db
    .prepare(`SELECT * FROM users WHERE telegram_id = ?`)
    .get(telegramId) as UserRow | undefined;
  if (existing) {
    if (referredByCode && !existing.referred_by) {
      const ref = db
        .prepare(`SELECT telegram_id FROM users WHERE ref_code = ?`)
        .get(referredByCode) as { telegram_id: string } | undefined;
      if (ref && ref.telegram_id !== telegramId) {
        db.prepare(`UPDATE users SET referred_by = ? WHERE telegram_id = ?`).run(
          referredByCode,
          telegramId
        );
        return db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).get(telegramId) as UserRow;
      }
    }
    return existing;
  }
  let code = randomRefCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      db.prepare(
        `INSERT INTO users (telegram_id, ref_code, referred_by, alerts_on) VALUES (?, ?, ?, 0)`
      ).run(telegramId, code, referredByCode ?? null);
      break;
    } catch {
      code = randomRefCode();
    }
  }
  return db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).get(telegramId) as UserRow;
}
