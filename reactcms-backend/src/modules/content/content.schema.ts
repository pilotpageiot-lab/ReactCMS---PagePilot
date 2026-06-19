import { z } from 'zod';

// SECURITY FIX: per-type value size limits
const VALUE_LIMITS: Record<string, number> = {
  text:     10_000,
  richtext: 100_000,
  image:    2_048,
  json:     50_000,
};

export const upsertContentSchema = z.object({
  content_type: z.enum(['text', 'richtext', 'image', 'json']).default('text'),
  value: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
}).superRefine((data, ctx) => {
  if (data.value && data.content_type) {
    const limit = VALUE_LIMITS[data.content_type] ?? 10_000;
    if (data.value.length > limit) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        type: 'string',
        maximum: limit,
        inclusive: true,
        message: `${data.content_type} value must be ≤ ${limit} characters`,
        path: ['value'],
      });
    }
  }
  // Metadata size guard
  const metaSize = JSON.stringify(data.metadata ?? {}).length;
  if (metaSize > 10_000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'metadata must be ≤ 10,000 characters when serialised',
      path: ['metadata'],
    });
  }
});

export const publishContentSchema = z.object({
  scheduled_at: z.string().datetime().nullable().optional(),
});

export const listContentQuerySchema = z.object({
  type: z.enum(['text', 'richtext', 'image', 'json']).optional(),
  published: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().min(1).default(1),
  per_page: z.coerce.number().min(1).max(200).default(50),
});

export type UpsertContentDto = z.infer<typeof upsertContentSchema>;
export type PublishContentDto = z.infer<typeof publishContentSchema>;
export type ListContentQuery = z.infer<typeof listContentQuerySchema>;
