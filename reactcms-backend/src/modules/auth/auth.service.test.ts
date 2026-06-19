import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pool } from '../../lib/db/pool';
import * as redis from '../../lib/redis';
import * as authService from './auth.service';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;
const mockValidate = redis.validateRefreshToken as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ── register ───────────────────────────────────────────────────────────────

describe('register', () => {
  it('throws ConflictError when email already registered', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
    await expect(
      authService.register({ email: 'a@b.com', name: 'A', password: 'password1' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('returns user + tokens on success', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no existing user
      .mockResolvedValueOnce({
        rows: [{ id: 'new-id', email: 'a@b.com', name: 'Nesta', role: 'user' }],
      });

    const result = await authService.register({
      email: 'a@b.com',
      name: 'Nesta',
      password: 'password1',
    });

    expect(result.user).toMatchObject({ email: 'a@b.com', name: 'Nesta' });
    expect(typeof result.access_token).toBe('string');
    expect(typeof result.refresh_token).toBe('string');
  });
});

// ── login ──────────────────────────────────────────────────────────────────

describe('login', () => {
  it('throws UnauthorizedError for unknown email', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(
      authService.login({ email: 'nobody@x.com', password: 'pw' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws UnauthorizedError for wrong password', async () => {
    // bcrypt hash of "correctpassword"
    const hash = '$2a$12$notarealhashjustfakedata123456789012345678';
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: '1', email: 'a@b.com', name: 'X', role: 'user', password_hash: hash }],
    });
    await expect(
      authService.login({ email: 'a@b.com', password: 'wrongpassword' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

// ── refresh ────────────────────────────────────────────────────────────────

describe('refresh', () => {
  it('throws UnauthorizedError for invalid token string', async () => {
    await expect(authService.refresh('not-a-token')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('throws UnauthorizedError when token already revoked', async () => {
    mockValidate.mockResolvedValueOnce(false);

    const { signRefreshToken } = await import('../../lib/jwt');
    const { token } = signRefreshToken('user-id');

    await expect(authService.refresh(token)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

// ── getMe ──────────────────────────────────────────────────────────────────

describe('getMe', () => {
  it('throws NotFoundError when user missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(authService.getMe('ghost-id')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns user profile', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'u1', email: 'a@b.com', name: 'A', role: 'user', created_at: new Date() }],
    });
    const user = await authService.getMe('u1');
    expect(user.email).toBe('a@b.com');
  });
});
