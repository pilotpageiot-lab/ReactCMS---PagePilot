/**
 * Public content API — /public/*
 *
 * All routes:
 *   GET  /public/content          fetch single content item
 *   GET  /public/content/batch    fetch up to 50 items in one shot
 *   POST /public/content/batch    same, but keys in JSON body (avoids URL length limits)
 *   GET  /public/health           liveness probe (no auth)
 *   GET  /public/cache/stats      cache key count for a website (admin: JWT required)
 *   POST /public/cache/invalidate invalidate one key or entire website (admin: JWT required)
 *
 * Security layers (in order):
 *   1. CORS preflight — allow configured origins + wildcard for SDK embeds
 *   2. validatePublicApiKey — hash-based lookup, website_id cross-check
 *   3. Tiered rate limiting — per-key (single/batch) + per-IP + per-website circuit breaker
 *   4. Zod schema validation on query params
 *   5. Cache-aside content fetch (Redis → Postgres)
 *   6. ETag / If-None-Match — 304 when content unchanged
 *   7. Cache-Control headers — CDN and browser caching
 */
import { Router, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { z } from 'zod';
import { pool } from '../../lib/db/pool';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { validatePublicApiKey } from './public.auth';
import {
  singleKeyRateLimit,
  batchKeyRateLimit,
  ipFallbackRateLimit,
  websiteCircuitBreaker,
} from './public.rateLimit';
import {
  singleContentQuerySchema,
  batchContentQuerySchema,
} from './public.schema';
import {
  fetchPublicContent,
  fetchBatchPublicContent,
  assertWebsiteExists,
  registerDiscoveredContent,
} from './public.service';
import {
  invalidateKey,
  invalidateWebsite,
  getCacheStats,
} from '../../lib/contentCache';
import { ok, noContent } from '../../utils/response';
import { ForbiddenError, BadRequestError } from '../../utils/errors';

const router = Router();

// ── CORS ─────────────────────────────────────────────────────────────────────
// The public API must be accessible from any domain (client websites embedding
// the SDK). The management API has strict same-origin CORS; the public API
// allows all origins but still requires the API key for data access.
router.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CMS-Key', 'Authorization', 'If-None-Match'],
    exposedHeaders: [
      'ETag',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Cache',
      'X-Cache-Age',
    ],
    maxAge: 86400, // preflight cached 24h
  }),
);

// ── Health (no auth) ──────────────────────────────────────────────────────────
router.get('/health', (_req: Request, res: Response) => {
  ok(res, { status: 'ok', service: 'public-content-api' });
});

// ── Auth + rate limiting applied to all content routes ────────────────────────
// Note: ipFallbackRateLimit skips when req.apiKey is set, so it only fires
// for unauthenticated probes. websiteCircuitBreaker fires after auth.
router.use(
  '/content',
  ipFallbackRateLimit,
  validatePublicApiKey,
  websiteCircuitBreaker,
);

// ── Helper: build ETag from version number ────────────────────────────────────
function makeEtag(version: number): string {
  return `"v${version}"`;
}

// ── Helper: apply HTTP cache headers ─────────────────────────────────────────
function setCacheHeaders(
  res: Response,
  etag: string,
  fromCache: boolean,
  cachedAt?: number,
): void {
  // s-maxage: CDN caches for 60s, serves stale for up to 5min while revalidating
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('Vary', 'X-CMS-Key, Accept-Encoding');
  res.setHeader('ETag', etag);
  res.setHeader('X-Cache', fromCache ? 'HIT' : 'MISS');
  if (fromCache && cachedAt) {
    const ageSeconds = Math.floor((Date.now() - cachedAt) / 1000);
    res.setHeader('X-Cache-Age', String(ageSeconds));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /public/content?website_id=xxx&key=hero_title
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/content',
  singleKeyRateLimit,
  validate({ query: singleContentQuerySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { website_id, key, preview } = req.query as unknown as {
        website_id: string;
        key: string;
        preview: boolean;
      };

      // Verify website is active (in-process cached)
      await assertWebsiteExists(website_id);

      const { item, fromCache } = await fetchPublicContent(
        website_id,
        key,
        preview,
      );

      const etag = makeEtag(item.version);

      // ETag / 304 conditional request handling
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch === etag) {
        res.setHeader('ETag', etag);
        res.setHeader('X-Cache', fromCache ? 'HIT' : 'MISS');
        res.status(304).end();
        return;
      }

      setCacheHeaders(res, etag, fromCache, item.cached_at);

      ok(res, {
        website_id,
        key: item.cms_key,
        content_type: item.content_type,
        value: item.value,
        metadata: item.metadata,
        version: item.version,
        preview,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /public/content/batch?website_id=xxx&keys=hero_title,hero_subtitle
// POST /public/content/batch  (keys in JSON body — avoids URL length limits)
// ─────────────────────────────────────────────────────────────────────────────
const batchHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Body or query — already validated by the validate middleware below
    const { website_id, keys, preview } = (
      req.method === 'POST' ? req.body : req.query
    ) as {
      website_id: string;
      keys: string[];
      preview: boolean;
    };

    await assertWebsiteExists(website_id);

    const result = await fetchBatchPublicContent(website_id, keys, preview);

    // Batch response is not ETag'd per item (too complex); set a short cache
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    res.setHeader('X-Cache-Hits', String(result.cacheHits));
    res.setHeader('X-Cache-Misses', String(result.cacheMisses));

    ok(res, {
      website_id,
      data: result.data,
      missing: result.missing,
      preview,
    });
  } catch (err) {
    next(err);
  }
};

const batchBodySchema = z.object({
  website_id: z.string().uuid(),
  keys: z.array(z.string().min(1).max(200)).min(1).max(50),
  preview: z.boolean().default(false),
});

router.get(
  '/content/batch',
  batchKeyRateLimit,
  validate({ query: batchContentQuerySchema }),
  batchHandler,
);

router.post(
  '/content/batch',
  batchKeyRateLimit,
  validate({ body: batchBodySchema }),
  batchHandler,
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /public/content/discover
// Auto-discover: registers text elements found by the SDK on the client page.
// Requires a write-scoped API key (cms_sk_...).
// ─────────────────────────────────────────────────────────────────────────────

const discoverItemSchema = z.object({
  key: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_\-\.]+$/, 'Key must be alphanumeric with hyphens/underscores/dots'),
  value: z.string().max(10_000),
  content_type: z.enum(['text', 'richtext']).default('text'),
});

const discoverBodySchema = z.object({
  website_id: z.string().uuid(),
  items: z.array(discoverItemSchema).min(1).max(200),
});

router.post(
  '/content/discover',
  batchKeyRateLimit,
  validate({ body: discoverBodySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const apiKeyCtx = req.apiKey;
      if (!apiKeyCtx || apiKeyCtx.scope !== 'write') {
        throw new ForbiddenError(
          'Auto-discover requires a write-scoped API key (cms_sk_...). ' +
          'Read-only keys (cms_pk_...) cannot register new content.',
        );
      }

      const { website_id, items } = req.body as z.infer<typeof discoverBodySchema>;
      await assertWebsiteExists(website_id);

      const result = await registerDiscoveredContent(website_id, items);

      ok(res, {
        website_id,
        created: result.created,
        existing: result.existing,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /public/content/search?website_id=xxx&q=text
// Full-text search across published content items.
// ─────────────────────────────────────────────────────────────────────────────

const searchQuerySchema = z.object({
  website_id: z.string().uuid(),
  q: z.string().min(1).max(200),
  limit: z.coerce.number().min(1).max(50).default(20),
});

router.get(
  '/content/search',
  singleKeyRateLimit,
  validate({ query: searchQuerySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { website_id, q, limit: maxResults } = req.query as unknown as {
        website_id: string; q: string; limit: number;
      };

      await assertWebsiteExists(website_id);

      const { rows } = await pool.query(
        `SELECT cms_key, content_type, value, metadata
         FROM content_items
         WHERE website_id = $1 AND is_published = true
           AND (cms_key ILIKE $2 OR value ILIKE $2)
         ORDER BY cms_key ASC LIMIT $3`,
        [website_id, `%${q}%`, maxResults],
      );

      res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
      ok(res, { website_id, query: q, results: rows, count: rows.length });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Cache management (JWT-protected — admin use only)
// ─────────────────────────────────────────────────────────────────────────────

const invalidateBodySchema = z.object({
  website_id: z.string().uuid(),
  key: z.string().min(1).optional(), // omit to invalidate entire website
});

/** GET /public/cache/stats?website_id=xxx */
router.get(
  '/cache/stats',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const websiteId = req.query['website_id'];
      if (typeof websiteId !== 'string') {
        throw new BadRequestError('website_id query param required');
      }
      const stats = await getCacheStats(websiteId);
      ok(res, { website_id: websiteId, ...stats });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /public/cache/invalidate
 * Body: { website_id, key? }
 * Omitting key invalidates the entire website's cache.
 */
router.post(
  '/cache/invalidate',
  requireAuth,
  validate({ body: invalidateBodySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { website_id, key } = req.body as { website_id: string; key?: string };

      if (key) {
        await invalidateKey(website_id, key);
        ok(res, { invalidated: 'key', website_id, key });
      } else {
        await invalidateWebsite(website_id);
        ok(res, { invalidated: 'website', website_id });
      }
    } catch (err) {
      next(err);
    }
  },
);

export { router as publicRouter };
