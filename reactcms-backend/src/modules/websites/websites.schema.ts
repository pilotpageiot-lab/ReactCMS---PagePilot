import { z } from 'zod';

export const createWebsiteSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  plan: z.enum(['free', 'pro', 'enterprise']).default('free'),
});

export const updateWebsiteSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  custom_domain: z.string().url().nullable().optional(),
  is_active: z.boolean().optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'editor', 'viewer']),
});

export type CreateWebsiteDto = z.infer<typeof createWebsiteSchema>;
export type UpdateWebsiteDto = z.infer<typeof updateWebsiteSchema>;
export type InviteMemberDto = z.infer<typeof inviteMemberSchema>;
