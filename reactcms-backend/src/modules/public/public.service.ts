import { pool, withTransaction, setTenantContext } from '../../lib/db/pool';
import { redis } from '../../lib/redis';
import {
  getCached, setCached, getBatchCached, setBatchCached, CachedContentItem,
} from '../../lib/contentCache';
import { NotFoundError } from '../../utils/errors';
import { sanitizeHtml } from '../../utils/sanitize';
import { logger } from '../../lib/logger';

export interface ContentResult {
  item: CachedContentItem;
  fromCache: boolean;
}

export interface BatchContentResult {
  data: Record<string, CachedContentItem>;
  missing: string[];
  cacheHits: number;
  cacheMisses: number;
}

export async function fetchPublicContent(
  websiteId: string, cmsKey: string, preview = false,
): Promise<ContentResult> {
  if (!preview) {
    const cached = await getCached(websiteId, cmsKey);
    if (cached) return { item: cached, fromCache: true };
  }

  const publishedFilter = preview ? '' : 'AND is_published = true';
  const { rows } = await pool.query<any>(
    `SELECT cms_key, content_type, value, metadata, version
     FROM content_items
     WHERE website_id = $1 AND cms_key = $2 ${publishedFilter}`,
    [websiteId, cmsKey],
  );
  const row = rows[0];
  if (!row) throw new NotFoundError(`Content key "${cmsKey}"`);

  const item: CachedContentItem = { ...row, cached_at: Date.now() };
  if (!preview) await setCached(websiteId, item);
  return { item, fromCache: false };
}

export async function fetchBatchPublicContent(
  websiteId: string, cmsKeys: string[], preview = false,
): Promise<BatchContentResult> {
  let hits: Record<string, CachedContentItem> = {};
  let misses = cmsKeys;
  let cacheHits = 0;
  let cacheMisses = cmsKeys.length;

  if (!preview) {
    const cacheResult = await getBatchCached(websiteId, cmsKeys);
    hits = cacheResult.hits;
    misses = cacheResult.misses;
    cacheHits = Object.keys(hits).length;
    cacheMisses = misses.length;
  }

  if (misses.length === 0) {
    return { data: hits, missing: cmsKeys.filter((k) => !hits[k]), cacheHits, cacheMisses: 0 };
  }

  const publishedFilter = preview ? '' : 'AND is_published = true';
  const { rows } = await pool.query<any>(
    `SELECT cms_key, content_type, value, metadata, version
     FROM content_items
     WHERE website_id = $1 AND cms_key = ANY($2::text[]) ${publishedFilter}`,
    [websiteId, misses],
  );

  const dbItems: CachedContentItem[] = rows.map((r: any) => ({ ...r, cached_at: Date.now() }));
  for (const item of dbItems) hits[item.cms_key] = item;
  if (!preview && dbItems.length > 0) await setBatchCached(websiteId, dbItems);

  const missing = cmsKeys.filter((k) => !hits[k]);
  return { data: hits, missing, cacheHits, cacheMisses };
}

export interface DiscoverItem {
  key: string;
  value: string;
  content_type: 'text' | 'richtext';
}

export async function registerDiscoveredContent(
  websiteId: string,
  items: DiscoverItem[],
): Promise<{ created: string[]; existing: string[] }> {
  const keys = items.map((i) => i.key);

  return withTransaction(async (client) => {
    await setTenantContext(client, websiteId);

    // Find which keys already exist
    const { rows: existingRows } = await client.query<{ cms_key: string }>(
      `SELECT cms_key FROM content_items WHERE website_id = $1 AND cms_key = ANY($2::text[])`,
      [websiteId, keys],
    );
    const existingKeys = new Set(existingRows.map((r) => r.cms_key));

    const created: string[] = [];
    const existing: string[] = Array.from(existingKeys);

    for (const item of items) {
      if (existingKeys.has(item.key)) continue;

      let value = item.value;
      if (item.content_type === 'richtext' && value) {
        value = sanitizeHtml(value);
      }

      await client.query(
        `INSERT INTO content_items (website_id, cms_key, content_type, value, metadata, is_published)
         VALUES ($1, $2, $3, $4, $5, false)
         ON CONFLICT (website_id, cms_key) DO NOTHING`,
        [websiteId, item.key, item.content_type, value, {}],
      );
      created.push(item.key);
    }

    return { created, existing };
  });
}

// SECURITY FIX: website-active status cached in Redis (shared, bounded TTL, invalidatable)
const WEBSITE_STATUS_TTL = 30; // seconds

export async function assertWebsiteExists(websiteId: string): Promise<void> {
  const cacheKey = `ws:active:${websiteId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached === 'false') throw new NotFoundError('Website');
    if (cached === 'true') return;
  } catch (err: any) {
    if (err.code === 'NOT_FOUND' || err.statusCode === 404) throw err;
    // Redis error — fall through to DB
    logger.warn('Redis unavailable for website check, hitting DB', { error: err.message });
  }

  const { rows } = await pool.query(
    'SELECT id FROM websites WHERE id = $1 AND is_active = true',
    [websiteId],
  );
  const exists = rows.length > 0;
  try {
    await redis.set(cacheKey, exists ? 'true' : 'false', { EX: WEBSITE_STATUS_TTL });
  } catch { /* non-fatal */ }

  if (!exists) throw new NotFoundError('Website');
}
