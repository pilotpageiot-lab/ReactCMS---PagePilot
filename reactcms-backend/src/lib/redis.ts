import { createClient } from 'redis';
import { config } from '../config';
import { logger } from './logger';

export const redis = createClient({ url: config.REDIS_URL });

redis.on('error', (err) =>
  logger.error('Redis client error', { error: err.message }),
);

export async function connectRedis(): Promise<void> {
  await redis.connect();
  logger.info('Redis connected');
}

/** Store a refresh token family for rotation tracking */
export async function storeRefreshToken(
  userId: string,
  tokenId: string,
  ttlSeconds: number,
): Promise<void> {
  await redis.set(`rt:${userId}:${tokenId}`, '1', { EX: ttlSeconds });
}

/** Returns true if the token is valid (exists and not rotated) */
export async function validateRefreshToken(
  userId: string,
  tokenId: string,
): Promise<boolean> {
  const val = await redis.get(`rt:${userId}:${tokenId}`);
  return val === '1';
}

/** Invalidate a specific refresh token */
export async function revokeRefreshToken(
  userId: string,
  tokenId: string,
): Promise<void> {
  await redis.del(`rt:${userId}:${tokenId}`);
}

/** Invalidate all refresh tokens for a user (e.g. on password change) */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  const keys = await redis.keys(`rt:${userId}:*`);
  if (keys.length > 0) await redis.del(keys);
}
