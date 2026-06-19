import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  expiryToSeconds,
} from './jwt';

const USER = { sub: 'u1', email: 'a@b.com', role: 'user' };

describe('access tokens', () => {
  it('round-trips correctly', () => {
    const token = signAccessToken(USER);
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.email).toBe('a@b.com');
    expect(payload.type).toBe('access');
  });

  it('rejects a refresh token passed as access token', () => {
    const { token } = signRefreshToken('u1');
    expect(() => verifyAccessToken(token)).toThrow();
  });

  it('produces different tokens for different users', () => {
    const t1 = signAccessToken(USER);
    const t2 = signAccessToken({ ...USER, sub: 'u2' });
    expect(t1).not.toBe(t2);
  });
});

describe('refresh tokens', () => {
  it('round-trips correctly', () => {
    const { token, jti } = signRefreshToken('u1');
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.jti).toBe(jti);
    expect(payload.type).toBe('refresh');
  });

  it('rejects access token as refresh token', () => {
    const token = signAccessToken(USER);
    expect(() => verifyRefreshToken(token)).toThrow();
  });

  it('generates unique jti each call', () => {
    const { jti: j1 } = signRefreshToken('u1');
    const { jti: j2 } = signRefreshToken('u1');
    expect(j1).not.toBe(j2);
  });
});

describe('expiryToSeconds', () => {
  it.each([
    ['15m', 900],
    ['7d', 604800],
    ['1h', 3600],
    ['30s', 30],
  ])('%s → %i seconds', (input, expected) => {
    expect(expiryToSeconds(input)).toBe(expected);
  });
});
