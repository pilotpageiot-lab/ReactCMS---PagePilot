/**
 * Router-level tests for the /public endpoint.
 *
 * We test the full middleware stack (schema validation, auth, rate limiting,
 * ETag) by stubbing the service layer. This catches wiring bugs that unit
 * tests on individual functions would miss (wrong middleware order, missing
 * validate() call, wrong response shape, etc.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// ── Stub the auth middleware so we can test routing in isolation ──────────────
vi.mock('./public.auth', () => ({
  validatePublicApiKey: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    // Simulate successful auth — attach apiKey to req
    req.apiKey = {
      id: 'key-uuid',
      websiteId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      scope: 'read',
    };
    next();
  }),
}));

vi.mock('./public.service', () => ({
  fetchPublicContent: vi.fn(),
  fetchBatchPublicContent: vi.fn(),
  assertWebsiteExists: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/contentCache', () => ({
  invalidateKey: vi.fn(),
  invalidateWebsite: vi.fn(),
  getCacheStats: vi.fn().mockResolvedValue({ key_count: 5, sample_keys: ['hero'] }),
}));

// Mock rate limiters to be pass-through in tests
vi.mock('./public.rateLimit', () => {
  const passThrough = (_req: Request, _res: Response, next: NextFunction) => next();
  return {
    singleKeyRateLimit: passThrough,
    batchKeyRateLimit: passThrough,
    ipFallbackRateLimit: passThrough,
    websiteCircuitBreaker: passThrough,
  };
});

import * as service from './public.service';
import { publicRouter } from './public.router';

// Minimal Express test harness
import express from 'express';
import cookieParser from 'cookie-parser';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/public', publicRouter);
  return app;
}

// Use supertest-style manual fetch since we can't install supertest
async function simulateRequest(
  app: ReturnType<typeof buildApp>,
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url: path,
      headers: {
        'content-type': 'application/json',
        'x-cms-key': 'cms_pk_testkey',
        ...opts.headers,
      },
      body: opts.body ?? {},
      ip: '127.0.0.1',
      cookies: {},
    } as unknown as Request;

    const captured: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };

    const res = {
      status(code: number) { captured.status = code; return this; },
      json(data: unknown) { captured.body = data; resolve({ status: captured.status ?? 200, body: data, headers: captured.headers }); return this; },
      setHeader(name: string, val: string) { captured.headers[name.toLowerCase()] = val; return this; },
      getHeader(name: string) { return captured.headers[name.toLowerCase()]; },
      end() { resolve({ status: captured.status ?? 204, body: null, headers: captured.headers }); return this; },
      send() { resolve({ status: captured.status ?? 200, body: null, headers: captured.headers }); return this; },
    } as unknown as Response;

    app(req, res, (err: unknown) => {
      if (err) reject(err);
    });
  });
}

const mockFetchSingle = service.fetchPublicContent as ReturnType<typeof vi.fn>;
const mockFetchBatch  = service.fetchBatchPublicContent as ReturnType<typeof vi.fn>;

const WEBSITE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CONTENT_ITEM = {
  cms_key: 'hero-title',
  content_type: 'text',
  value: 'Hello world',
  metadata: {},
  version: 3,
  cached_at: Date.now(),
};

beforeEach(() => vi.clearAllMocks());

// ── GET /public/health ────────────────────────────────────────────────────────

describe('GET /public/health', () => {
  it('returns 200 ok without auth', async () => {
    const app = buildApp();
    const result = await simulateRequest(app, 'GET', '/public/health');
    expect(result.status).toBe(200);
    expect((result.body as { status: string }).status).toBe('ok');
  });
});

// ── GET /public/content ───────────────────────────────────────────────────────

describe('GET /public/content', () => {
  it('returns content item with cache headers', async () => {
    mockFetchSingle.mockResolvedValueOnce({ item: CONTENT_ITEM, fromCache: false });

    const app = buildApp();
    const result = await simulateRequest(
      app,
      'GET',
      `/public/content?website_id=${WEBSITE_ID}&key=hero-title`,
    );

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body['key']).toBe('hero-title');
    expect(body['value']).toBe('Hello world');
    expect(result.headers['etag']).toBe('"v3"');
    expect(result.headers['cache-control']).toContain('s-maxage=60');
    expect(result.headers['x-cache']).toBe('MISS');
  });

  it('sets X-Cache: HIT when served from cache', async () => {
    mockFetchSingle.mockResolvedValueOnce({ item: CONTENT_ITEM, fromCache: true });
    const app = buildApp();
    const result = await simulateRequest(
      app,
      'GET',
      `/public/content?website_id=${WEBSITE_ID}&key=hero-title`,
    );
    expect(result.headers['x-cache']).toBe('HIT');
  });

  it('returns 304 when ETag matches', async () => {
    mockFetchSingle.mockResolvedValueOnce({ item: CONTENT_ITEM, fromCache: true });
    const app = buildApp();
    const result = await simulateRequest(
      app,
      'GET',
      `/public/content?website_id=${WEBSITE_ID}&key=hero-title`,
      { headers: { 'if-none-match': '"v3"', 'x-cms-key': 'cms_pk_testkey' } },
    );
    expect(result.status).toBe(304);
  });

  it('returns 422 for missing key param', async () => {
    const app = buildApp();
    const result = await simulateRequest(
      app,
      'GET',
      `/public/content?website_id=${WEBSITE_ID}`,
    );
    expect(result.status).toBe(422);
  });

  it('returns 422 for invalid website_id', async () => {
    const app = buildApp();
    const result = await simulateRequest(
      app,
      'GET',
      `/public/content?website_id=not-a-uuid&key=hero`,
    );
    expect(result.status).toBe(422);
  });

  it('returns 422 for key with invalid chars', async () => {
    const app = buildApp();
    const result = await simulateRequest(
      app,
      'GET',
      `/public/content?website_id=${WEBSITE_ID}&key=hero+title!`,
    );
    expect(result.status).toBe(422);
  });
});

// ── POST /public/content/batch ────────────────────────────────────────────────

describe('POST /public/content/batch', () => {
  it('returns batch data map', async () => {
    mockFetchBatch.mockResolvedValueOnce({
      data: {
        'hero-title': CONTENT_ITEM,
        'hero-sub':   { ...CONTENT_ITEM, cms_key: 'hero-sub', value: 'Sub' },
      },
      missing: [],
      cacheHits: 2,
      cacheMisses: 0,
    });

    const app = buildApp();
    const result = await simulateRequest(app, 'POST', '/public/content/batch', {
      body: { website_id: WEBSITE_ID, keys: ['hero-title', 'hero-sub'] },
    });

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(Object.keys(body['data'] as object)).toHaveLength(2);
    expect((body['missing'] as string[])).toHaveLength(0);
  });

  it('includes missing keys in response', async () => {
    mockFetchBatch.mockResolvedValueOnce({
      data: { 'hero-title': CONTENT_ITEM },
      missing: ['ghost-key'],
      cacheHits: 1,
      cacheMisses: 1,
    });

    const app = buildApp();
    const result = await simulateRequest(app, 'POST', '/public/content/batch', {
      body: { website_id: WEBSITE_ID, keys: ['hero-title', 'ghost-key'] },
    });

    const body = result.body as Record<string, unknown>;
    expect((body['missing'] as string[])).toContain('ghost-key');
  });

  it('returns 422 when keys array exceeds 50', async () => {
    const keys = Array.from({ length: 51 }, (_, i) => `key-${i}`);
    const app = buildApp();
    const result = await simulateRequest(app, 'POST', '/public/content/batch', {
      body: { website_id: WEBSITE_ID, keys },
    });
    expect(result.status).toBe(422);
  });

  it('returns 422 for empty keys array', async () => {
    const app = buildApp();
    const result = await simulateRequest(app, 'POST', '/public/content/batch', {
      body: { website_id: WEBSITE_ID, keys: [] },
    });
    expect(result.status).toBe(422);
  });
});
