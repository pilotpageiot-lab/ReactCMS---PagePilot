/**
 * Content cache — Redis-backed, keyed by (websiteId, cmsKey).
 *
 * Key schema:   content:{websiteId}:{cmsKey}
 * Invalidation: content:{websiteId}:*  (scan + delete on publish)
 *
 * TTL strategy:
 *   - Fresh hit:    served from Redis, no DB query
 *   - Stale/miss:   DB query, result written to Redis with TTL
 *   - On publish:   invalidate single key immediately
 *   - Background:   TTL of 5 min ensures eventual consistency even if
 *                   invalidation is missed (e.g. Redis restart)
 */
import { redis } from './redis';
import { logger } from './logger';

const CONTENT_TTL_SECONDS = 3600; // 1 hour (invalidated on publish)
const KEY_PREFIX = 'content';

export interface CachedContentItem {
  cms_key: string;
  content_type: string;
  value: string | null;
  metadata: Record<string, unknown>;
  version: number;
  cached_at: number; // unix ms — lets clients reason about freshness
}

// ── Key helpers ──────────────────────────────────────────────────────────────

function cacheKey(websiteId: string, cmsKey: string): string {
  return `${KEY_PREFIX}:${websiteId}:${cmsKey}`;
}

function batchCacheKey(websiteId: string, cmsKey: string): string {
  return cacheKey(websiteId, cmsKey);
}

// ── Single item ──────────────────────────────────────────────────────────────

export async function getCached(
  websiteId: string,
  cmsKey: string,
): Promise<CachedContentItem | null> {
  try {
    const raw = await redis.get(cacheKey(websiteId, cmsKey));
    if (!raw) return null;
    return JSON.parse(raw) as CachedContentItem;
  } catch (err) {
    // Cache read failure must never block a request — fall through to DB
    logger.warn('Cache read failed, falling through to DB', {
      websiteId,
      cmsKey,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function setCached(
  websiteId: string,
  item: CachedContentItem,
): Promise<void> {
  try {
    const key = cacheKey(websiteId, item.cms_key);
    await redis.set(key, JSON.stringify(item), { EX: CONTENT_TTL_SECONDS });
  } catch (err) {
    // Cache write failure is non-fatal
    logger.warn('Cache write failed', {
      websiteId,
      cmsKey: item.cms_key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Invalidate a single content key — call this after publish or update */
export async function invalidateKey(
  websiteId: string,
  cmsKey: string,
): Promise<void> {
  try {
    await redis.del(cacheKey(websiteId, cmsKey));
    logger.debug('Cache invalidated', { websiteId, cmsKey });
  } catch (err) {
    logger.warn('Cache invalidation failed', {
      websiteId,
      cmsKey,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Invalidate all content keys for a website — call on website deletion */
export async function invalidateWebsite(websiteId: string): Promise<void> {
  try {
    // SCAN is non-blocking; KEYS would block on large keyspaces
    const pattern = `${KEY_PREFIX}:${websiteId}:*`;
    let cursor = 0;
    let deleted = 0;
    do {
      const reply = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor;
      if (reply.keys.length > 0) {
        await redis.del(reply.keys);
        deleted += reply.keys.length;
      }
    } while (cursor !== 0);

    logger.info('Website cache invalidated', { websiteId, deleted });
  } catch (err) {
    logger.warn('Website cache invalidation failed', {
      websiteId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Batch ────────────────────────────────────────────────────────────────────

export interface BatchCacheResult {
  hits: Record<string, CachedContentItem>;
  misses: string[];
}

export async function getBatchCached(
  websiteId: string,
  cmsKeys: string[],
): Promise<BatchCacheResult> {
  if (cmsKeys.length === 0) return { hits: {}, misses: [] };

  try {
    const redisKeys = cmsKeys.map((k) => batchCacheKey(websiteId, k));
    const raws = await redis.mGet(redisKeys);

    const hits: Record<string, CachedContentItem> = {};
    const misses: string[] = [];

    for (let i = 0; i < cmsKeys.length; i++) {
      const raw = raws[i];
      const key = cmsKeys[i]!;
      if (raw) {
        hits[key] = JSON.parse(raw) as CachedContentItem;
      } else {
        misses.push(key);
      }
    }

    return { hits, misses };
  } catch (err) {
    logger.warn('Batch cache read failed, falling through to DB', {
      websiteId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { hits: {}, misses: cmsKeys };
  }
}

export async function setBatchCached(
  websiteId: string,
  items: CachedContentItem[],
): Promise<void> {
  if (items.length === 0) return;

  try {
    // Use a pipeline so all SETs go in one round-trip
    const pipeline = redis.multi();
    for (const item of items) {
      pipeline.set(
        cacheKey(websiteId, item.cms_key),
        JSON.stringify(item),
        { EX: CONTENT_TTL_SECONDS },
      );
    }
    await pipeline.exec();
  } catch (err) {
    logger.warn('Batch cache write failed', {
      websiteId,
      count: items.length,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Cache stats (for /public/cache/stats admin endpoint) ────────────────────

export interface CacheStats {
  key_count: number;
  sample_keys: string[];
}

export async function getCacheStats(websiteId: string): Promise<CacheStats> {
  const pattern = `${KEY_PREFIX}:${websiteId}:*`;
  const sampleKeys: string[] = [];
  let key_count = 0;
  let cursor = 0;

  do {
    const reply = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
    cursor = reply.cursor;
    key_count += reply.keys.length;
    if (sampleKeys.length < 10) {
      sampleKeys.push(
        ...reply.keys.slice(0, 10 - sampleKeys.length).map((k) =>
          k.replace(`${KEY_PREFIX}:${websiteId}:`, ''),
        ),
      );
    }
  } while (cursor !== 0);

  return { key_count, sample_keys: sampleKeys };
}
