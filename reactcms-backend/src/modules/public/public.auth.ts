import { Request, Response, NextFunction } from 'express';
import { pool } from '../../lib/db/pool';
import { redis } from '../../lib/redis';
import { sha256 } from '../../utils/hash';
import { UnauthorizedError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { logger } from '../../lib/logger';

interface ApiKeyRow {
  id: string; website_id: string; scope: 'read' | 'write';
  expires_at: string | null; label: string;
}

const KEY_CACHE_PREFIX = 'apikey:';
const KEY_CACHE_TTL = 300; // 5 minutes

function extractRawKey(req: Request): string | null {
  const header = req.headers['x-cms-key'];
  if (typeof header === 'string' && header.length > 0) return header;

  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer cms_')) return auth.slice(7);

  if (req.query['api_key']) {
    throw new BadRequestError(
      'API key must be supplied via X-CMS-Key header, not ?api_key= query parameter. ' +
      'Query parameters are logged by proxies and appear in browser history.',
    );
  }

  return null;
}

export async function validatePublicApiKey(
  req: Request, _res: Response, next: NextFunction,
): Promise<void> {
  try {
    const raw = extractRawKey(req);
    if (!raw) {
      throw new UnauthorizedError(
        'API key required. Supply via X-CMS-Key header or Authorization: Bearer <key>',
      );
    }

    const hash = sha256(raw);
    let keyRow: ApiKeyRow | null = null;

    // Check Redis cache first
    try {
      const cached = await redis.get(KEY_CACHE_PREFIX + hash);
      if (cached) keyRow = JSON.parse(cached);
    } catch { /* Redis miss — fall through to DB */ }

    // DB fallback
    if (!keyRow) {
      const { rows } = await pool.query<ApiKeyRow>(
        `SELECT id, website_id, scope, expires_at, label FROM api_keys WHERE key_hash = $1`,
        [hash],
      );
      keyRow = rows[0] ?? null;
      if (keyRow) {
        redis.set(KEY_CACHE_PREFIX + hash, JSON.stringify(keyRow), { EX: KEY_CACHE_TTL }).catch(() => {});
      }
    }

    if (!keyRow) throw new UnauthorizedError('Invalid API key');

    if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
      throw new UnauthorizedError('API key has expired');
    }

    const requestedWebsiteId = req.query['website_id'] as string | undefined;
    if (requestedWebsiteId && keyRow.website_id !== requestedWebsiteId) {
      logger.warn('API key / website_id mismatch', {
        keyId: keyRow.id, keyWebsite: keyRow.website_id,
        requestedWebsite: requestedWebsiteId, ip: req.ip,
      });
      throw new UnauthorizedError('Invalid API key');
    }

    if (req.query['preview'] === 'true' && keyRow.scope !== 'write') {
      throw new ForbiddenError('Preview mode requires a write-scoped API key (cms_sk_...)');
    }

    pool.query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [keyRow.id])
      .catch((err) => logger.warn('Failed to update last_used_at', { error: err.message }));

    req.apiKey = { id: keyRow.id, websiteId: keyRow.website_id, scope: keyRow.scope };
    next();
  } catch (err) {
    next(err);
  }
}
