import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireWebsiteMember } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { apiRateLimit } from '../../middleware/rateLimit.middleware';
import {
  createWebsiteSchema,
  updateWebsiteSchema,
  inviteMemberSchema,
} from './websites.schema';
import * as websitesService from './websites.service';
import { ok, created, noContent } from '../../utils/response';
import { BadRequestError } from '../../utils/errors';
import { z } from 'zod';

const router = Router();
router.use(requireAuth, apiRateLimit);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ok(res, await websitesService.listWebsites(req.user!.id));
  } catch (err) { next(err); }
});

router.post(
  '/',
  validate({ body: createWebsiteSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      created(res, await websitesService.createWebsite(req.user!.id, req.body));
    } catch (err) { next(err); }
  },
);

router.get(
  '/:id',
  requireWebsiteMember('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await websitesService.getWebsite(req.websiteId!));
    } catch (err) { next(err); }
  },
);

router.patch(
  '/:id',
  requireWebsiteMember('admin'),
  validate({ body: updateWebsiteSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await websitesService.updateWebsite(req.websiteId!, req.body));
    } catch (err) { next(err); }
  },
);

router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.query['confirm'] !== 'true') {
        throw new BadRequestError('Add ?confirm=true to confirm deletion');
      }
      await websitesService.deleteWebsite(req.user!.id, req.params['id']!);
      noContent(res);
    } catch (err) { next(err); }
  },
);

// ── Invites (for the logged-in user) ──────────────────────────────────────────

router.get('/invites/pending', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ok(res, await websitesService.listPendingInvites(req.user!.id));
  } catch (err) { next(err); }
});

router.post('/invites/:websiteId/accept', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ok(res, await websitesService.acceptInvite(req.user!.id, req.params['websiteId']!));
  } catch (err) { next(err); }
});

router.post('/invites/:websiteId/decline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await websitesService.declineInvite(req.user!.id, req.params['websiteId']!);
    noContent(res);
  } catch (err) { next(err); }
});

// ── Members ────────────────────────────────────────────

router.get(
  '/:id/members',
  requireWebsiteMember('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await websitesService.listMembers(req.websiteId!));
    } catch (err) { next(err); }
  },
);

router.post(
  '/:id/members',
  requireWebsiteMember('admin'),
  validate({ body: inviteMemberSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      created(res, await websitesService.inviteMember(req.websiteId!, req.body, req.user!.id));
    } catch (err) { next(err); }
  },
);

router.delete(
  '/:id/members/:uid',
  requireWebsiteMember('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await websitesService.removeMember(
        req.websiteId!,
        req.params['uid']!,
        req.user!.id,
      );
      noContent(res);
    } catch (err) { next(err); }
  },
);

export { router as websitesRouter };
