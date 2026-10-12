import { z } from 'zod';

/** "true"/"false" strings from process.env → boolean, with an explicit default. */
const bool = (defaultValue: boolean) =>
  z.preprocess(
    (v) =>
      v === undefined || v === '' ? defaultValue : v === true || v === 'true',
    z.boolean(),
  );

/** Like `bool`, but unset stays `undefined` so the default can depend on other variables. */
const optionalBool = z.preprocess(
  (v) => (v === undefined || v === '' ? undefined : v === true || v === 'true'),
  z.boolean().optional(),
);

/** The value shipped in .env.example. A deploy that still carries it would sign tokens with a public secret. */
export const JWT_SECRET_PLACEHOLDER =
  'replace-with-a-random-string-of-at-least-32-characters';

/** Fragments that only appear in copied examples or hand-typed secrets, never in generated random values. */
const WEAK_SECRET_MARKERS = [
  'replace-with',
  'changeme',
  'change-me',
  'placeholder',
  'example',
  'your-secret',
];
const MIN_DISTINCT_SECRET_CHARS = 10;

/** True for secrets that are long enough to pass the length check but obviously not random. */
export function isWeakSecret(secret: string): boolean {
  const lower = secret.toLowerCase();
  return (
    secret === JWT_SECRET_PLACEHOLDER ||
    WEAK_SECRET_MARKERS.some((marker) => lower.includes(marker)) ||
    new Set(secret).size < MIN_DISTINCT_SECRET_CHARS
  );
}

/**
 * Durations accepted by jsonwebtoken's `expiresIn` that we allow. A bare number string ("60") would be read as
 * milliseconds by the `ms` library and yield an already-expired token, so a unit is mandatory and zero is refused.
 */
const TTL_PATTERN = /^[1-9]\d*(s|m|h|d)$/;

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(4000),

    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive().default(3306),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string(),
    DB_NAME: z.string().min(1),
    DB_SSL: bool(false),
    DB_SSL_CA: z.string().optional(),

    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
    ACCESS_TOKEN_TTL: z
      .string()
      .regex(
        TTL_PATTERN,
        'must be a positive integer with a unit: s, m, h or d (e.g. 30m)',
      )
      .default('30m'),
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
    // Unset means "on outside production": the API surface map should not be published by default.
    ENABLE_SWAGGER: optionalBool,

    // Read only by the seed script; unset keeps the documented demo passwords.
    SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
    SEED_EMPLOYEE_PASSWORD: z.string().min(8).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.COOKIE_SAMESITE === 'none' && !env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SAMESITE'],
        message: 'SameSite=none requires COOKIE_SECURE=true',
      });
    }
    if (env.NODE_ENV === 'production') {
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({
          code: 'custom',
          path: ['COOKIE_SECURE'],
          message: 'must be true in production',
        });
      }
      if (
        env.FRONTEND_ORIGINS.some(
          (origin) => !origin.startsWith('https://') || origin.includes('*'),
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['FRONTEND_ORIGINS'],
          message:
            'production origins must be https:// and must not contain wildcards',
        });
      }
      if (isWeakSecret(env.JWT_ACCESS_SECRET)) {
        ctx.addIssue({
          code: 'custom',
          path: ['JWT_ACCESS_SECRET'],
          message:
            'looks like the example placeholder or a hand-typed value; generate a random secret',
        });
      }
      // Behind Render (and the Vercel proxy) zero hops makes every request look like it came from the proxy, so all
      // users would share one rate-limit bucket.
      if (env.TRUST_PROXY_HOPS < 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['TRUST_PROXY_HOPS'],
          message:
            'must be at least 1 in production (the API runs behind a proxy)',
        });
      }
      if (env.DB_SSL && !env.DB_SSL_CA) {
        ctx.addIssue({
          code: 'custom',
          path: ['DB_SSL_CA'],
          message: 'is required in production when DB_SSL=true',
        });
      }
    }
  })
  .transform((env) => ({
    ...env,
    ENABLE_SWAGGER: env.ENABLE_SWAGGER ?? env.NODE_ENV !== 'production',
  }));

export type Env = z.infer<typeof envSchema>;

/** Validates raw process.env once at boot so a misconfigured deploy fails loudly instead of at first request. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(
      `Invalid environment configuration:\n${problems.join('\n')}`,
    );
  }
  return result.data;
}
