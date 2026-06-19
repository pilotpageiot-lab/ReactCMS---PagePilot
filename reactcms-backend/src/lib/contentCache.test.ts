import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock redis before importing contentCache
vi.mock('./redis', () => {
  const get = vi.fn();
  const set = vi.fn();
  const del = vi.fn();
  const mGet = vi.fn();
  const scan = vi.fn();
  const multi = vi.fn();

  return {
    redis: { get, set, del, mGet, scan, multi },
    connectRedis: vi.fn(),
    storeRefreshToken: vi.fn(),
    validateRefreshToken: vi.fn(),
    revokeRefreshToken: vi.fn(),
    revokeAllUserTokens: vi.fn(),
  };
});

import { redis } from './redis';
import {
  getCached,
  setCached,
  invalidateKey,
  getBatchCached,
  setBatchCached,
  CachedContentItem,
} from './contentCache';

const mockGet  = redis.get  as ReturnType<typeof vi.fn>;
const mockSet  = redis.set  as ReturnType<typeof vi.fn>;
const mockDel  = redis.del  as ReturnType<typeof vi.fn>;
const mockMGet = redis.mGet as ReturnType<typeof vi.fn>;
const mockMulti = redis.multi as ReturnType<typeof vi.fn>;

const WEBSITE_ID = 'w1';
const ITEM: CachedContentItem = {
  cms_key: 'hero-title',
  content_type: 'text',
  value: 'Hello',
  metadata: {},
  version: 2,
  cached_at: Date.now(),
};

beforeEach(() => vi.clearAllMocks());

// ── getCached ─────────────────────────────────────────────────────────────────

describe('getCached', () => {
  it('returns parsed item on hit', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify(ITEM));
    const result = await getCached(WEBSITE_ID, 'hero-title');
    expect(result).toMatchObject({ cms_key: 'hero-title', value: 'Hello' });
    expect(mockGet).toHaveBeenCalledWith('content:w1:hero-title');
  });

  it('returns null on miss', async () => {
    mockGet.mockResolvedValueOnce(null);
    expect(await getCached(WEBSITE_ID, 'missing')).toBeNull();
  });

  it('returns null and swallows error on Redis failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('Redis connection lost'));
    expect(await getCached(WEBSITE_ID, 'hero-title')).toBeNull();
  });
});

// ── setCached ─────────────────────────────────────────────────────────────────

describe('setCached', () => {
  it('sets key with correct TTL', async () => {
    mockSet.mockResolvedValueOnce('OK');
    await setCached(WEBSITE_ID, ITEM);
    expect(mockSet).toHaveBeenCalledWith(
      'content:w1:hero-title',
      JSON.stringify(ITEM),
      { EX: 300 },
    );
  });

  it('swallows Redis write error', async () => {
    mockSet.mockRejectedValueOnce(new Error('OOM'));
    await expect(setCached(WEBSITE_ID, ITEM)).resolves.toBeUndefined();
  });
});

// ── invalidateKey ─────────────────────────────────────────────────────────────

describe('invalidateKey', () => {
  it('deletes the correct Redis key', async () => {
    mockDel.mockResolvedValueOnce(1);
    await invalidateKey(WEBSITE_ID, 'hero-title');
    expect(mockDel).toHaveBeenCalledWith('content:w1:hero-title');
  });

  it('swallows Redis error', async () => {
    mockDel.mockRejectedValueOnce(new Error('Del failed'));
    await expect(invalidateKey(WEBSITE_ID, 'hero-title')).resolves.toBeUndefined();
  });
});

// ── getBatchCached ────────────────────────────────────────────────────────────

describe('getBatchCached', () => {
  it('returns hits and misses correctly', async () => {
    const items = [JSON.stringify(ITEM), null, JSON.stringify({ ...ITEM, cms_key: 'cta' })];
    mockMGet.mockResolvedValueOnce(items);

    const result = await getBatchCached(WEBSITE_ID, ['hero-title', 'missing', 'cta']);

    expect(Object.keys(result.hits)).toHaveLength(2);
    expect(result.hits['hero-title']).toBeDefined();
    expect(result.hits['cta']).toBeDefined();
    expect(result.misses).toEqual(['missing']);
  });

  it('returns all as misses on empty input', async () => {
    const result = await getBatchCached(WEBSITE_ID, []);
    expect(result.hits).toEqual({});
    expect(result.misses).toEqual([]);
    expect(mockMGet).not.toHaveBeenCalled();
  });

  it('falls back to all-miss on Redis error', async () => {
    mockMGet.mockRejectedValueOnce(new Error('Network error'));
    const result = await getBatchCached(WEBSITE_ID, ['k1', 'k2']);
    expect(result.misses).toEqual(['k1', 'k2']);
    expect(result.hits).toEqual({});
  });
});

// ── setBatchCached ────────────────────────────────────────────────────────────

describe('setBatchCached', () => {
  it('uses a pipeline (multi) for batch writes', async () => {
    const exec = vi.fn().mockResolvedValueOnce([]);
    const set = vi.fn().mockReturnThis();
    mockMulti.mockReturnValueOnce({ set, exec });

    const items: CachedContentItem[] = [
      { ...ITEM, cms_key: 'k1' },
      { ...ITEM, cms_key: 'k2' },
    ];
    await setBatchCached(WEBSITE_ID, items);

    expect(mockMulti).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledTimes(2);
    expect(exec).toHaveBeenCalledOnce();
  });

  it('does nothing for empty array', async () => {
    await setBatchCached(WEBSITE_ID, []);
    expect(mockMulti).not.toHaveBeenCalled();
  });

  it('swallows pipeline error', async () => {
    const exec = vi.fn().mockRejectedValueOnce(new Error('Pipeline failed'));
    mockMulti.mockReturnValueOnce({ set: vi.fn().mockReturnThis(), exec });
    await expect(setBatchCached(WEBSITE_ID, [ITEM])).resolves.toBeUndefined();
  });
});
