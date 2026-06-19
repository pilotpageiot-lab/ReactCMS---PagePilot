import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { requireAuth } from './auth.middleware';
import { signAccessToken } from '../lib/jwt';

function mockReq(authHeader?: string): Request {
  return {
    headers: { authorization: authHeader },
    cookies: {},
  } as unknown as Request;
}
const res = {} as Response;

describe('requireAuth', () => {
  it('calls next() and populates req.user for valid token', () => {
    const token = signAccessToken({ sub: 'u1', email: 'a@b.com', role: 'user' });
    const req = mockReq(`Bearer ${token}`);
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(req.user).toMatchObject({ id: 'u1', email: 'a@b.com' });
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(UnauthorizedError) when no header', () => {
    const next = vi.fn();
    requireAuth(mockReq(), res, next);
    const err = next.mock.calls[0]?.[0] as { code: string };
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('calls next(UnauthorizedError) for malformed token', () => {
    const next = vi.fn();
    requireAuth(mockReq('Bearer not.a.token'), res, next);
    const err = next.mock.calls[0]?.[0] as { code: string };
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('calls next(UnauthorizedError) for missing Bearer prefix', () => {
    const token = signAccessToken({ sub: 'u1', email: 'a@b.com', role: 'user' });
    const next = vi.fn();
    requireAuth(mockReq(token), res, next); // no "Bearer " prefix
    const err = next.mock.calls[0]?.[0] as { code: string };
    expect(err.code).toBe('UNAUTHORIZED');
  });
});
