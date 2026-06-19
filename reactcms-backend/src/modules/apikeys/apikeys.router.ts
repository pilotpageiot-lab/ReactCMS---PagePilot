import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, requireWebsiteMember } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { apiRateLimit } from '../../middleware/rateLimit.middleware';
import * as apiKeysService from './apikeys.service';
import { ok, created, noContent } from '../../utils/response';

const createKeySchema = z.object({
  label: z.string().min(1).max(100),
  scope: z.enum(['read', 'write']),
  expires_at: z.string().datetime().nullable().optional(),
});

const router = Router({ mergeParams: true });
router.use(requireAuth, apiRateLimit, requireWebsiteMember('admin'));

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ok(res, await apiKeysService.listKeys(req.websiteId!));
  } catch (err) { next(err); }
});

router.post(
  '/',
  validate({ body: createKeySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      created(res, await apiKeysService.createKey(req.websiteId!, req.body));
    } catch (err) { next(err); }
  },
);

router.delete('/:kid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await apiKeysService.revokeKey(req.websiteId!, req.params['kid']!);
    noContent(res);
  } catch (err) { next(err); }
});

export { router as apiKeysRouter };
