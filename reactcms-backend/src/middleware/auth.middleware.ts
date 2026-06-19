import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { pool } from '../lib/db/pool';
import { sha256 } from '../utils/hash';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import type { MemberRole } from '../types';

/** Require a valid JWT access token. Populates req.user. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedError();

    const token = header.slice(7);
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role as 'superadmin' | 'user' };
    next();
  } catch {
    next(new UnauthorizedError());
  }
}

/** Require superadmin role on req.user */
export function requireSuperAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.user?.role !== 'superadmin') return next(new ForbiddenError());
  next();
}

/**
 * Require that the authenticated user is a member (or owner) of the website
 * identified by req.params.id. Optionally enforce a minimum role.
 * Populates req.websiteId and req.memberRole.
 */
export function requireWebsiteMember(minRole?: MemberRole) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) return next(new UnauthorizedError());

      const websiteId = req.params['id'] ?? req.params['websiteId'];
      if (!websiteId) return next(new ForbiddenError());

      // Superadmins bypass membership checks
      if (req.user.role === 'superadmin') {
        req.websiteId = websiteId;
        req.memberRole = 'admin';
        return next();
      }

      // Check ownership first (owners have implicit admin rights)
      const ownerCheck = await pool.query<{ id: string }>(
        `SELECT id FROM websites WHERE id = $1 AND owner_id = $2`,
        [websiteId, req.user.id],
      );

      if (ownerCheck.rows.length > 0) {
        req.websiteId = websiteId;
        req.memberRole = 'admin';
        return next();
      }

      // Check explicit membership
      const memberCheck = await pool.query<{ role: MemberRole; accepted_at: string | null }>(
        `SELECT role, accepted_at FROM website_members
         WHERE website_id = $1 AND user_id = $2`,
        [websiteId, req.user.id],
      );

      const member = memberCheck.rows[0];
      if (!member || !member.accepted_at) return next(new ForbiddenError());

      const roleRank: Record<MemberRole, number> = { admin: 3, editor: 2, viewer: 1 };
      if (minRole && roleRank[member.role] < roleRank[minRole]) {
        return next(new ForbiddenError(`Requires ${minRole} role or above`));
      }

      req.websiteId = websiteId;
      req.memberRole = member.role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Require a valid API key in the X-CMS-Key header.
 * Populates req.apiKey. For use on /sdk/* routes only.
 */
export async function requireApiKey(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const raw = req.headers['x-cms-key'];
    if (typeof raw !== 'string' || !raw) throw new UnauthorizedError();

    const hash = sha256(raw);
    const { rows } = await pool.query<{
      id: string;
      website_id: string;
      scope: 'read' | 'write';
      expires_at: string | null;
    }>(
      `SELECT id, website_id, scope, expires_at FROM api_keys WHERE key_hash = $1`,
      [hash],
    );

    const key = rows[0];
    if (!key) throw new UnauthorizedError('Invalid API key');

    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      throw new UnauthorizedError('API key expired');
    }

    // Fire-and-forget: update last_used_at
    pool.query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [key.id]);

    req.apiKey = { id: key.id, websiteId: key.website_id, scope: key.scope };
    next();
  } catch (err) {
    next(err);
  }
}
