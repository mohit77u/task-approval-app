import { validateEnv } from './env.validation';

const validBase = {
  NODE_ENV: 'development',
  DB_HOST: 'localhost',
  DB_USER: 'taskapp',
  DB_PASSWORD: 'taskapp',
  DB_NAME: 'taskapp',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  FRONTEND_ORIGINS: 'http://localhost:3000',
};

describe('validateEnv', () => {
  it('applies defaults and parses lists and booleans', () => {
    const env = validateEnv({ ...validBase, FRONTEND_ORIGINS: 'http://a.test, http://b.test' });
    expect(env.PORT).toBe(4000);
    expect(env.DB_PORT).toBe(3306);
    expect(env.ACCESS_TOKEN_TTL).toBe('30m');
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(365);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.THROTTLING_ENABLED).toBe(true);
    expect(env.FRONTEND_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('fails fast when a required variable is missing', () => {
    const { DB_HOST: _omit, ...rest } = validBase;
    expect(() => validateEnv(rest)).toThrow(/DB_HOST/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...validBase, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('refuses insecure cookies in production', () => {
    expect(() =>
      validateEnv({ ...validBase, NODE_ENV: 'production', FRONTEND_ORIGINS: 'https://app.test', COOKIE_SECURE: 'false' }),
    ).toThrow(/COOKIE_SECURE/);
  });

  it('refuses http or wildcard origins in production', () => {
    const prod = { ...validBase, NODE_ENV: 'production', COOKIE_SECURE: 'true' };
    expect(() => validateEnv({ ...prod, FRONTEND_ORIGINS: 'http://app.test' })).toThrow(/FRONTEND_ORIGINS/);
    expect(() => validateEnv({ ...prod, FRONTEND_ORIGINS: '*' })).toThrow(/FRONTEND_ORIGINS/);
  });

  it('requires Secure when SameSite is none', () => {
    expect(() => validateEnv({ ...validBase, COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SAMESITE/);
  });

  it('accepts a correct production configuration', () => {
    const env = validateEnv({ ...validBase, NODE_ENV: 'production', COOKIE_SECURE: 'true', FRONTEND_ORIGINS: 'https://app.test' });
    expect(env.COOKIE_SECURE).toBe(true);
  });
});
