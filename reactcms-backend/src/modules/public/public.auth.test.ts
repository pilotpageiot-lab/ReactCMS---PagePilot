import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { pool } from '../../lib/db/pool';
import { validatePublicApiKey } from './public.auth';
import { sha256 } from '../../utils/hash';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

const WEBSITE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const RAW_KEY = 'cms_pk_testkey123456789';
const KEY_ROW = {
  id: 'key-uuid',
  website_id: WEBSITE_ID,
  scope: 'read',
  expires_at: null,
  label: 'Test key',
};

function makeReq(overrides: Partial<{
  headers: Record<string, string>;
  query: Record<string, string>;
}> = {}): Request {
  return {
    headers: overrides.headers ?? {},
    query: overrides.query ?? { website_id: WEBSITE_ID },
    ip: '127.0.0.1',
    path: '/public/content',
  } as unknown as Request;
}

const res = {} as Response;

// ── Key extraction ────────────────────────────────────────────────────────────

describe('validatePublicApiKey — key extraction', () => {
  it('accepts key from X-CMS-Key header', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [KEY_ROW] }) // key lookup
      .mockResolvedValueOnce({ rows: [] });         // last_used_at update

    const req = makeReq({ headers: { 'x-cms-key': RAW_KEY } });
    const next = vi.fn();
    await validatePublicApiKey(req, res, next);
    expect(next).toHaveBeenCalledWith(); // no error
    expect(req.apiKey?.id).toBe('key-uuid');
  });

  it('accepts key from Authorization: Bearer header', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [KEY_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ headers: { authorization: `Bearer ${RAW_KEY}` } });
    const next = vi.fn();
    await validatePublicApiKey(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('accepts key from ?api_key= query param', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [KEY_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ query: { website_id: WEBSITE_ID, api_key: RAW_KEY } });
    const next = vi.fn();
    await validatePublicApiKey(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(UnauthorizedError) when no key supplied', async () => {
    const req = makeReq({ headers: {}, query: { website_id: WEBSITE_ID } });
    const next = vi.fn();
    await validatePublicApiKey(req, res, next);
    expect((next.mock.calls[0]?.[0] as { code: string }).code).toBe('UNAUTHORIZED');
  });
});

// ── Key validation ────────────────────────────────────────────────────────────

describe('validatePublicApiKey — key validation', () => {
  it('calls next(UnauthorizedError) for unknown key', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no key found
    const req = makeReq({ headers: { 'x-cms-key': 'cms_pk_unknown' } });
    const next = vi.fn();
    await validatePublicApiKey(req, res, next);
    expect((next.mock.calls[0]?.[0] as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('calls next(UnauthorizedError) for expired key', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...KEY_ROW, expires_at: '2020-01-01T00:00:00Z' }],
    });
    const req = makeReq({ headers: { 'x-cms-key': RAW_KEY } });
    const next = vi.fn();
    await validatePublicApiKey(req, res, next);
    expect((next.mock.calls[0]?.[0] as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('accepts key with future expiry', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ ...KEY_ROW, expires_at: future }] })
      .mockResolvedValueOnce({ rows: [] });
    const req = makeReq({ headers: { 'x-cms-key': RAW_KEY } });
    const next = vi.fn();
    await validatePublicApiKey(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});

// ── website_id cross-check ────────────────────────────────────────────────────

describe('validatePublicApiKey — website_id cross-check', () => {
  it('calls next(UnauthorizedError) when key belongs to different website', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [KEY_ROW] }); // key for WEBSITE_ID

    const req = makeReq({
      headers: { 'x-cms-key': RAW_KEY },
      query: { website_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }, // different
    });
    const next = vi.fn();
    await validatePublicApiKey(req, res, next);
    expect((next.mock.calls[0]?.[0] as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('passes when key website_id matches query website_id', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [KEY_ROW] })
      .mockResolvedValueOnce({ rows: [] });
    const req = makeReq({
      headers: { 'x-cms-key': RAW_KEY },
      query: { website_id: WEBSITE_ID },
    });
    const next = vi.fn();
    await validatePublicApiKey(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});

// ── Preview mode ──────────────────────────────────────────────────────────────

describe('validatePublicApiKey — preview mode', () => {
  it('calls next(ForbiddenError) when preview=true with read-scoped key', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...KEY_ROW, scope: 'read' }] });
    const req = makeReq({
      headers: { 'x-cms-key': RAW_KEY },
      query: { website_id: WEBSITE_ID, preview: 'true' },
    });
    const next = vi.fn();
    await validatePublicApiKey(req, res, next);
    expect((next.mock.calls[0]?.[0] as { code: string }).code).toBe('FORBIDDEN');
  });

  it('passes preview=true with write-scoped key', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ ...KEY_ROW, scope: 'write' }] })
      .mockResolvedValueOnce({ rows: [] });
    const req = makeReq({
      headers: { 'x-cms-key': RAW_KEY },
      query: { website_id: WEBSITE_ID, preview: 'true' },
    });
    const next = vi.fn();
    await validatePublicApiKey(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});

// ── req.apiKey population ─────────────────────────────────────────────────────

describe('validatePublicApiKey — req.apiKey population', () => {
  it('populates req.apiKey with correct fields', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [KEY_ROW] })
      .mockResolvedValueOnce({ rows: [] });
    const req = makeReq({ headers: { 'x-cms-key': RAW_KEY } });
    await validatePublicApiKey(req, res, vi.fn());
    expect(req.apiKey).toMatchObject({
      id: 'key-uuid',
      websiteId: WEBSITE_ID,
      scope: 'read',
    });
  });
});
