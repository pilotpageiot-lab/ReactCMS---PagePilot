import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  API_BASE_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),
  DB_POOL_MIN: z.coerce.number().default(2),
  DB_POOL_MAX: z.coerce.number().default(10),

  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  BCRYPT_ROUNDS: z.coerce.number().default(12),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('eu-west-1'),
  CDN_BASE_URL: z.string().url().optional(),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().default('noreply@pagepilot.io'),
  DASHBOARD_URL: z.string().url().default('http://localhost:5173'),

  RATE_LIMIT_AUTH_MAX: z.coerce.number().default(5),
  RATE_LIMIT_API_MAX: z.coerce.number().default(120),
  RATE_LIMIT_SDK_MAX: z.coerce.number().default(500),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
