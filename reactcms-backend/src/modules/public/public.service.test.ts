import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pool } from '../../lib/db/pool';

// Mock the content cache module
vi.mock('../../lib/contentCache', () => ({
  getCached: vi.fn(),
  setCached: vi.fn(),
  getBatchCached: vi.fn(),
  setBatchCached: vi.fn(),
  invalidateKey: vi.fn(),
  invalidateWebsite: vi.fn(),
  getCacheStats: vi.fn(),
}));

import * as cache from '../../lib/contentCache';
import {
  fetchPublicContent,
  fetchBatchPublicContent,
  assertWebsiteExists,
} from './public.service';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;
const mockGetCached = cache.getCached as ReturnType<typeof vi.fn>;
const mockSetCached = cache.setCached as ReturnType<typeof vi.fn>;
const mockGetBatch = cache.getBatchCached as ReturnType<typeof vi.fn>;
const mockSetBatch = cache.setBatchCached as ReturnType<typeof vi.fn>;

const WEBSITE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

beforeEach(() => vi.clearAllMocks());

// ── fetchPublicContent ────────────────────────────────────────────────────────

describe('fetchPublicContent', () => {
  const CACHED_ITEM = {
    cms_key: 'hero-title',
    content_type: 'text',
    value: 'Hello world',
    metadata: {},
    version: 3,
    cached_at: Date.now() - 5000,
  };

  it('returns cached item without hitting DB', async () => {
    mockGetCached.mockResolvedValueOnce(CACHED_ITEM);

    const result = await fetchPublicContent(WEBSITE_ID, 'hero-title');

    expect(result.fromCache).toBe(true);
    expect(result.item.value).toBe('Hello world');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('falls through to DB on cache miss and writes to cache', async () => {
    mockGetCached.mockResolvedValueOnce(null); // cache miss
    mockQuery.mockResolvedValueOnce({
      rows: [{
        cms_key: 'hero-title',
        content_type: 'text',
        value: 'Hello DB',
        metadata: {},
        version: 2,
      }],
    });

    const result = await fetchPublicContent(WEBSITE_ID, 'hero-title');

    expect(result.fromCache).toBe(false);
    expect(result.item.value).toBe('Hello DB');
    expect(mockSetCached).toHaveBeenCalledOnce();
  });

  it('throws NotFoundError when DB has no matching published item', async () => {
    mockGetCached.mockResolvedValueOnce(null);
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      fetchPublicContent(WEBSITE_ID, 'ghost-key'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('skips cache entirely in preview mode', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        cms_key: 'hero-title',
        content_type: 'text',
        value: 'Draft value',
        metadata: {},
        version: 5,
      }],
    });

    const result = await fetchPublicContent(WEBSITE_ID, 'hero-title', true);

    expect(mockGetCached).not.toHaveBeenCalled();
    expect(mockSetCached).not.toHaveBeenCalled(); // never cache drafts
    expect(result.item.value).toBe('Draft value');
  });

  it('does not cache preview results', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        cms_key: 'hero-title',
        content_type: 'text',
        value: 'Unpublished',
        metadata: {},
        version: 4,
      }],
    });

    await fetchPublicContent(WEBSITE_ID, 'hero-title', true);
    expect(mockSetCached).not.toHaveBeenCalled();
  });

  it('proceeds even if cache read throws (resilience)', async () => {
    mockGetCached.mockRejectedValueOnce(new Error('Redis down'));
    mockQuery.mockResolvedValueOnce({
      rows: [{
        cms_key: 'hero-title',
        content_type: 'text',
        value: 'DB fallback',
        metadata: {},
        version: 1,
      }],
    });

    // Should not throw — cache failure is non-fatal
    const result = await fetchPublicContent(WEBSITE_ID, 'hero-title');
    expect(result.item.value).toBe('DB fallback');
  });
});

// ── fetchBatchPublicContent ───────────────────────────────────────────────────

describe('fetchBatchPublicContent', () => {
  it('returns all items from cache when all are hits', async () => {
    const hits = {
      'hero-title': { cms_key: 'hero-title', content_type: 'text', value: 'A', metadata: {}, version: 1, cached_at: Date.now() },
      'hero-sub':   { cms_key: 'hero-sub',   content_type: 'text', value: 'B', metadata: {}, version: 1, cached_at: Date.now() },
    };
    mockGetBatch.mockResolvedValueOnce({ hits, misses: [] });

    const result = await fetchBatchPublicContent(WEBSITE_ID, ['hero-title', 'hero-sub']);

    expect(result.cacheHits).toBe(2);
    expect(result.cacheMisses).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('fetches only cache-miss keys from DB', async () => {
    const hits = {
      'hero-title': { cms_key: 'hero-title', content_type: 'text', value: 'Cached', metadata: {}, version: 1, cached_at: Date.now() },
    };
    mockGetBatch.mockResolvedValueOnce({ hits, misses: ['hero-sub'] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ cms_key: 'hero-sub', content_type: 'text', value: 'FromDB', metadata: {}, version: 2 }],
    });

    const result = await fetchBatchPublicContent(WEBSITE_ID, ['hero-title', 'hero-sub']);

    expect(result.cacheHits).toBe(1);
    expect(result.cacheMisses).toBe(1);
    expect(result.data['hero-title']?.value).toBe('Cached');
    expect(result.data['hero-sub']?.value).toBe('FromDB');
    expect(mockSetBatch).toHaveBeenCalledOnce();
  });

  it('reports missing keys that are in neither cache nor DB', async () => {
    mockGetBatch.mockResolvedValueOnce({ hits: {}, misses: ['hero', 'ghost'] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ cms_key: 'hero', content_type: 'text', value: 'Hi', metadata: {}, version: 1 }],
    });

    const result = await fetchBatchPublicContent(WEBSITE_ID, ['hero', 'ghost']);

    expect(result.missing).toContain('ghost');
    expect(result.missing).not.toContain('hero');
  });

  it('skips cache in preview mode and never writes to cache', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ cms_key: 'hero', content_type: 'text', value: 'Draft', metadata: {}, version: 3 }],
    });

    await fetchBatchPublicContent(WEBSITE_ID, ['hero'], true);

    expect(mockGetBatch).not.toHaveBeenCalled();
    expect(mockSetBatch).not.toHaveBeenCalled();
  });
});

// ── assertWebsiteExists ───────────────────────────────────────────────────────

describe('assertWebsiteExists', () => {
  // Clear the in-process cache between tests
  beforeEach(() => {
    // Import the map directly isn't possible without export, so we rely on
    // a unique websiteId per test to avoid cross-test cache pollution
  });

  it('throws NotFoundError for unknown website', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const unknownId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    await expect(assertWebsiteExists(unknownId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('resolves for active website', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: WEBSITE_ID }] });
    const activeId = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
    await expect(assertWebsiteExists(activeId)).resolves.toBeUndefined();
  });
});
