import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pool, withTransaction } from '../../lib/db/pool';
import * as contentService from './content.service';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;
const mockTx = withTransaction as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe('getContent', () => {
  it('returns published item', async () => {
    const item = { cms_key: 'hero', content_type: 'text', value: 'Hello', version: 1 };
    mockQuery.mockResolvedValueOnce({ rows: [item] });
    const result = await contentService.getContent('w1', 'hero');
    expect(result.value).toBe('Hello');
  });

  it('throws NotFoundError for unpublished when draft=false', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(contentService.getContent('w1', 'missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('deleteContent', () => {
  it('throws NotFoundError when key does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(contentService.deleteContent('w1', 'nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('resolves when deletion succeeds', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(contentService.deleteContent('w1', 'hero')).resolves.toBeUndefined();
  });
});

describe('publishContent', () => {
  it('throws NotFoundError for missing key', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(
      contentService.publishContent('w1', 'ghost', {}),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns published item', async () => {
    const item = { cms_key: 'hero', is_published: true, version: 2 };
    mockQuery.mockResolvedValueOnce({ rows: [item] });
    const result = await contentService.publishContent('w1', 'hero', {});
    expect(result.is_published).toBe(true);
  });
});

describe('listVersions', () => {
  it('throws NotFoundError when content item does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // content_items lookup
    await expect(contentService.listVersions('w1', 'ghost')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns version history', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'ci-1' }] })
      .mockResolvedValueOnce({
        rows: [
          { version: 2, value: 'New', changed_by: 'Nesta', created_at: new Date() },
          { version: 1, value: 'Old', changed_by: 'Nesta', created_at: new Date() },
        ],
      });
    const result = await contentService.listVersions('w1', 'hero');
    expect(result.data).toHaveLength(2);
    expect(result.data[0].version).toBe(2);
  });
});
