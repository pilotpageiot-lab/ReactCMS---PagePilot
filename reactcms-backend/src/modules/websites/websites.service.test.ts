import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pool } from '../../lib/db/pool';
import * as websitesService from './websites.service';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe('createWebsite', () => {
  it('returns the created website', async () => {
    const website = { id: 'w1', name: 'VeloMU', slug: 'velomu', plan: 'free', is_active: true };
    mockQuery.mockResolvedValueOnce({ rows: [website] });

    const result = await websitesService.createWebsite('user-1', {
      name: 'VeloMU',
      slug: 'velomu',
      plan: 'free',
    });
    expect(result).toMatchObject({ slug: 'velomu' });
  });
});

describe('getWebsite', () => {
  it('throws NotFoundError when website does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(websitesService.getWebsite('missing-id')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns website with content_count', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'w1', name: 'VeloMU', content_count: '5' }],
    });
    const w = await websitesService.getWebsite('w1');
    expect(w.content_count).toBe('5');
  });
});

describe('deleteWebsite', () => {
  it('throws ForbiddenError when requester is not owner', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ owner_id: 'other-user' }] });
    await expect(
      websitesService.deleteWebsite('requester-id', 'w1'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('deletes successfully when requester is owner', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-id' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      websitesService.deleteWebsite('owner-id', 'w1'),
    ).resolves.toBeUndefined();
  });
});

describe('inviteMember', () => {
  it('throws NotFoundError for unknown email', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // user not found
    await expect(
      websitesService.inviteMember('w1', { email: 'ghost@x.com', role: 'editor' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws ConflictError when already a member', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'u2' }] })  // user found
      .mockResolvedValueOnce({ rows: [{ id: 'existing' }] }); // already member
    await expect(
      websitesService.inviteMember('w1', { email: 'member@x.com', role: 'editor' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
