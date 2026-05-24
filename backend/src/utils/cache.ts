/**
 * cache.ts — Redis cache-aside helpers for 5 000-user scale
 *
 * Pattern: withCache(key, ttlSeconds, () => dbQuery())
 *   1. Check Redis — hit → return parsed JSON
 *   2. Miss → run loader, store result, return result
 *
 * On any Redis error the helper falls back silently to the DB
 * so the app never crashes because of a Redis outage.
 */

import { redis } from '../config/redis';
import { logger } from './logger';

// ── Core cache-aside helper ─────────────────────────────────────
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
  } catch (e: any) {
    // Redis unavailable — log once and fall through to DB
    logger.warn(`Cache GET failed (key=${key}): ${e.message}`);
  }

  const result = await loader();

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(result));
  } catch (e: any) {
    logger.warn(`Cache SET failed (key=${key}): ${e.message}`);
  }

  return result;
}

// ── Invalidate exact keys ───────────────────────────────────────
export async function invalidateKeys(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (e: any) {
    logger.warn(`Cache DEL failed (${keys.join(',')}): ${e.message}`);
  }
}

// ── Invalidate by glob pattern (e.g. "tasks:*") ─────────────────
// Uses SCAN so it never blocks the Redis event loop.
export async function invalidateByPattern(pattern: string): Promise<void> {
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch (e: any) {
    logger.warn(`Cache pattern invalidation failed (${pattern}): ${e.message}`);
  }
}

// ── Common TTL constants (seconds) ─────────────────────────────
export const TTL = {
  SHORT:   30,    // task lists — invalidated on mutations
  MEDIUM:  120,   // dashboard KPIs
  LONG:    300,   // team KPIs, user lists
  XLONG:   600,   // static data: roles, departments, teams
} as const;
