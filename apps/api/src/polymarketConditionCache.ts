import type Database from "better-sqlite3";
import { polymarketQuestionByConditionId } from "./polymarketSearch.js";

export function getPolymarketConditionTitleFromCache(db: Database.Database, conditionIdLower: string): string | null {
  const r = db.prepare(`SELECT title FROM polymarket_condition_cache WHERE condition_id = ?`).get(conditionIdLower) as
    | { title: string }
    | undefined;
  const t = r?.title?.trim();
  return t || null;
}

export function upsertPolymarketConditionCache(
  db: Database.Database,
  conditionIdLower: string,
  title: string,
  slug: string | null
): void {
  db.prepare(
    `INSERT INTO polymarket_condition_cache (condition_id, title, slug, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(condition_id) DO UPDATE SET
       title = excluded.title,
       slug = COALESCE(excluded.slug, polymarket_condition_cache.slug),
       updated_at = excluded.updated_at`
  ).run(conditionIdLower, title, slug);
}

export async function resolvePolymarketConditionTitle(
  db: Database.Database,
  conditionId: string
): Promise<string | null> {
  const id = conditionId.trim().toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(id)) return null;
  const cached = getPolymarketConditionTitleFromCache(db, id);
  if (cached) return cached;
  const hit = await polymarketQuestionByConditionId(id);
  if (!hit) return null;
  upsertPolymarketConditionCache(db, id, hit.title, hit.slug);
  return hit.title;
}
