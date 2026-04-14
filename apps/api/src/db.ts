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
  db.pragma("foreign_keys = ON");
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

    CREATE TABLE IF NOT EXISTS group_broadcasts (
      chat_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_group_broadcasts_enabled ON group_broadcasts(enabled);

    CREATE TABLE IF NOT EXISTS alert_digest (
      telegram_id TEXT PRIMARY KEY,
      last_sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS oo_poll_cursor (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_block INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO oo_poll_cursor (id, last_block) VALUES (1, 0);

    CREATE TABLE IF NOT EXISTS oo_chain_cursor (
      chain_id TEXT PRIMARY KEY,
      last_block INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS disputed_queries (
      dispute_key TEXT PRIMARY KEY,
      chain_id TEXT NOT NULL DEFAULT '1',
      requester TEXT NOT NULL,
      proposer TEXT NOT NULL,
      disputer TEXT NOT NULL,
      identifier TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      ancillary_data TEXT NOT NULL,
      proposed_price TEXT NOT NULL,
      tx_hash TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      log_index INTEGER NOT NULL,
      detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      bond_wei TEXT,
      total_stake_wei TEXT,
      source_label TEXT,
      topic_tags TEXT
    );

    CREATE TABLE IF NOT EXISTS dispute_alert_sent (
      dispute_key TEXT PRIMARY KEY,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_vaults (
      telegram_id TEXT PRIMARY KEY REFERENCES users(telegram_id) ON DELETE CASCADE,
      address TEXT NOT NULL,
      enc_private_key BLOB NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      key_version INTEGER NOT NULL DEFAULT 1,
      exported_once INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vault_vote_commits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      dispute_key TEXT,
      identifier TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      ancillary_data TEXT NOT NULL,
      round_id TEXT NOT NULL,
      price TEXT NOT NULL,
      salt TEXT NOT NULL,
      commit_tx_hash TEXT NOT NULL,
      revealed INTEGER NOT NULL DEFAULT 0,
      reveal_tx_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_vote_commit_unique
      ON vault_vote_commits(telegram_id, identifier, timestamp, ancillary_data, round_id);

    CREATE TABLE IF NOT EXISTS vote_wizard_sessions (
      telegram_id TEXT PRIMARY KEY REFERENCES users(telegram_id) ON DELETE CASCADE,
      state TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS petitions (
      id TEXT PRIMARY KEY,
      creator_telegram_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      image_url TEXT,
      dispute_key TEXT,
      condition_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_petitions_creator ON petitions(creator_telegram_id);
    CREATE INDEX IF NOT EXISTS idx_petitions_created ON petitions(created_at);

    CREATE TABLE IF NOT EXISTS petition_signatures (
      petition_id TEXT NOT NULL REFERENCES petitions(id) ON DELETE CASCADE,
      signer_telegram_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      comment TEXT,
      signed_at TEXT NOT NULL DEFAULT (datetime('now')),
      wallet_address TEXT,
      wallet_message TEXT,
      wallet_signature TEXT,
      PRIMARY KEY (petition_id, signer_telegram_id)
    );
    CREATE INDEX IF NOT EXISTS idx_petition_signatures_petition ON petition_signatures(petition_id);

    CREATE TABLE IF NOT EXISTS petition_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      petition_id TEXT NOT NULL REFERENCES petitions(id) ON DELETE CASCADE,
      reporter_telegram_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_petition_reports_unique ON petition_reports(petition_id, reporter_telegram_id);
    CREATE INDEX IF NOT EXISTS idx_petition_reports_petition ON petition_reports(petition_id);

    CREATE TABLE IF NOT EXISTS user_linked_wallets (
      telegram_id TEXT PRIMARY KEY REFERENCES users(telegram_id) ON DELETE CASCADE,
      address TEXT NOT NULL,
      linked_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_linked_wallets_address ON user_linked_wallets(address);
  `);
  migrateOoMultiChain(db);
  migratePetitionsSchema(db);
  return db;
}

function migratePetitionsSchema(db: Database.Database) {
  const pcols = db.prepare(`PRAGMA table_info(petitions)`).all() as { name: string }[];
  if (!pcols.some((c) => c.name === "image_url")) {
    db.exec(`ALTER TABLE petitions ADD COLUMN image_url TEXT`);
  }
  if (!pcols.some((c) => c.name === "dispute_key")) {
    db.exec(`ALTER TABLE petitions ADD COLUMN dispute_key TEXT`);
  }
  if (!pcols.some((c) => c.name === "condition_id")) {
    db.exec(`ALTER TABLE petitions ADD COLUMN condition_id TEXT`);
  }
  const scols = db.prepare(`PRAGMA table_info(petition_signatures)`).all() as { name: string }[];
  if (!scols.some((c) => c.name === "wallet_address")) {
    db.exec(`ALTER TABLE petition_signatures ADD COLUMN wallet_address TEXT`);
  }
  if (!scols.some((c) => c.name === "wallet_message")) {
    db.exec(`ALTER TABLE petition_signatures ADD COLUMN wallet_message TEXT`);
  }
  if (!scols.some((c) => c.name === "wallet_signature")) {
    db.exec(`ALTER TABLE petition_signatures ADD COLUMN wallet_signature TEXT`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_linked_wallets (
      telegram_id TEXT PRIMARY KEY REFERENCES users(telegram_id) ON DELETE CASCADE,
      address TEXT NOT NULL,
      linked_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_linked_wallets_address ON user_linked_wallets(address)`);
}

/** Legacy DBs: per-chain OO cursor + disputed_queries.chain_id + stable cross-chain dispute_key. */
function migrateOoMultiChain(db: Database.Database) {
  const cols = db.prepare(`PRAGMA table_info(disputed_queries)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === "chain_id")) {
    db.exec(`ALTER TABLE disputed_queries ADD COLUMN chain_id TEXT NOT NULL DEFAULT '1'`);
  }
  db.prepare(
    `UPDATE disputed_queries SET dispute_key = '1:' || dispute_key
     WHERE dispute_key NOT LIKE '1:%' AND dispute_key NOT LIKE '137:%'`
  ).run();
  db.prepare(
    `UPDATE dispute_alert_sent SET dispute_key = '1:' || dispute_key
     WHERE dispute_key NOT LIKE '1:%' AND dispute_key NOT LIKE '137:%'`
  ).run();

  const n = (db.prepare(`SELECT COUNT(*) as c FROM oo_chain_cursor`).get() as { c: number }).c;
  if (n === 0) {
    const old = db
      .prepare(`SELECT last_block FROM oo_poll_cursor WHERE id=1`)
      .get() as { last_block: number } | undefined;
    db.prepare(`INSERT INTO oo_chain_cursor (chain_id, last_block) VALUES ('1', ?)`).run(
      old?.last_block ?? 0
    );
  }
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
