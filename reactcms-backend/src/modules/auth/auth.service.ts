import { pool } from '../../lib/db/pool';
import { v4 as uuidv4 } from 'uuid';
import {
  signAccessToken, signRefreshToken, verifyRefreshToken, expiryToSeconds,
} from '../../lib/jwt';
import {
  storeRefreshToken, validateRefreshToken, revokeRefreshToken, revokeAllUserTokens,
} from '../../lib/redis';
import { redis } from '../../lib/redis';
import { hashPassword, verifyPassword } from '../../utils/hash';
import { ConflictError, UnauthorizedError, NotFoundError, BadRequestError } from '../../utils/errors';
import { config } from '../../config';
import { getPlanLimits } from '../../lib/planLimits';
import { sendVerificationEmail } from '../../lib/email';
import type { RegisterDto, LoginDto } from './auth.schema';

interface UserRow {
  id: string; email: string; name: string;
  role: string; password_hash: string;
  email_verified_at: Date | null; created_at: Date;
}

const VERIFY_TOKEN_PREFIX = 'email_verify:';
const VERIFY_TOKEN_TTL = 24 * 60 * 60; // 24 hours

async function issueTokens(user: Pick<UserRow, 'id' | 'email' | 'role'>) {
  const access_token = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const { token: refresh_token, jti } = signRefreshToken(user.id);
  await storeRefreshToken(user.id, jti, expiryToSeconds(config.JWT_REFRESH_EXPIRY));
  return { access_token, refresh_token };
}

function userResponse(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    email_verified: user.email_verified_at !== null,
    created_at: user.created_at,
  };
}

export async function register(dto: RegisterDto) {
  const [existing, password_hash] = await Promise.all([
    pool.query('SELECT id FROM users WHERE email = $1', [dto.email]),
    hashPassword(dto.password),
  ]);
  if (existing.rows.length > 0) throw new ConflictError('Email already registered');

  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
     RETURNING id, email, name, role, email_verified_at, created_at`,
    [dto.email, dto.name, password_hash],
  );
  const user = rows[0]!;
  const tokens = await issueTokens(user);

  // Generate verification token and send email
  const verifyToken = uuidv4();
  await redis.set(VERIFY_TOKEN_PREFIX + verifyToken, user.id, { EX: VERIFY_TOKEN_TTL });
  sendVerificationEmail(user.email, user.name, verifyToken).catch(() => {});

  return { user: userResponse(user), ...tokens };
}

export async function login(dto: LoginDto) {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, email, name, role, password_hash, email_verified_at, created_at FROM users WHERE email = $1',
    [dto.email],
  );
  const user = rows[0];
  if (!user) throw new UnauthorizedError('Invalid credentials');
  const valid = await verifyPassword(dto.password, user.password_hash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');
  const tokens = await issueTokens(user);
  return { user: userResponse(user), ...tokens };
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

export async function logout(_userId: string, refreshToken?: string) {
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await revokeRefreshToken(payload.sub, payload.jti);
    } catch { /* ignore invalid token on logout */ }
  }
}

export async function getMe(userId: string) {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, email, name, role, email_verified_at, created_at FROM users WHERE id = $1', [userId],
  );
  const user = rows[0];
  if (!user) throw new NotFoundError('User');
  return userResponse(user);
}

export async function updateProfile(userId: string, name: string) {
  const { rows } = await pool.query<UserRow>(
    'UPDATE users SET name = $1, updated_at = now() WHERE id = $2 RETURNING id, email, name, role, email_verified_at, created_at',
    [name, userId],
  );
  if (!rows[0]) throw new NotFoundError('User');
  return userResponse(rows[0]);
}

export async function verifyEmail(token: string) {
  const userId = await redis.get(VERIFY_TOKEN_PREFIX + token);
  if (!userId) throw new BadRequestError('Invalid or expired verification link');

  const { rows } = await pool.query<UserRow>(
    'UPDATE users SET email_verified_at = now() WHERE id = $1 RETURNING id, email, name, role, email_verified_at, created_at',
    [userId],
  );
  if (!rows[0]) throw new NotFoundError('User');

  await redis.del(VERIFY_TOKEN_PREFIX + token);
  return userResponse(rows[0]);
}

export async function resendVerification(userId: string) {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, email, name, email_verified_at FROM users WHERE id = $1',
    [userId],
  );
  const user = rows[0];
  if (!user) throw new NotFoundError('User');
  if (user.email_verified_at) throw new BadRequestError('Email already verified');

  const verifyToken = uuidv4();
  await redis.set(VERIFY_TOKEN_PREFIX + verifyToken, user.id, { EX: VERIFY_TOKEN_TTL });
  await sendVerificationEmail(user.email, user.name, verifyToken);
}

export async function changePassword(email: string, oldPassword: string, newPassword: string) {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, password_hash FROM users WHERE email = $1', [email],
  );
  const user = rows[0];
  if (!user) throw new UnauthorizedError('Invalid credentials');
  const valid = await verifyPassword(oldPassword, user.password_hash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');
  const newHash = await hashPassword(newPassword);
  await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [newHash, user.id]);
  await revokeAllUserTokens(user.id);
}

export async function changePasswordAuth(userId: string, oldPassword: string, newPassword: string) {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, password_hash FROM users WHERE id = $1', [userId],
  );
  const user = rows[0];
  if (!user) throw new NotFoundError('User');
  const valid = await verifyPassword(oldPassword, user.password_hash);
  if (!valid) throw new UnauthorizedError('Current password is incorrect');
  const newHash = await hashPassword(newPassword);
  await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [newHash, user.id]);
  await revokeAllUserTokens(userId);
}

export async function getPlanUsage(userId: string) {
  const { rows } = await pool.query<{ count: string; plan: string }>(
    `SELECT COUNT(*) AS count,
       COALESCE((SELECT plan FROM websites WHERE owner_id = $1 LIMIT 1), 'free') AS plan
     FROM websites WHERE owner_id = $1`,
    [userId],
  );
  const count = parseInt(rows[0]?.count ?? '0', 10);
  const plan = rows[0]?.plan ?? 'free';
  const limits = getPlanLimits(plan);
  return {
    plan,
    websites_used: count,
    websites_limit: limits.maxWebsites === Infinity ? -1 : limits.maxWebsites,
    history_days: limits.historyDays,
  };
}
