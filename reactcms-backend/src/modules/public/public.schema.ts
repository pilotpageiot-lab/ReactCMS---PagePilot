import { z } from 'zod';

/** GET /public/content?website_id=xxx&key=hero_title */
export const singleContentQuerySchema = z.object({
  website_id: z
    .string({ required_error: 'website_id is required' })
    .uuid({ message: 'website_id must be a valid UUID' }),
  key: z
    .string({ required_error: 'key is required' })
    .min(1, 'key cannot be empty')
    .max(200, 'key too long')
    .regex(
      /^[a-zA-Z0-9_\-\.]+$/,
      'key may only contain letters, numbers, underscores, hyphens, and dots',
    ),
  /** Optional: accept a draft preview token (write-scoped API key) */
  preview: z.coerce.boolean().default(false),
});

/** GET /public/content/batch?website_id=xxx&keys=hero_title,hero_subtitle */
export const batchContentQuerySchema = z.object({
  website_id: z
    .string({ required_error: 'website_id is required' })
    .uuid({ message: 'website_id must be a valid UUID' }),
  keys: z
    .string({ required_error: 'keys is required' })
    .transform((val) =>
      val
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string().min(1).max(200))
        .min(1, 'At least one key required')
        .max(50, 'Maximum 50 keys per batch request'),
    ),
  preview: z.coerce.boolean().default(false),
});

export type SingleContentQuery = z.infer<typeof singleContentQuerySchema>;
export type BatchContentQuery = z.infer<typeof batchContentQuerySchema>;
