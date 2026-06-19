import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireApiKey } from '../../middleware/auth.middleware';
import { sdkRateLimit } from '../../middleware/rateLimit.middleware';
import { validate } from '../../middleware/validate.middleware';
import { pool } from '../../lib/db/pool';
import { ok } from '../../utils/response';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors';

const router = Router();
router.use(requireApiKey, sdkRateLimit);

const CACHE_HEADERS = 'public, s-maxage=60, stale-while-revalidate=300';

router.get(
  '/content/:key',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { websiteId } = req.apiKey!;
      const { rows } = await pool.query(
        `SELECT cms_key, content_type, value, metadata, version
         FROM content_items
         WHERE website_id = $1 AND cms_key = $2 AND is_published = true`,
        [websiteId, req.params['key']],
      );
      const item = rows[0];
      if (!item) throw new NotFoundError(`Content key "${req.params['key']}"`);

      res.setHeader('Cache-Control', CACHE_HEADERS);
      res.setHeader('ETag', `"${item.version}"`);
      ok(res, item);
    } catch (err) { next(err); }
  },
);

const batchSchema = z.object({
  keys: z.array(z.string().min(1)).min(1).max(50),
});

router.post(
  '/content/batch',
  validate({ body: batchSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { websiteId } = req.apiKey!;
      const { keys }: { keys: string[] } = req.body;

      const { rows } = await pool.query(
        `SELECT cms_key, content_type, value, metadata, version
         FROM content_items
         WHERE website_id = $1 AND cms_key = ANY($2) AND is_published = true`,
        [websiteId, keys],
      );

      const dataMap: Record<string, unknown> = {};
      for (const row of rows) dataMap[row.cms_key] = row;

      const missing = keys.filter((k) => !dataMap[k]);
      ok(res, { data: dataMap, missing });
    } catch (err) { next(err); }
  },
);

router.get(
  '/media/:key',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { websiteId } = req.apiKey!;
      const { rows } = await pool.query(
        `SELECT cms_key, content_type, value AS url, metadata
         FROM content_items
         WHERE website_id = $1 AND cms_key = $2
           AND content_type = 'image' AND is_published = true`,
        [websiteId, req.params['key']],
      );
      const item = rows[0];
      if (!item) throw new NotFoundError(`Media key "${req.params['key']}"`);

      // Apply transform params to URL if CDN supports them
      const { w, format } = req.query;
      let url: string = item.url ?? '';
      if (w || format) {
        const params = new URLSearchParams();
        if (w) params.set('w', String(w));
        if (format) params.set('format', String(format));
        url = `${url}?${params.toString()}`;
      }

      res.setHeader('Cache-Control', CACHE_HEADERS);
      ok(res, { ...item, url });
    } catch (err) { next(err); }
  },
);

export { router as sdkRouter };
