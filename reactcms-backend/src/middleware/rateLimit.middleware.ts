import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../lib/redis';
import { config } from '../config';

const windowMs = 60 * 1000;

// Shared Redis-backed store — counters survive across all instances
function makeStore(prefix: string) {
  return new RedisStore({
    sendCommand: (...args: string[]) => (redis as any).sendCommand(args),
    prefix: `rl:${prefix}:`,
  });
}

function limitMsg(message: string) {
  return { error: 'RATE_LIMITED', message };
}

/** Auth endpoints — 5 req/min per IP (brute-force guard) */
export const authRateLimit = rateLimit({
  windowMs,
  max: config.RATE_LIMIT_AUTH_MAX,
  store: makeStore('auth'),
  keyGenerator: (req) => req.ip ?? 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMsg('Too many attempts. Please wait and try again.'),
});

/** Refresh token endpoint — 10 req/min per IP */
export const refreshRateLimit = rateLimit({
  windowMs,
  max: 10,
  store: makeStore('refresh'),
  keyGenerator: (req) => req.ip ?? 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMsg('Too many refresh attempts.'),
});

/** Management API — 120 req/min per user */
export const apiRateLimit = rateLimit({
  windowMs,
  max: config.RATE_LIMIT_API_MAX,
  store: makeStore('api'),
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMsg('API rate limit exceeded.'),
});

/** SDK routes — 500 req/min per API key */
export const sdkRateLimit = rateLimit({
  windowMs,
  max: config.RATE_LIMIT_SDK_MAX,
  store: makeStore('sdk'),
  keyGenerator: (req) => req.apiKey?.id ?? req.ip ?? 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMsg('SDK rate limit exceeded.'),
});

/** Catch-all for unauthenticated public requests */
export const publicRateLimit = rateLimit({
  windowMs,
  max: 20,
  store: makeStore('pub'),
  keyGenerator: (req) => req.ip ?? 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
});
