import { z } from 'zod';

/** "true"/"false" strings from process.env → boolean, with an explicit default. */
const bool = (defaultValue: boolean) =>
  z.preprocess((v) => (v === undefined || v === '' ? defaultValue : String(v) === 'true'), z.boolean());

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),

    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive().default(3306),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string(),
    DB_NAME: z.string().min(1),
    DB_SSL: bool(false),
    DB_SSL_CA: z.string().optional(),

    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
    ACCESS_TOKEN_TTL: z.string().min(2).default('30m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(365),

    COOKIE_SECURE: bool(false),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    FRONTEND_ORIGINS: z
      .string()
      .min(1)
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    THROTTLING_ENABLED: bool(true),
  })
  .superRefine((env, ctx) => {
    if (env.COOKIE_SAMESITE === 'none' && !env.COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SAMESITE'], message: 'SameSite=none requires COOKIE_SECURE=true' });
    }
    if (env.NODE_ENV === 'production') {
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'must be true in production' });
      }
      if (env.FRONTEND_ORIGINS.some((origin) => !origin.startsWith('https://') || origin.includes('*'))) {
        ctx.addIssue({
          code: 'custom',
          path: ['FRONTEND_ORIGINS'],
          message: 'production origins must be https:// and must not contain wildcards',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Validates raw process.env once at boot so a misconfigured deploy fails loudly instead of at first request. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  return result.data;
}
