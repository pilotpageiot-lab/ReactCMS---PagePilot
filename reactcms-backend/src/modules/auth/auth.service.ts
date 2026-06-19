import { pool } from '../../lib/db/pool';
import {
  signAccessToken, signRefreshToken, verifyRefreshToken, expiryToSeconds,
} from '../../lib/jwt';
import {
  storeRefreshToken, validateRefreshToken, revokeRefreshToken,
} from '../../lib/redis';
import { hashPassword, verifyPassword } from '../../utils/hash';
import { ConflictError, UnauthorizedError, NotFoundError } from '../../utils/errors';
import { config } from '../../config';
import type { RegisterDto, LoginDto } from './auth.schema';

interface UserRow {
  id: string; email: string; name: string;
  role: string; password_hash: string; created_at: Date;
}

async function issueTokens(user: Pick<UserRow, 'id' | 'email' | 'role'>) {
  const access_token = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const { token: refresh_token, jti } = signRefreshToken(user.id);
  await storeRefreshToken(user.id, jti, expiryToSeconds(config.JWT_REFRESH_EXPIRY));
  return { access_token, refresh_token };
}

export async function register(dto: RegisterDto) {
  // SECURITY FIX: run bcrypt unconditionally to prevent email enumeration via timing
  const [existing, password_hash] = await Promise.all([
    pool.query('SELECT id FROM users WHERE email = $1', [dto.email]),
    hashPassword(dto.password),
  ]);
  if (existing.rows.length > 0) throw new ConflictError('Email already registered');

  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
     RETURNING id, email, name, role, created_at`,
    [dto.email, dto.name, password_hash],
  );
  const user = rows[0]!;
  const tokens = await issueTokens(user);
  return { user: { id: user.id, email: user.email, name: user.name }, ...tokens };
}

export async function login(dto: LoginDto) {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, email, name, role, password_hash FROM users WHERE email = $1',
    [dto.email],
  );
  const user = rows[0];
  if (!user) throw new UnauthorizedError('Invalid credentials');
  const valid = await verifyPassword(dto.password, user.password_hash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');
  const tokens = await issueTokens(user);
  return { user: { id: user.id, email: user.email, name: user.name }, ...tokens };
}

export async function refresh(refreshToken: string) {
  let payload;
  try { payload = verifyRefreshToken(refreshToken); }
  catch { throw new UnauthorizedError('Invalid or expired refresh token'); }

  const valid = await validateRefreshToken(payload.sub, payload.jti);
  if (!valid) throw new UnauthorizedError('Token already used or revoked');
  await revokeRefreshToken(payload.sub, payload.jti);

  const { rows } = await pool.query<UserRow>(
    'SELECT id, email, role FROM users WHERE id = $1', [payload.sub],
  );
  const user = rows[0];
  if (!user) throw new NotFoundError('User');

  const access_token = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const { token: new_refresh_token, jti: newJti } = signRefreshToken(user.id);
  await storeRefreshToken(user.id, newJti, expiryToSeconds(config.JWT_REFRESH_EXPIRY));
  return { access_token, refresh_token: new_refresh_token, expires_in: 900 };
}

export async function logout(userId: string, refreshToken?: string) {
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await revokeRefreshToken(payload.sub, payload.jti);
    } catch { /* ignore invalid token on logout */ }
  }
}

export async function getMe(userId: string) {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, email, name, role, created_at FROM users WHERE id = $1', [userId],
  );
  const user = rows[0];
  if (!user) throw new NotFoundError('User');
  return { id: user.id, email: user.email, name: user.name, role: user.role, created_at: user.created_at };
}
