import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  email: z.string().email(),
  old_password: z.string().min(1),
  new_password: z.string().min(8).max(128),
});

export const updatePasswordSchema = z.object({
  old_password: z.string().min(1),
  new_password: z.string().min(8).max(128),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100),
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
