import {
  isWeakSecret,
  JWT_SECRET_PLACEHOLDER,
  validateEnv,
} from './env.validation';

/** A random-looking value, as a real deploy would generate. */
const STRONG_SECRET = 'f3K9qLx2Vb7Rt0Zm8Wn4Yc6Hd1Pj5GsQ8eA';

const validBase = {
  NODE_ENV: 'development',
  DB_HOST: 'localhost',
  DB_USER: 'taskapp',
  DB_PASSWORD: 'taskapp',
  DB_NAME: 'taskapp',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  FRONTEND_ORIGINS: 'http://localhost:3000',
};

/** Passes every production rule; individual tests break one rule at a time. */
const prodBase = {
  ...validBase,
  NODE_ENV: 'production',
  COOKIE_SECURE: 'true',
  FRONTEND_ORIGINS: 'https://app.test',
  JWT_ACCESS_SECRET: STRONG_SECRET,
  TRUST_PROXY_HOPS: '1',
};

describe('validateEnv', () => {
  it('applies defaults and parses lists and booleans', () => {
    const env = validateEnv({
      ...validBase,
      FRONTEND_ORIGINS: 'http://a.test, http://b.test',
    });
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
    expect(() =>
      validateEnv({ ...validBase, JWT_ACCESS_SECRET: 'short' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('refuses insecure cookies in production', () => {
    expect(() =>
      validateEnv({
        ...validBase,
        NODE_ENV: 'production',
        FRONTEND_ORIGINS: 'https://app.test',
        COOKIE_SECURE: 'false',
      }),
    ).toThrow(/COOKIE_SECURE/);
  });

  it('refuses http or wildcard origins in production', () => {
    const prod = {
      ...validBase,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
    };
    expect(() =>
      validateEnv({ ...prod, FRONTEND_ORIGINS: 'http://app.test' }),
    ).toThrow(/FRONTEND_ORIGINS/);
    expect(() => validateEnv({ ...prod, FRONTEND_ORIGINS: '*' })).toThrow(
      /FRONTEND_ORIGINS/,
    );
  });

  it('requires Secure when SameSite is none', () => {
    expect(() =>
      validateEnv({
        ...validBase,
        COOKIE_SAMESITE: 'none',
        COOKIE_SECURE: 'false',
      }),
    ).toThrow(/COOKIE_SAMESITE/);
  });

  it('accepts a correct production configuration', () => {
    const env = validateEnv(prodBase);
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.ENABLE_SWAGGER).toBe(false);
  });

  it('refuses the example placeholder or an obviously weak JWT secret in production', () => {
    expect(() =>
      validateEnv({ ...prodBase, JWT_ACCESS_SECRET: JWT_SECRET_PLACEHOLDER }),
    ).toThrow(/JWT_ACCESS_SECRET/);
    expect(() =>
      validateEnv({
        ...prodBase,
        JWT_ACCESS_SECRET: `${JWT_SECRET_PLACEHOLDER}-but-longer`,
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
    expect(() =>
      validateEnv({ ...prodBase, JWT_ACCESS_SECRET: 'a'.repeat(40) }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('only checks secret strength in production, so local setups keep working', () => {
    expect(() =>
      validateEnv({ ...validBase, JWT_ACCESS_SECRET: JWT_SECRET_PLACEHOLDER }),
    ).not.toThrow();
  });

  it('classifies secrets', () => {
    expect(isWeakSecret(STRONG_SECRET)).toBe(false);
    expect(isWeakSecret('changeme-changeme-changeme-changeme')).toBe(true);
  });

  it('requires at least one trusted proxy hop in production', () => {
    expect(() => validateEnv({ ...prodBase, TRUST_PROXY_HOPS: '0' })).toThrow(
      /TRUST_PROXY_HOPS/,
    );
  });

  it('requires a CA certificate when database TLS is on in production', () => {
    expect(() => validateEnv({ ...prodBase, DB_SSL: 'true' })).toThrow(
      /DB_SSL_CA/,
    );
    expect(
      validateEnv({ ...prodBase, DB_SSL: 'true', DB_SSL_CA: 'pem' }).DB_SSL,
    ).toBe(true);
  });

  it('validates the access token TTL format in every environment', () => {
    for (const ttl of ['30m', '15s', '2h', '1d']) {
      expect(
        validateEnv({ ...validBase, ACCESS_TOKEN_TTL: ttl }).ACCESS_TOKEN_TTL,
      ).toBe(ttl);
    }
    for (const ttl of ['30', '0m', '30min', '-5m', 'm', '1.5h']) {
      expect(() =>
        validateEnv({ ...validBase, ACCESS_TOKEN_TTL: ttl }),
      ).toThrow(/ACCESS_TOKEN_TTL/);
    }
  });

  it('enables Swagger by default outside production only, unless set explicitly', () => {
    expect(validateEnv(validBase).ENABLE_SWAGGER).toBe(true);
    expect(validateEnv(prodBase).ENABLE_SWAGGER).toBe(false);
    expect(
      validateEnv({ ...prodBase, ENABLE_SWAGGER: 'true' }).ENABLE_SWAGGER,
    ).toBe(true);
    expect(
      validateEnv({ ...validBase, ENABLE_SWAGGER: 'false' }).ENABLE_SWAGGER,
    ).toBe(false);
  });

  it('accepts optional seed passwords but rejects short ones', () => {
    expect(
      validateEnv({ ...validBase, SEED_ADMIN_PASSWORD: 'Admin@99999' })
        .SEED_ADMIN_PASSWORD,
    ).toBe('Admin@99999');
    expect(() =>
      validateEnv({ ...validBase, SEED_EMPLOYEE_PASSWORD: 'short' }),
    ).toThrow(/SEED_EMPLOYEE_PASSWORD/);
  });
});
