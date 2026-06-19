/**
 * Rate limiting for the public API.
 *
 * Three tiers, applied in order — first match wins:
 *
 *   Tier 1 — per API key, per route class (single / batch)
 *     Single:  500 req / 60s   (CDN handles most; this is origin budget)
 *     Batch:    60 req / 60s   (heavier DB load)
 *
 *   Tier 2 — per IP, for unauthenticated or unresolved requests
 *     20 req / 60s
 *
 *   Tier 3 — global circuit breaker per website
 *     2000 req / 60s  (prevent one tenant from starving others)
 *
 * We use express-rate-limit with an in-memory store (suitable for single-node
 * or when Redis-backed store is not wired in). The middleware stacks so all
 * three checks run on every public request.
 *
 * Response on limit breach:
 *   HTTP 429
 *   Retry-After: <seconds>
 *   X-RateLimit-Limit / Remaining / Reset (standard headers)
 */
import rateLimit, { Options } from 'express-rate-limit';
import { Request } from 'express';

const WINDOW_MS = 60 * 1_000; // 1 minute

function rateLimitResponse(message: string) {
  return {
    error: 'RATE_LIMITED',
    message,
    hint: 'See Retry-After header for when to retry.',
  };
}

// ── Tier 1a: per API key — single content fetch ──────────────────────────────

export const singleKeyRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  max: 500,
  keyGenerator: (req: Request) =>
    `pub:single:${req.apiKey?.id ?? req.ip ?? 'unknown'}`,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.apiKey, // unauthenticated falls through to IP limiter
  message: rateLimitResponse(
    'Single content fetch rate limit exceeded (500/min per API key).',
  ),
} as Partial<Options> as Options);

// ── Tier 1b: per API key — batch fetch ───────────────────────────────────────

export const batchKeyRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  max: 60,
  keyGenerator: (req: Request) =>
    `pub:batch:${req.apiKey?.id ?? req.ip ?? 'unknown'}`,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.apiKey,
  message: rateLimitResponse(
    'Batch content fetch rate limit exceeded (60/min per API key).',
  ),
} as Partial<Options> as Options);

// ── Tier 2: per IP fallback ───────────────────────────────────────────────────

export const ipFallbackRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  max: 20,
  keyGenerator: (req: Request) => `pub:ip:${req.ip ?? 'unknown'}`,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !!req.apiKey, // skip if auth succeeded
  message: rateLimitResponse(
    'Unauthenticated rate limit exceeded (20/min per IP).',
  ),
} as Partial<Options> as Options);

// ── Tier 3: per website circuit breaker ──────────────────────────────────────

export const websiteCircuitBreaker = rateLimit({
  windowMs: WINDOW_MS,
  max: 2000,
  keyGenerator: (req: Request) =>
    `pub:website:${req.apiKey?.websiteId ?? 'unknown'}`,
  standardHeaders: false, // don't expose internal circuit-breaker headers
  legacyHeaders: false,
  skip: (req) => !req.apiKey?.websiteId,
  message: rateLimitResponse(
    'Website request budget exceeded. Please contact support.',
  ),
} as Partial<Options> as Options);
