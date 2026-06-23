import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { authRateLimit, refreshRateLimit } from '../../middleware/rateLimit.middleware';
import { registerSchema, loginSchema, changePasswordSchema, updatePasswordSchema } from './auth.schema';
import * as authService from './auth.service';
import { ok, created, noContent } from '../../utils/response';

const router = Router();

const REFRESH_COOKIE = 'reactcms_refresh';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env['NODE_ENV'] === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

router.post(
  '/register',
  authRateLimit,
  validate({ body: registerSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.register(req.body);
      res.cookie(REFRESH_COOKIE, result.refresh_token, COOKIE_OPTS);
      created(res, { user: result.user, access_token: result.access_token });
    } catch (err) { next(err); }
  },
);

router.post(
  '/login',
  authRateLimit,
  validate({ body: loginSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.login(req.body);
      res.cookie(REFRESH_COOKIE, result.refresh_token, COOKIE_OPTS);
      ok(res, { user: result.user, access_token: result.access_token });
    } catch (err) { next(err); }
  },
);

// SECURITY FIX: refresh now has its own rate limiter
router.post(
  '/refresh',
  refreshRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.cookies[REFRESH_COOKIE];
      const result = await authService.refresh(token);
      res.cookie(REFRESH_COOKIE, result.refresh_token, COOKIE_OPTS);
      ok(res, { access_token: result.access_token, expires_in: result.expires_in });
    } catch (err) { next(err); }
  },
);

router.post(
  '/logout',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.logout(req.user!.id, req.cookies[REFRESH_COOKIE]);
      res.clearCookie(REFRESH_COOKIE);
      noContent(res);
    } catch (err) { next(err); }
  },
);

router.get(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.getMe(req.user!.id);
      ok(res, user);
    } catch (err) { next(err); }
  },
);

// Unauthenticated password reset (login page — requires email + old password)
router.post(
  '/change-password',
  authRateLimit,
  validate({ body: changePasswordSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.changePassword(req.body.email, req.body.old_password, req.body.new_password);
      ok(res, { message: 'Password changed successfully' });
    } catch (err) { next(err); }
  },
);

// Authenticated password change (settings page)
router.patch(
  '/password',
  requireAuth,
  validate({ body: updatePasswordSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.changePasswordAuth(req.user!.id, req.body.old_password, req.body.new_password);
      ok(res, { message: 'Password updated successfully' });
    } catch (err) { next(err); }
  },
);

// Plan usage for the authenticated user
router.get(
  '/plan-usage',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await authService.getPlanUsage(req.user!.id));
    } catch (err) { next(err); }
  },
);

// Verify email address via token
router.post(
  '/verify-email',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.body as { token?: string };
      if (!token) { res.status(400).json({ error: 'BAD_REQUEST', message: 'token required' }); return; }
      const user = await authService.verifyEmail(token);
      ok(res, { message: 'Email verified', user });
    } catch (err) { next(err); }
  },
);

// Resend verification email (authenticated)
router.post(
  '/resend-verification',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.resendVerification(req.user!.id);
      ok(res, { message: 'Verification email sent' });
    } catch (err) { next(err); }
  },
);

export { router as authRouter };
