import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pool } from '../../lib/db/pool';
import * as apiKeysService from './apikeys.service';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe('listKeys', () => {
  it('returns keys without hash', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'k1', label: 'Prod', key_prefix: 'cms_pk_', scope: 'read' }],
    });
    const result = await apiKeysService.listKeys('w1');
    expect(result.data[0]).not.toHaveProperty('key_hash');
  });
});

describe('createKey', () => {
  it('returns full key only once', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'k1', label: 'Prod', key_prefix: 'cms_pk_', scope: 'read', created_at: new Date() }],
    });
    const result = await apiKeysService.createKey('w1', { label: 'Prod', scope: 'read' });
    expect(result.key).toMatch(/^cms_pk_/);
    expect(typeof result.key).toBe('string');
    expect(result.key.length).toBeGreaterThan(20);
  });
});

describe('revokeKey', () => {
  it('throws NotFoundError when key does not belong to website', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(apiKeysService.revokeKey('w1', 'k-ghost')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('resolves when key deleted', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(apiKeysService.revokeKey('w1', 'k1')).resolves.toBeUndefined();
  });
});
