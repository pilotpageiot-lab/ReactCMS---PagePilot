import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireWebsiteMember } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { apiRateLimit } from '../../middleware/rateLimit.middleware';
import {
  upsertContentSchema,
  publishContentSchema,
  listContentQuerySchema,
} from './content.schema';
import * as contentService from './content.service';
import { fetchAndScanHtml } from './content.scan';
import { ok, created, noContent, paginated } from '../../utils/response';
import { z } from 'zod';

const router = Router({ mergeParams: true });
router.use(requireAuth, apiRateLimit);

router.get(
  '/',
  requireWebsiteMember('viewer'),
  validate({ query: listContentQuerySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await contentService.listContent(req.websiteId!, req.query as any);
      paginated(res, result.data, result.total, result.page, result.per_page);
    } catch (err) { next(err); }
  },
);

// ── Scan website HTML for text elements ──────────────────────────────────────

const scanBodySchema = z.object({
  url: z.string().url(),
});

router.post(
  '/scan',
  requireWebsiteMember('editor'),
  validate({ body: scanBodySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url } = req.body as z.infer<typeof scanBodySchema>;
      const items = await fetchAndScanHtml(url);

      const existingKeys = await contentService.getExistingKeys(req.websiteId!);
      const existingSet = new Set(existingKeys);

      const results = items.map((item) => ({
        ...item,
        exists: existingSet.has(item.key),
      }));

      ok(res, { items: results, total: results.length, new_count: results.filter((r) => !r.exists).length });
    } catch (err) { next(err); }
  },
);

// ── Bulk import discovered items ─────────────────────────────────────────────

const importBatchItemSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.string().max(10_000),
  content_type: z.enum(['text', 'richtext']).default('text'),
});

const importBatchSchema = z.object({
  items: z.array(importBatchItemSchema).min(1).max(200),
});

router.post(
  '/import-batch',
  requireWebsiteMember('editor'),
  validate({ body: importBatchSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { items } = req.body as z.infer<typeof importBatchSchema>;
      const result = await contentService.importBatch(req.websiteId!, req.user!.id, items);
      ok(res, result);
    } catch (err) { next(err); }
  },
);

router.delete(
  '/all',
  requireWebsiteMember('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const count = await contentService.deleteAll(req.websiteId!);
      ok(res, { deleted: count });
    } catch (err) { next(err); }
  },
);

router.get(
  '/:key',
  requireWebsiteMember('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const draft = req.query['draft'] === 'true';
      ok(res, await contentService.getContent(req.websiteId!, req.params['key']!, draft));
    } catch (err) { next(err); }
  },
);

router.patch(
  '/:key',
  requireWebsiteMember('editor'),
  validate({ body: upsertContentSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await contentService.upsertContent(
        req.websiteId!,
        req.params['key']!,
        req.user!.id,
        req.body,
      ));
    } catch (err) { next(err); }
  },
);

router.delete(
  '/:key',
  requireWebsiteMember('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await contentService.deleteContent(req.websiteId!, req.params['key']!);
      noContent(res);
    } catch (err) { next(err); }
  },
);

router.post(
  '/:key/publish',
  requireWebsiteMember('editor'),
  validate({ body: publishContentSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await contentService.publishContent(req.websiteId!, req.params['key']!, req.body));
    } catch (err) { next(err); }
  },
);

router.get(
  '/:key/versions',
  requireWebsiteMember('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await contentService.listVersions(req.websiteId!, req.params['key']!));
    } catch (err) { next(err); }
  },
);

router.post(
  '/:key/restore/:version',
  requireWebsiteMember('editor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const version = parseInt(req.params['version']!, 10);
      ok(res, await contentService.restoreVersion(req.websiteId!, req.params['key']!, version, req.user!.id));
    } catch (err) { next(err); }
  },
);

export { router as contentRouter };
