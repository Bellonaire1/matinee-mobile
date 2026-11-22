import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from .env if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const strictBooleanSchema = z.preprocess((val) => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0' || s === '') return false;
  }
  return false;
}, z.boolean());

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    API_PREFIX: z.string().default('/api/v1'),
    CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:8081'),

    // PostgreSQL Connection String (Prisma)
    DATABASE_URL: z
      .string()
      .url()
      .default('postgresql://postgres:postgres@localhost:5432/matinee_db?schema=public'),

    // Redis Connection String (Milestone M05.2+)
    REDIS_URL: z.string().default('redis://localhost:6379'),

    // Authentication & Session Secrets (Future Auth Module)
    JWT_SECRET: z.string().min(16).default('development-jwt-secret-placeholder-minimum-16-chars'),
    JWT_EXPIRES_IN: z.string().default('7d'),

    // The Movie Database (TMDB) API Proxy (Milestone M05.2)
    TMDB_API_KEY: z.string().default('placeholder_tmdb_api_key'),
    TMDB_ACCESS_TOKEN: z.string().default('placeholder_tmdb_access_token'),
    TMDB_BASE_URL: z.string().url().default('https://api.themoviedb.org/3'),
    TMDB_IMAGE_BASE_URL: z.string().url().default('https://image.tmdb.org/t/p'),

    // Payment Gateway Configuration (Milestone M05.6)
    PAYMENT_ENABLED: strictBooleanSchema.default(false),
    PAYMENT_PROVIDER: z.string().default('TEST_GATEWAY'),
    PAYMENT_TEST_SECRET_KEY: z.string().default('test_sk_placeholder'),
    PAYMENT_WEBHOOK_SECRET: z.string().default('test_whsec_placeholder'),
  })
  .superRefine((data, ctx) => {
    if (data.PAYMENT_ENABLED) {
      if (
        data.NODE_ENV === 'production' &&
        (data.PAYMENT_PROVIDER === 'TEST_GATEWAY' || data.PAYMENT_PROVIDER === 'PAYSTACK_TEST')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PAYMENT_PROVIDER'],
          message: `Test payment provider (${data.PAYMENT_PROVIDER}) cannot be enabled in production environment`,
        });
      }

      if (
        !data.PAYMENT_TEST_SECRET_KEY ||
        data.PAYMENT_TEST_SECRET_KEY === 'test_sk_placeholder' ||
        data.PAYMENT_TEST_SECRET_KEY.trim() === ''
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PAYMENT_TEST_SECRET_KEY'],
          message:
            'PAYMENT_TEST_SECRET_KEY must be configured with a non-placeholder secret when PAYMENT_ENABLED is true',
        });
      }

      if (
        !data.PAYMENT_WEBHOOK_SECRET ||
        data.PAYMENT_WEBHOOK_SECRET === 'test_whsec_placeholder' ||
        data.PAYMENT_WEBHOOK_SECRET.trim() === ''
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PAYMENT_WEBHOOK_SECRET'],
          message:
            'PAYMENT_WEBHOOK_SECRET must be configured with a non-placeholder secret when PAYMENT_ENABLED is true',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    const formatted = parsed.error.format();
    throw new Error(`Invalid environment configuration: ${JSON.stringify(formatted)}`);
  }

  return parsed.data;
}

export const env: Env = parseEnv();

