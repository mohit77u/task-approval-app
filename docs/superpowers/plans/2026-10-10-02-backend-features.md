# Backend Features Implementation Plan (Plan 2 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every backend feature: security layer (tokens, cookies, guards, throttling), auth with rotating refresh tokens, users/roles, task CRUD with role scoping, the transition workflow with history and comments, dashboard, health, and hardening tests.

**Architecture:** A `SecurityModule` owns all global guards in one deliberate order (origin → JWT → throttler → roles). Feature modules (`auth`, `users`, `tasks`, `comments`, `dashboard`, `health`) keep controllers thin and put rules in services. `TasksService.createScopedQuery` is the single place that decides which tasks a viewer may see; list, detail, comments, history and dashboard all build on it.

**Tech Stack:** NestJS, TypeORM (MySQL), `@nestjs/jwt`, `@nestjs/throttler`, bcrypt, class-validator, Jest + supertest.

**Spec:** `docs/superpowers/specs/2026-10-10-task-approval-design.md` · **Depends on:** Plan 01 (completed).

## Global Constraints

- Same constraints as Plan 01 (strict TS, no `any`, `/api` prefix, error contract and codes, enums, token and cookie rules, migrations only, conventional commits with the session's attribution trailer).
- Cookies: `access_token` (Path `/api`), `refresh_token` (Path `/api/auth`), HttpOnly, `Secure`/`SameSite` from env, Max-Age 1 year for both.
- Throttling: global 100/min; login 5/min keyed by `email|ip`; refresh 30/min; transitions 20/min; comments 20/min; authenticated routes keyed by user id.
- Passwords: 8–72 chars (bcrypt limit), at least one letter and one digit.
- Employees must never learn that another employee's task exists: foreign task ids return 404.
- e2e tests run **only** against the `_test` database (Plan 01 guard).

## Review Focus

1. Replaying a rotated refresh token (outside the grace window) revokes the whole family (Task 6).
2. Two tabs refreshing at once must not log the user out: replay inside the grace window succeeds without rotating again (Task 6).
3. Unknown email and wrong password must be indistinguishable to the client (Task 6).
4. `%` and `_` typed into task search must match literally, not as SQL wildcards (Task 8).
5. Whitespace-only titles, comment bodies and notes are rejected (Tasks 8, 9).
6. Two simultaneous approvals produce exactly one success (Task 9).
7. Soft-deleted tasks disappear from list, detail, transitions, comments and dashboard counts (Tasks 8–10).
8. A cross-site `Origin` on a state-changing request is refused (Task 10).

---

## File Structure

```
backend/src/
  common/
    decorators/{public,roles,current-user}.decorator.ts
    errors/db-errors.ts
    validators/is-iso-date-only.validator.ts
    utils/escape-like.ts
  modules/
    security/
      security.module.ts  token.service.ts  password.service.ts  password.constants.ts
      refresh-token.util.ts  cookie.options.ts
      guards/{origin.guard,jwt-auth.guard,roles.guard,app-throttler.guard}.ts
    auth/{auth.module,auth.controller,auth.service,refresh-token.service}.ts  dto/login.dto.ts
    users/{users.module,users.service,users.controller,roles.controller,user.mapper}.ts  dto/*.ts
    tasks/{tasks.module,tasks.service,tasks.controller,task.mapper,task-state-machine}.ts  dto/*.ts
    comments/{comments.module,comments.service,comments.controller}.ts  dto/create-comment.dto.ts
    dashboard/{dashboard.module,dashboard.service,dashboard.controller}.ts
    health/{health.module,health.controller}.ts
backend/test/
  helpers/{test-app,auth,factories,cookies}.ts
  auth.e2e-spec.ts  users.e2e-spec.ts  tasks.e2e-spec.ts  workflow.e2e-spec.ts
  dashboard.e2e-spec.ts  security.e2e-spec.ts  throttling.e2e-spec.ts
```

---

### Task 5: Security module (tokens, cookies, guards, throttling)

**Files:**
- Create: `backend/src/common/decorators/{public,roles,current-user}.decorator.ts`
- Create: `backend/src/modules/security/{password.constants,password.service,refresh-token.util,token.service,cookie.options,security.module}.ts`
- Create: `backend/src/modules/security/guards/{origin.guard,jwt-auth.guard,roles.guard,app-throttler.guard}.ts`
- Modify: `backend/src/database/seeds/run-seed.ts` (import `BCRYPT_COST`), `backend/src/common/enums/role-code.enum.ts` (add `isRoleCode`), `backend/src/app.module.ts`
- Test: `token.service.spec.ts`, `cookie.options.spec.ts`, `refresh-token.util.spec.ts`, `origin.guard.spec.ts` (next to the sources)

**Interfaces:**
- Consumes: `AppException`, `AuthUser`, `RoleCode`, `Env`
- Produces:
  - `TokenService.signAccessToken(user: AuthUser): Promise<string>`; `verifyAccessToken(token: string): AuthUser` (throws `TOKEN_EXPIRED` / `UNAUTHENTICATED`)
  - `generateRefreshToken(): { token: string; hash: string }`; `hashRefreshToken(token: string): string`
  - `PasswordService.hash(plain)`, `verify(plain, hash)`, `verifyDummy(plain)`; `BCRYPT_COST`
  - `buildCookieOptions(settings): { access: CookieOptions; refresh: CookieOptions }`, `clearOptions(options)`, `ACCESS_COOKIE`, `REFRESH_COOKIE`
  - Decorators `@Public()`, `@Roles(...codes)`, `@CurrentUser(): AuthUser`
  - `SecurityModule` (exports `TokenService`, `PasswordService`)

- [ ] **Step 1: Confirm the installed throttler API**

Run: `cd backend && node -e "console.log(require('@nestjs/throttler/package.json').version)"` and `grep -n "skipIf\|getTracker\|ttl" node_modules/@nestjs/throttler/dist/throttler-module-options.interface.d.ts node_modules/@nestjs/throttler/dist/throttler.guard.d.ts | head -20`
Expected: version 5 or newer, `ttl` in milliseconds, `skipIf` on module options, `getTracker(req)` returning a Promise. If the installed version differs, keep the behavior in this task and adapt only the call shapes.

- [ ] **Step 2: Write the failing unit tests**

`backend/src/modules/security/refresh-token.util.spec.ts`:
```ts
import { generateRefreshToken, hashRefreshToken } from './refresh-token.util';

describe('refresh token util', () => {
  it('generates unique, high-entropy tokens whose hash matches hashRefreshToken', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.token).not.toEqual(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43); // 32 bytes, base64url
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(a.token)).toBe(a.hash);
  });

  it('never stores the raw token in its hash', () => {
    const { token, hash } = generateRefreshToken();
    expect(hash).not.toContain(token);
  });
});
```
`backend/src/modules/security/token.service.spec.ts`:
```ts
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppException } from '../../common/errors/app.exception';
import { RoleCode } from '../../common/enums/role-code.enum';
import { Env } from '../../config/env.validation';
import { TokenService } from './token.service';

const SECRET = 'unit-test-secret-unit-test-secret-0123456789';

function build(): { service: TokenService; jwt: JwtService } {
  const values: Record<string, unknown> = { JWT_ACCESS_SECRET: SECRET, ACCESS_TOKEN_TTL: '30m' };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
  const jwt = new JwtService({});
  return { service: new TokenService(jwt, config), jwt };
}

function codeOf(fn: () => unknown): ErrorCode {
  try {
    fn();
  } catch (error) {
    return (error as AppException).code;
  }
  throw new Error('expected the call to throw');
}

describe('TokenService', () => {
  it('round-trips the user identity', async () => {
    const { service } = build();
    const token = await service.signAccessToken({ id: 7, role: RoleCode.ADMIN });
    expect(service.verifyAccessToken(token)).toEqual({ id: 7, role: RoleCode.ADMIN });
  });

  it('reports an expired token as TOKEN_EXPIRED so clients know to refresh', async () => {
    const { service, jwt } = build();
    const expired = await jwt.signAsync({ sub: 7, role: 'ADMIN' }, { secret: SECRET, expiresIn: -10 });
    expect(codeOf(() => service.verifyAccessToken(expired))).toBe(ErrorCode.TOKEN_EXPIRED);
  });

  it('reports a tampered token as UNAUTHENTICATED', async () => {
    const { service } = build();
    const token = await service.signAccessToken({ id: 7, role: RoleCode.ADMIN });
    expect(codeOf(() => service.verifyAccessToken(`${token}x`))).toBe(ErrorCode.UNAUTHENTICATED);
    expect(codeOf(() => service.verifyAccessToken('not-a-jwt'))).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('rejects a validly signed token with an unexpected payload shape', async () => {
    const { service, jwt } = build();
    const odd = await jwt.signAsync({ sub: 'abc', role: 'ROOT' }, { secret: SECRET, expiresIn: 60 });
    expect(codeOf(() => service.verifyAccessToken(odd))).toBe(ErrorCode.UNAUTHENTICATED);
  });
});
```
`backend/src/modules/security/cookie.options.spec.ts`:
```ts
import { buildCookieOptions, clearOptions } from './cookie.options';

describe('buildCookieOptions', () => {
  const base = { secure: true, sameSite: 'lax' as const, refreshTtlDays: 365 };

  it('scopes the refresh cookie to the auth routes and the access cookie to the API', () => {
    const { access, refresh } = buildCookieOptions(base);
    expect(access.path).toBe('/api');
    expect(refresh.path).toBe('/api/auth');
  });

  it('is httpOnly, host-only and follows the environment for Secure and SameSite', () => {
    const { access, refresh } = buildCookieOptions({ ...base, secure: false, sameSite: 'strict' });
    for (const options of [access, refresh]) {
      expect(options.httpOnly).toBe(true);
      expect(options.secure).toBe(false);
      expect(options.sameSite).toBe('strict');
      expect(options.domain).toBeUndefined();
    }
  });

  it('keeps the access cookie as long-lived as the refresh cookie so an expired JWT can still be reported as expired', () => {
    const { access, refresh } = buildCookieOptions(base);
    expect(access.maxAge).toBe(365 * 24 * 60 * 60 * 1000);
    expect(refresh.maxAge).toBe(access.maxAge);
  });

  it('clearOptions drops maxAge but keeps path and flags so the browser actually deletes the cookie', () => {
    const { refresh } = buildCookieOptions(base);
    const cleared = clearOptions(refresh);
    expect(cleared.maxAge).toBeUndefined();
    expect(cleared.path).toBe('/api/auth');
    expect(cleared.httpOnly).toBe(true);
  });
});
```
`backend/src/modules/security/guards/origin.guard.spec.ts`:
```ts
import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../../common/errors/app.exception';
import { Env } from '../../../config/env.validation';
import { OriginGuard } from './origin.guard';

function contextFor(method: string, origin?: string): ExecutionContext {
  const request = { method, headers: origin ? { origin } : {} };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('OriginGuard', () => {
  const config = { get: () => ['https://app.example.com'] } as unknown as ConfigService<Env, true>;
  const guard = new OriginGuard(config);

  it('lets safe methods through regardless of origin', () => {
    expect(guard.canActivate(contextFor('GET', 'https://evil.example'))).toBe(true);
  });

  it('allows state-changing requests from an allowed origin or with no Origin header', () => {
    expect(guard.canActivate(contextFor('POST', 'https://app.example.com'))).toBe(true);
    expect(guard.canActivate(contextFor('DELETE'))).toBe(true);
  });

  it('refuses state-changing requests from any other origin', () => {
    expect(() => guard.canActivate(contextFor('POST', 'https://evil.example'))).toThrow(AppException);
    expect(() => guard.canActivate(contextFor('PATCH', 'null'))).toThrow(AppException);
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `cd backend && npx jest src/modules/security`
Expected: FAIL, modules not found.

- [ ] **Step 4: Decorators and shared helpers**

`backend/src/common/decorators/public.decorator.ts`:
```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opts a route out of the global JWT guard. Everything else requires authentication by default. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
```
`backend/src/common/decorators/roles.decorator.ts`:
```ts
import { SetMetadata } from '@nestjs/common';
import { RoleCode } from '../enums/role-code.enum';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given role codes. Enforced by the global RolesGuard. */
export const Roles = (...roles: RoleCode[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);
```
`backend/src/common/decorators/current-user.decorator.ts`:
```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../errors/app.exception';
import { AuthUser } from '../types/request.types';

/** Injects the verified identity. Only valid on routes behind the JWT guard. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const user = context.switchToHttp().getRequest<Request>().user;
  if (!user) throw AppException.unauthenticated();
  return user;
});
```
`backend/src/common/errors/db-errors.ts`:
```ts
import { QueryFailedError } from 'typeorm';

/** True when MySQL rejected the statement because of a unique-key violation. */
export function isDuplicateEntry(error: unknown): boolean {
  return error instanceof QueryFailedError && (error.driverError as { code?: string }).code === 'ER_DUP_ENTRY';
}
```
Append to `backend/src/common/enums/role-code.enum.ts`:
```ts

export function isRoleCode(value: string): value is RoleCode {
  return (ROLE_CODES as readonly string[]).includes(value);
}
```
`backend/src/modules/security/password.constants.ts`:
```ts
/** bcrypt work factor. 12 is ~250ms on commodity hardware: slow enough to hurt brute force, fine for login. */
export const BCRYPT_COST = 12;
```
In `backend/src/database/seeds/run-seed.ts` delete `export const BCRYPT_COST = 12;` and add `import { BCRYPT_COST } from '../../modules/security/password.constants';`.

- [ ] **Step 5: Implement services and options**

`backend/src/modules/security/refresh-token.util.ts`:
```ts
import { createHash, randomBytes } from 'node:crypto';

/**
 * Refresh tokens are opaque random values, not JWTs: nothing in them needs to be readable by the client, and a random
 * value can be revoked and rotated purely server-side. SHA-256 (not bcrypt) is correct here because the input already
 * has 256 bits of entropy, so there is nothing to brute force and lookups stay fast.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}
```
`backend/src/modules/security/password.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { BCRYPT_COST } from './password.constants';

@Injectable()
export class PasswordService {
  /** Computed once so a login for an unknown email costs the same as one for a known email. */
  private readonly dummyHash = bcrypt.hash('not-a-real-password', BCRYPT_COST);

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_COST);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /** Burns the same time as a real comparison so response timing does not reveal which emails exist. */
  async verifyDummy(plain: string): Promise<void> {
    await bcrypt.compare(plain, await this.dummyHash);
  }
}
```
`backend/src/modules/security/token.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { isRoleCode, RoleCode } from '../../common/enums/role-code.enum';
import { AppException } from '../../common/errors/app.exception';
import { AuthUser } from '../../common/types/request.types';
import { Env } from '../../config/env.validation';

interface AccessPayload {
  sub: unknown;
  role: unknown;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  signAccessToken(user: AuthUser): Promise<string> {
    return this.jwt.signAsync(
      { sub: user.id, role: user.role satisfies RoleCode },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        // The env value is validated as a duration string; the library's type is a narrower template literal.
        expiresIn: this.config.get('ACCESS_TOKEN_TTL', { infer: true }) as JwtSignOptions['expiresIn'],
      },
    );
  }

  verifyAccessToken(token: string): AuthUser {
    let payload: AccessPayload;
    try {
      payload = this.jwt.verify<AccessPayload>(token, { secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }) });
    } catch (error) {
      // Distinguishing "expired" lets the client refresh silently instead of sending the user to the login page.
      throw (error as Error).name === 'TokenExpiredError' ? AppException.tokenExpired() : AppException.unauthenticated();
    }
    if (typeof payload.sub !== 'number' || typeof payload.role !== 'string' || !isRoleCode(payload.role)) {
      throw AppException.unauthenticated();
    }
    return { id: payload.sub, role: payload.role };
  }
}
```
`backend/src/modules/security/cookie.options.ts`:
```ts
import type { CookieOptions } from 'express';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CookieSettings {
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  refreshTtlDays: number;
}

export interface AuthCookieOptions {
  access: CookieOptions;
  refresh: CookieOptions;
}

/**
 * The only place cookie attributes are defined. Both cookies live as long as the refresh token: the access JWT
 * enforces its own 30 minute expiry, and keeping its cookie around lets the API answer TOKEN_EXPIRED rather than the
 * browser silently deleting the cookie and making expiry indistinguishable from "never logged in".
 * No `domain` is set, so cookies are host-only and never leak to sibling subdomains.
 */
export function buildCookieOptions(settings: CookieSettings): AuthCookieOptions {
  const common: CookieOptions = {
    httpOnly: true,
    secure: settings.secure,
    sameSite: settings.sameSite,
    maxAge: settings.refreshTtlDays * DAY_MS,
  };
  return {
    access: { ...common, path: '/api' },
    // Limited to the auth routes so the long-lived credential is not sent with every API call.
    refresh: { ...common, path: '/api/auth' },
  };
}

/** Browsers only delete a cookie when path and flags match, so reuse the originals without the lifetime. */
export function clearOptions(options: CookieOptions): CookieOptions {
  const { maxAge: _maxAge, expires: _expires, ...rest } = options;
  return rest;
}
```

- [ ] **Step 6: Guards**

`backend/src/modules/security/guards/origin.guard.ts`:
```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppException } from '../../../common/errors/app.exception';
import { Env } from '../../../config/env.validation';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Defence in depth against CSRF on top of SameSite cookies: a browser always sends Origin on cross-site writes, so a
 * write from an origin we do not know is refused. Requests without Origin (curl, server-to-server) carry no browser
 * cookies and are not a CSRF vector.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowedOrigins: readonly string[];

  constructor(config: ConfigService<Env, true>) {
    this.allowedOrigins = config.get('FRONTEND_ORIGINS', { infer: true });
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!STATE_CHANGING.has(request.method)) return true;
    const origin = request.headers.origin;
    if (!origin || this.allowedOrigins.includes(origin)) return true;
    throw AppException.forbidden('Cross-origin request not allowed');
  }
}
```
`backend/src/modules/security/guards/jwt-auth.guard.ts`:
```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { AppException } from '../../../common/errors/app.exception';
import '../../../common/types/request.types';
import { ACCESS_COOKIE } from '../cookie.options';
import { TokenService } from '../token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token: unknown = request.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || token.length === 0) throw AppException.unauthenticated();

    request.user = this.tokens.verifyAccessToken(token);
    return true;
  }
}
```
`backend/src/modules/security/guards/roles.guard.ts`:
```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { RoleCode } from '../../../common/enums/role-code.enum';
import { AppException } from '../../../common/errors/app.exception';
import '../../../common/types/request.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleCode[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user || !required.includes(user.role)) throw AppException.forbidden();
    return true;
  }
}
```
`backend/src/modules/security/guards/app-throttler.guard.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthUser } from '../../../common/types/request.types';

interface TrackedRequest {
  ip?: string;
  path?: string;
  body?: { email?: unknown };
  user?: AuthUser;
}

/**
 * Rate-limit keys. Plain IP is wrong here: every request reaches Render through Vercel, so the socket IP is Vercel's
 * and all users would share one bucket. Logins are limited per email+IP (stops brute force without letting one attacker
 * lock everyone out), and authenticated traffic per user.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as TrackedRequest;
    if (request.path?.endsWith('/auth/login') && typeof request.body?.email === 'string') {
      return `login:${request.body.email.trim().toLowerCase()}|${request.ip}`;
    }
    if (request.user) return `user:${request.user.id}`;
    return `ip:${request.ip}`;
  }
}
```

- [ ] **Step 7: SecurityModule and wiring**

`backend/src/modules/security/security.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { Env } from '../../config/env.validation';
import { AppThrottlerGuard } from './guards/app-throttler.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OriginGuard } from './guards/origin.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/**
 * Global guards run in the order their providers are declared: origin check, then authentication, then rate limiting
 * (which needs req.user to key by user), then role checks. Keeping them in one module makes that order explicit.
 */
@Module({
  imports: [
    JwtModule.register({}),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
        skipIf: () => !config.get('THROTTLING_ENABLED', { infer: true }),
      }),
    }),
  ],
  providers: [
    TokenService,
    PasswordService,
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokenService, PasswordService],
})
export class SecurityModule {}
```
Add `SecurityModule` to the `imports` array of `backend/src/app.module.ts`.

- [ ] **Step 8: Run unit tests and the existing e2e suite**

Run: `cd backend && npx jest && npm run test:e2e`
Expected: all unit tests PASS. The e2e suite still passes: the `/api/nope` 404 now comes from the guard chain, so it returns `401 UNAUTHENTICATED` instead. Update `test/error-contract.e2e-spec.ts` to expect that: replace `.expect(404)` with `.expect(401)`, `statusCode: 404, code: 'NOT_FOUND'` with `statusCode: 401, code: 'UNAUTHENTICATED'`, and the second test's `.expect(404)` with `.expect(401)`. (Unknown routes behind a global auth guard answer 401 first; that is intended and avoids leaking which routes exist.)

- [ ] **Step 9: Commit**

```bash
git add backend
git commit -m "feat(backend): add security module with tokens, cookies, guards and throttling"
```

---

### Task 6: Auth — login, refresh rotation, logout, me

**Files:**
- Create: `backend/src/modules/users/user.mapper.ts`
- Create: `backend/src/modules/auth/{auth.module,auth.controller,auth.service,refresh-token.service}.ts`, `backend/src/modules/auth/dto/login.dto.ts`
- Modify: `backend/src/app.module.ts`
- Create: `backend/test/helpers/{auth,cookies}.ts`
- Test: `backend/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `TokenService`, `PasswordService`, `generateRefreshToken`, cookie helpers, entities
- Produces:
  - `UserSummary { id; name; email; phone: string | null; isDefault: boolean; role: { id; code; name } }`, `toUserSummary(user: User): UserSummary`
  - `POST /api/auth/login` → `200 { user: UserSummary }` + cookies; `POST /api/auth/refresh` → `200 { refreshed: true }`; `POST /api/auth/logout` → `204`; `GET /api/auth/me` → `UserSummary`
  - `RefreshTokenService`: `issueForLogin(userId, meta): Promise<string>`, `rotate(presented, meta): Promise<RotationResult>`, `revokeFamilyOf(presented): Promise<void>`, constant `REFRESH_GRACE_MS`
  - Test helpers: `ADMIN`, `PRIYA`, `RAHUL` credentials, `loginAgent(app, creds)`, `userIdOf(ds, email)`, `cookieValue(res, name)`, `setCookies(res)`

- [ ] **Step 1: Test helpers**

`backend/test/helpers/cookies.ts`:
```ts
import type { Response } from 'supertest';

export function setCookies(res: Response): string[] {
  const raw = res.headers['set-cookie'] as string[] | string | undefined;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/** Value of a cookie set by the response, or undefined when the response did not set it. */
export function cookieValue(res: Response, name: string): string | undefined {
  const line = setCookies(res).find((cookie) => cookie.startsWith(`${name}=`));
  return line?.split(';')[0].slice(name.length + 1);
}
```
`backend/test/helpers/auth.ts`:
```ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { DEMO_PASSWORDS } from '../../src/database/seeds/demo-data';
import { User } from '../../src/database/entities';

export const ADMIN = { email: 'admin@taskapp.dev', password: DEMO_PASSWORDS.admin };
export const PRIYA = { email: 'priya@taskapp.dev', password: DEMO_PASSWORDS.employee };
export const RAHUL = { email: 'rahul@taskapp.dev', password: DEMO_PASSWORDS.employee };

export type Agent = ReturnType<typeof request.agent>;

/** A supertest agent that keeps the session cookies, like a browser tab would. */
export async function loginAgent(app: INestApplication, credentials: { email: string; password: string }): Promise<Agent> {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/api/auth/login').send(credentials).expect(200);
  return agent;
}

export async function userIdOf(dataSource: DataSource, email: string): Promise<number> {
  return (await dataSource.getRepository(User).findOneByOrFail({ email })).id;
}
```

- [ ] **Step 2: Write the failing e2e test** — `backend/test/auth.e2e-spec.ts`

```ts
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { RefreshToken } from '../src/database/entities';
import { hashRefreshToken } from '../src/modules/security/refresh-token.util';
import { ADMIN, loginAgent, PRIYA, userIdOf } from './helpers/auth';
import { cookieValue, setCookies } from './helpers/cookies';
import { createTestApp, TestContext } from './helpers/test-app';

describe('auth', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.close());

  describe('login', () => {
    it('sets httpOnly access and refresh cookies and returns the user without any token in the body', async () => {
      const res = await http().post('/api/auth/login').send(ADMIN).expect(200);

      expect(res.body.user).toMatchObject({ email: ADMIN.email, role: { code: 'ADMIN' } });
      expect(JSON.stringify(res.body)).not.toMatch(/token|hash|password/i);

      const cookies = setCookies(res);
      const access = cookies.find((c) => c.startsWith('access_token='))!;
      const refresh = cookies.find((c) => c.startsWith('refresh_token='))!;
      for (const cookie of [access, refresh]) {
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain('Max-Age=31536000');
      }
      expect(access).toContain('Path=/api;');
      expect(refresh).toContain('Path=/api/auth');
    });

    it('stores only a hash of the refresh token', async () => {
      const res = await http().post('/api/auth/login').send(ADMIN).expect(200);
      const raw = cookieValue(res, 'refresh_token')!;
      const row = await ctx.dataSource.getRepository(RefreshToken).findOneByOrFail({ tokenHash: hashRefreshToken(raw) });
      expect(row.tokenHash).not.toBe(raw);
      expect(row.revokedAt).toBeNull();
    });

    it('answers a wrong password and an unknown email identically', async () => {
      const wrongPassword = await http().post('/api/auth/login').send({ email: ADMIN.email, password: 'Wrong@12345' }).expect(401);
      const unknownEmail = await http().post('/api/auth/login').send({ email: 'ghost@taskapp.dev', password: 'Wrong@12345' }).expect(401);

      expect(unknownEmail.body.code).toBe(wrongPassword.body.code);
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
      expect(wrongPassword.body.message).not.toMatch(/exist|found|password is/i);
    });

    it('treats the email case-insensitively', async () => {
      await http().post('/api/auth/login').send({ email: '  ADMIN@TaskApp.dev ', password: ADMIN.password }).expect(200);
    });

    it('validates the payload with the standard 422 shape', async () => {
      const res = await http().post('/api/auth/login').send({ email: 'not-an-email' }).expect(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual(['email', 'password']);
    });
  });

  describe('session', () => {
    it('rejects /me without a session', async () => {
      const res = await http().get('/api/auth/me').expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('returns the current user for a valid session', async () => {
      const agent = await loginAgent(ctx.app, PRIYA);
      const res = await agent.get('/api/auth/me').expect(200);
      expect(res.body).toMatchObject({ email: PRIYA.email, role: { code: 'EMPLOYEE' } });
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('reports an expired access token as TOKEN_EXPIRED', async () => {
      const jwt = ctx.app.get(JwtService, { strict: false });
      const id = await userIdOf(ctx.dataSource, ADMIN.email);
      const expired = await jwt.signAsync({ sub: id, role: 'ADMIN' }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: -10 });

      const res = await http().get('/api/auth/me').set('Cookie', [`access_token=${expired}`]).expect(401);
      expect(res.body.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('refresh rotation', () => {
    async function loginRaw(): Promise<string> {
      const res = await http().post('/api/auth/login').send(PRIYA).expect(200);
      return cookieValue(res, 'refresh_token')!;
    }
    const refreshWith = (token: string) => http().post('/api/auth/refresh').set('Cookie', [`refresh_token=${token}`]);

    it('issues a new access and refresh token and rotates the stored row', async () => {
      const first = await loginRaw();
      const res = await refreshWith(first).expect(200);

      const second = cookieValue(res, 'refresh_token')!;
      expect(second).toBeDefined();
      expect(second).not.toBe(first);
      expect(cookieValue(res, 'access_token')).toBeDefined();

      const repo = ctx.dataSource.getRepository(RefreshToken);
      const oldRow = await repo.findOneByOrFail({ tokenHash: hashRefreshToken(first) });
      const newRow = await repo.findOneByOrFail({ tokenHash: hashRefreshToken(second) });
      expect(oldRow.revokedAt).not.toBeNull();
      expect(oldRow.replacedById).toBe(newRow.id);
      expect(newRow.familyId).toBe(oldRow.familyId);
    });

    it('accepts a just-rotated token inside the grace window without rotating again (two tabs refreshing together)', async () => {
      const first = await loginRaw();
      await refreshWith(first).expect(200);

      const replay = await refreshWith(first).expect(200);
      expect(cookieValue(replay, 'access_token')).toBeDefined();
      expect(cookieValue(replay, 'refresh_token')).toBeUndefined();
    });

    it('revokes the whole family when a rotated token is replayed after the grace window', async () => {
      const first = await loginRaw();
      const rotated = await refreshWith(first).expect(200);
      const second = cookieValue(rotated, 'refresh_token')!;

      await ctx.dataSource.query('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?', [
        new Date(Date.now() - 60_000),
        hashRefreshToken(first),
      ]);

      const replay = await refreshWith(first).expect(401);
      expect(replay.body.code).toBe('UNAUTHENTICATED');
      // The refresh cookie is cleared so the client does not keep retrying.
      expect(setCookies(replay).some((c) => c.startsWith('refresh_token=;'))).toBe(true);

      // The legitimate descendant is revoked too: the user must sign in again.
      await refreshWith(second).expect(401);
    });

    it('rejects a missing, unknown or expired refresh token', async () => {
      await http().post('/api/auth/refresh').expect(401);
      await refreshWith('definitely-not-a-real-token').expect(401);

      const token = await loginRaw();
      await ctx.dataSource.query('UPDATE refresh_tokens SET expires_at = ? WHERE token_hash = ?', [
        new Date(Date.now() - 1000),
        hashRefreshToken(token),
      ]);
      await refreshWith(token).expect(401);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token, clears both cookies and ends the refresh ability', async () => {
      const res = await http().post('/api/auth/login').send(PRIYA).expect(200);
      const refreshToken = cookieValue(res, 'refresh_token')!;
      const accessToken = cookieValue(res, 'access_token')!;

      const out = await http()
        .post('/api/auth/logout')
        .set('Cookie', [`refresh_token=${refreshToken}`, `access_token=${accessToken}`])
        .expect(204);
      const cleared = setCookies(out);
      expect(cleared.some((c) => c.startsWith('access_token=;'))).toBe(true);
      expect(cleared.some((c) => c.startsWith('refresh_token=;'))).toBe(true);

      await http().post('/api/auth/refresh').set('Cookie', [`refresh_token=${refreshToken}`]).expect(401);
    });

    it('works even when the access token has already expired', async () => {
      await http().post('/api/auth/logout').expect(204);
    });
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `cd backend && npm run test:e2e -- auth`
Expected: FAIL (404/401 on `/api/auth/login`, routes do not exist).

- [ ] **Step 4: User mapper and DTO**

`backend/src/modules/users/user.mapper.ts`:
```ts
import { User } from '../../database/entities';

export interface UserSummary {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  /** Seeded demo account: the UI hides Delete for these and the API refuses it. */
  isDefault: boolean;
  role: { id: number; code: string; name: string };
}

/** The only shape in which users leave the API. It deliberately omits the password hash. */
export function toUserSummary(user: User): UserSummary {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isDefault: user.isDefault,
    role: { id: user.role.id, code: user.role.code, name: user.role.name },
  };
}
```
`backend/src/modules/auth/dto/login.dto.ts`:
```ts
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { NormalizeEmail } from '../../../common/decorators/trim.decorator';

export class LoginDto {
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // Upper bound only: complexity rules apply when a password is created, not when it is checked.
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
```

- [ ] **Step 5: RefreshTokenService**

`backend/src/modules/auth/refresh-token.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, IsNull, LessThan } from 'typeorm';
import { Env } from '../../config/env.validation';
import { RefreshToken } from '../../database/entities';
import { generateRefreshToken, hashRefreshToken } from '../security/refresh-token.util';

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

export type RotationResult =
  | { kind: 'rotated'; userId: number; token: string }
  | { kind: 'grace'; userId: number }
  | { kind: 'reuse' }
  | { kind: 'invalid' };

/** How long a just-rotated token is still honoured, so two tabs refreshing at once do not look like token theft. */
export const REFRESH_GRACE_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const REVOKED_RETENTION_MS = 7 * DAY_MS;

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Starts a new token family for a fresh login and tidies the user's stale rows. */
  async issueForLogin(userId: number, meta: ClientMeta): Promise<string> {
    await this.prune(userId);
    const { token } = await this.create(this.dataSource.manager, userId, randomUUID(), meta);
    return token;
  }

  /**
   * Exchanges a refresh token for its successor. Runs in one transaction with a row lock so concurrent refreshes with the
   * same token are serialised. The reuse branch commits its revocation and only then reports failure; throwing inside the
   * transaction would roll the revocation back.
   */
  async rotate(presented: string, meta: ClientMeta): Promise<RotationResult> {
    const hash = hashRefreshToken(presented);

    return this.dataSource.transaction(async (em): Promise<RotationResult> => {
      const repo = em.getRepository(RefreshToken);
      const row = await repo.findOne({ where: { tokenHash: hash }, lock: { mode: 'pessimistic_write' } });
      const now = new Date();

      if (!row || row.expiresAt <= now) return { kind: 'invalid' };

      if (row.revokedAt) {
        const rotatedRecently = row.replacedById !== null && now.getTime() - row.revokedAt.getTime() <= REFRESH_GRACE_MS;
        if (rotatedRecently) return { kind: 'grace', userId: row.userId };
        await repo.update({ familyId: row.familyId, revokedAt: IsNull() }, { revokedAt: now });
        return { kind: 'reuse' };
      }

      const next = await this.create(em, row.userId, row.familyId, meta);
      await repo.update(row.id, { revokedAt: now, replacedById: next.entity.id });
      return { kind: 'rotated', userId: row.userId, token: next.token };
    });
  }

  /** Logout: kills the presented token's whole family so no sibling token can resurrect the session. */
  async revokeFamilyOf(presented: string): Promise<void> {
    const repo = this.dataSource.getRepository(RefreshToken);
    const row = await repo.findOne({ where: { tokenHash: hashRefreshToken(presented) } });
    if (!row) return;
    await repo.update({ familyId: row.familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async create(
    em: EntityManager,
    userId: number,
    familyId: string,
    meta: ClientMeta,
  ): Promise<{ token: string; entity: RefreshToken }> {
    const { token, hash } = generateRefreshToken();
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const repo = em.getRepository(RefreshToken);
    const entity = await repo.save(
      repo.create({
        userId,
        familyId,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + ttlDays * DAY_MS),
        revokedAt: null,
        replacedById: null,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
        ip: meta.ip?.slice(0, 64) ?? null,
      }),
    );
    return { token, entity };
  }

  /** Deletes expired rows and rows revoked long ago. Recently revoked rows stay so reuse detection keeps working. */
  private async prune(userId: number): Promise<void> {
    const now = Date.now();
    await this.dataSource.getRepository(RefreshToken).delete([
      { userId, expiresAt: LessThan(new Date(now)) },
      { userId, revokedAt: LessThan(new Date(now - REVOKED_RETENTION_MS)) },
    ]);
  }
}
```

- [ ] **Step 6: AuthService, controller, module**

`backend/src/modules/auth/auth.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { isRoleCode } from '../../common/enums/role-code.enum';
import { AppException } from '../../common/errors/app.exception';
import { User } from '../../database/entities';
import { PasswordService } from '../security/password.service';
import { TokenService } from '../security/token.service';
import { toUserSummary, UserSummary } from '../users/user.mapper';
import { ClientMeta, RefreshTokenService } from './refresh-token.service';

export interface LoginResult {
  user: UserSummary;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResult {
  accessToken: string;
  /** Absent when the presented token was inside the grace window: the first response already delivered the new one. */
  refreshToken?: string;
}

const SESSION_ENDED = 'Session expired. Please sign in again.';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async login(email: string, password: string, meta: ClientMeta): Promise<LoginResult> {
    const user = await this.users.findOne({ where: { email, deletedAt: IsNull() } });
    // Same work and same error whether the email exists or not, so neither message nor timing enumerates accounts.
    const valid = user ? await this.passwords.verify(password, user.passwordHash) : (await this.passwords.verifyDummy(password), false);
    if (!user || !valid) throw AppException.unauthenticated('Invalid email or password');

    return {
      user: toUserSummary(user),
      accessToken: await this.signAccessFor(user),
      refreshToken: await this.refreshTokens.issueForLogin(user.id, meta),
    };
  }

  async refresh(presented: string | undefined, meta: ClientMeta): Promise<RefreshResult> {
    if (!presented) throw AppException.unauthenticated(SESSION_ENDED);

    const result = await this.refreshTokens.rotate(presented, meta);
    if (result.kind === 'invalid' || result.kind === 'reuse') throw AppException.unauthenticated(SESSION_ENDED);

    const user = await this.users.findOne({ where: { id: result.userId, deletedAt: IsNull() } });
    if (!user) throw AppException.unauthenticated(SESSION_ENDED);

    return {
      accessToken: await this.signAccessFor(user),
      refreshToken: result.kind === 'rotated' ? result.token : undefined,
    };
  }

  async logout(presented: string | undefined): Promise<void> {
    if (presented) await this.refreshTokens.revokeFamilyOf(presented);
  }

  async me(userId: number): Promise<UserSummary> {
    const user = await this.users.findOne({ where: { id: userId, deletedAt: IsNull() } });
    if (!user) throw AppException.unauthenticated();
    return toUserSummary(user);
  }

  private signAccessFor(user: User): Promise<string> {
    if (!isRoleCode(user.role.code)) throw AppException.unauthenticated();
    return this.tokens.signAccessToken({ id: user.id, role: user.role.code });
  }
}
```
`backend/src/modules/auth/auth.controller.ts`:
```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AppException } from '../../common/errors/app.exception';
import { AuthUser } from '../../common/types/request.types';
import { Env } from '../../config/env.validation';
import { ACCESS_COOKIE, AuthCookieOptions, buildCookieOptions, clearOptions, REFRESH_COOKIE } from '../security/cookie.options';
import { UserSummary } from '../users/user.mapper';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ClientMeta } from './refresh-token.service';

function readCookie(request: Request, name: string): string | undefined {
  const value: unknown = request.cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function clientMeta(request: Request): ClientMeta {
  return { userAgent: request.get('user-agent') ?? undefined, ip: request.ip };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly cookies: AuthCookieOptions;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.cookies = buildCookieOptions({
      secure: config.get('COOKIE_SECURE', { infer: true }),
      sameSite: config.get('COOKIE_SAMESITE', { infer: true }),
      refreshTtlDays: config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }),
    });
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ user: UserSummary }> {
    const session = await this.auth.login(dto.email, dto.password, clientMeta(req));
    res.cookie(ACCESS_COOKIE, session.accessToken, this.cookies.access);
    res.cookie(REFRESH_COOKIE, session.refreshToken, this.cookies.refresh);
    return { user: session.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ refreshed: true }> {
    try {
      const result = await this.auth.refresh(readCookie(req, REFRESH_COOKIE), clientMeta(req));
      res.cookie(ACCESS_COOKIE, result.accessToken, this.cookies.access);
      if (result.refreshToken) res.cookie(REFRESH_COOKIE, result.refreshToken, this.cookies.refresh);
      return { refreshed: true };
    } catch (error) {
      // A dead session must not leave a dead cookie behind, or the client would retry it forever.
      if (error instanceof AppException) this.clearSessionCookies(res);
      throw error;
    }
  }

  // Public on purpose: logging out must work after the access token expired. It only needs the refresh cookie.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(readCookie(req, REFRESH_COOKIE));
    this.clearSessionCookies(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<UserSummary> {
    return this.auth.me(user.id);
  }

  private clearSessionCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, clearOptions(this.cookies.access));
    res.clearCookie(REFRESH_COOKIE, clearOptions(this.cookies.refresh));
  }
}
```
`backend/src/modules/auth/auth.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities';
import { SecurityModule } from '../security/security.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), SecurityModule],
  controllers: [AuthController],
  providers: [AuthService, RefreshTokenService],
})
export class AuthModule {}
```
Add `AuthModule` to `AppModule.imports`.

- [ ] **Step 7: Run the auth e2e tests**

Run: `cd backend && npm run test:e2e -- auth`
Expected: PASS (all tests in `auth.e2e-spec.ts`). If the `Max-Age` or cookie-clearing assertions differ by Express version, adjust only the assertion text, not the behavior.

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat(backend): add login, rotating refresh tokens, logout and session endpoints"
```

---

### Task 7: Users CRUD and roles (Admin)

**Files:**
- Create: `backend/src/modules/users/{users.module,users.service,users.controller,roles.controller}.ts`
- Create: `backend/src/modules/users/dto/{create-user,update-user,list-users-query}.dto.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/users.e2e-spec.ts`

**Interfaces:**
- Consumes: `toUserSummary`, `PasswordService`, `isDuplicateEntry`, `Roles`, `Paginated`, `RefreshToken` and `Task` entities
- Produces:
  - `GET /api/roles` → `{ id; code; name }[]`; `GET /api/users?roleCode&page&limit` → `Paginated<UserSummary>`; `POST /api/users` → `201 UserSummary`; `GET /api/users/:id` → `UserSummary`; `PATCH /api/users/:id` (`name`, `email`, `phone` (null clears it), `password`; the role cannot be changed) → `UserSummary`; `DELETE /api/users/:id` → `204`
  - Delete is a soft delete (`deletedAt`). It is refused with `409 CONFLICT` for yourself, for a default (seeded) account, and for any user who has a task assigned in any status (including COMPLETED). Sessions are revoked; the email stays reserved
  - `UsersService.ensureAssignableEmployee(userId: number): Promise<User>` (throws 422 with field `assigneeId`)

- [ ] **Step 1: Write the failing test** — `backend/test/users.e2e-spec.ts`

```ts
import request from 'supertest';
import { Task } from '../src/database/entities';
import { TaskPriority } from '../src/common/enums/task-priority.enum';
import { TaskStatus } from '../src/common/enums/task-status.enum';
import { ADMIN, Agent, loginAgent, PRIYA, userIdOf } from './helpers/auth';
import { createTestApp, TestContext } from './helpers/test-app';

describe('users and roles', () => {
  let ctx: TestContext;
  let admin: Agent;
  let priya: Agent;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAgent(ctx.app, ADMIN);
    priya = await loginAgent(ctx.app, PRIYA);
  });
  afterAll(async () => ctx.close());

  it('requires authentication and the Admin role', async () => {
    await request(ctx.app.getHttpServer()).get('/api/users').expect(401);
    await priya.get('/api/users').expect(403);
    await priya.get('/api/roles').expect(403);
    await priya.post('/api/users').send({}).expect(403);
    await priya.get('/api/users/1').expect(403);
    await priya.patch('/api/users/1').send({ name: 'X' }).expect(403);
    await priya.delete('/api/users/1').expect(403);
  });

  it('lists roles for the create-user dropdown', async () => {
    const res = await admin.get('/api/roles').expect(200);
    expect(res.body.map((r: { code: string }) => r.code).sort()).toEqual(['ADMIN', 'EMPLOYEE']);
  });

  it('lists users with pagination and filters by role code', async () => {
    const all = await admin.get('/api/users').expect(200);
    expect(all.body.meta).toMatchObject({ page: 1, limit: 20, total: 5 });
    expect(JSON.stringify(all.body)).not.toMatch(/passwordHash|password_hash/);

    const employees = await admin.get('/api/users?roleCode=EMPLOYEE').expect(200);
    expect(employees.body.items.map((u: { email: string }) => u.email).sort()).toEqual([
      'ananya@taskapp.dev', 'priya@taskapp.dev', 'rahul@taskapp.dev',
    ]);

    await admin.get('/api/users?roleCode=ROOT').expect(422);
    await admin.get('/api/users?limit=1000').expect(422);
    await admin.get('/api/users?page=0').expect(422);
  });

  describe('creating a user', () => {
    async function employeeRoleId(): Promise<number> {
      const roles = await admin.get('/api/roles').expect(200);
      return roles.body.find((r: { code: string }) => r.code === 'EMPLOYEE').id;
    }

    it('creates a user who can then log in, and never returns the hash', async () => {
      const roleId = await employeeRoleId();
      const res = await admin
        .post('/api/users')
        .send({ name: '  Neha Kapoor ', email: 'Neha.Kapoor@TaskApp.dev', phone: ' +91 98765 43210 ', password: 'Welcome123', roleId })
        .expect(201);

      expect(res.body).toMatchObject({ name: 'Neha Kapoor', email: 'neha.kapoor@taskapp.dev', phone: '+91 98765 43210', role: { code: 'EMPLOYEE' } });
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
      await request(ctx.app.getHttpServer()).post('/api/auth/login').send({ email: 'neha.kapoor@taskapp.dev', password: 'Welcome123' }).expect(200);
    });

    it('rejects a duplicate email regardless of case with CONFLICT', async () => {
      const roleId = await employeeRoleId();
      const res = await admin
        .post('/api/users')
        .send({ name: 'Dup', email: 'PRIYA@taskapp.dev', password: 'Welcome123', roleId })
        .expect(409);
      expect(res.body.code).toBe('CONFLICT');
    });

    it('rejects weak passwords, unknown roles and unknown fields with field-level details', async () => {
      const roleId = await employeeRoleId();
      const weak = await admin.post('/api/users').send({ name: 'A', email: 'a@taskapp.dev', password: 'short', roleId }).expect(422);
      expect(weak.body.details.some((d: { field: string }) => d.field === 'password')).toBe(true);

      const noDigits = await admin.post('/api/users').send({ name: 'A', email: 'a@taskapp.dev', password: 'onlyletters', roleId }).expect(422);
      expect(noDigits.body.details[0].field).toBe('password');

      const tooLong = await admin.post('/api/users').send({ name: 'A', email: 'a@taskapp.dev', password: `a1${'x'.repeat(80)}`, roleId }).expect(422);
      expect(tooLong.body.details[0].field).toBe('password');

      const badPhone = await admin.post('/api/users').send({ name: 'A', email: 'a@taskapp.dev', phone: 'call me', password: 'Welcome123', roleId }).expect(422);
      expect(badPhone.body.details[0]).toMatchObject({ field: 'phone' });

      const badRole = await admin.post('/api/users').send({ name: 'A', email: 'a@taskapp.dev', password: 'Welcome123', roleId: 9999 }).expect(422);
      expect(badRole.body.details).toEqual([{ field: 'roleId', message: 'Unknown role' }]);

      const extra = await admin.post('/api/users').send({ name: 'A', email: 'a@taskapp.dev', password: 'Welcome123', roleId, isAdmin: true }).expect(422);
      expect(extra.body.details[0].field).toBe('isAdmin');
    });
  });

  describe('reading, editing and deleting a user', () => {
    async function createEmployee(email: string): Promise<{ id: number; email: string; password: string }> {
      const roles = await admin.get('/api/roles').expect(200);
      const roleId = roles.body.find((r: { code: string }) => r.code === 'EMPLOYEE').id;
      const res = await admin.post('/api/users').send({ name: 'Temp User', email, password: 'Welcome123', roleId }).expect(201);
      return { id: res.body.id, email, password: 'Welcome123' };
    }

    it('returns one user and 404 for an unknown id; a non-numeric id is a validation error', async () => {
      const id = await userIdOf(ctx.dataSource, PRIYA.email);
      const res = await admin.get(`/api/users/${id}`).expect(200);
      expect(res.body).toMatchObject({ email: PRIYA.email, role: { code: 'EMPLOYEE' } });
      expect((await admin.get('/api/users/99999').expect(404)).body.code).toBe('NOT_FOUND');
      await admin.get('/api/users/abc').expect(422);
    });

    it('edits name, email and phone, clears the phone with null, and rejects a taken email', async () => {
      const user = await createEmployee('edit.me@taskapp.dev');
      const edited = await admin
        .patch(`/api/users/${user.id}`)
        .send({ name: '  Edited Name ', email: 'Edited.Me@TaskApp.dev', phone: '+91 91111 22222' })
        .expect(200);
      expect(edited.body).toMatchObject({ name: 'Edited Name', email: 'edited.me@taskapp.dev', phone: '+91 91111 22222' });

      const cleared = await admin.patch(`/api/users/${user.id}`).send({ phone: null }).expect(200);
      expect(cleared.body.phone).toBeNull();

      const taken = await admin.patch(`/api/users/${user.id}`).send({ email: 'priya@taskapp.dev' }).expect(409);
      expect(taken.body.code).toBe('CONFLICT');
    });

    it('does not allow changing the role or sending unknown fields', async () => {
      const user = await createEmployee('fixed.role@taskapp.dev');
      const res = await admin.patch(`/api/users/${user.id}`).send({ roleId: 1 }).expect(422);
      expect(res.body.details[0].field).toBe('roleId');
    });

    it('resets the password: the old one stops working and open sessions are revoked', async () => {
      const user = await createEmployee('reset.me@taskapp.dev');
      const session = await loginAgent(ctx.app, user);
      await admin.patch(`/api/users/${user.id}`).send({ password: 'Brandnew456' }).expect(200);

      await session.post('/api/auth/refresh').expect(401);
      const http = (): ReturnType<typeof request> => request(ctx.app.getHttpServer());
      await http().post('/api/auth/login').send({ email: user.email, password: user.password }).expect(401);
      await http().post('/api/auth/login').send({ email: user.email, password: 'Brandnew456' }).expect(200);
    });

    it('soft-deletes a user: they disappear, cannot sign in or refresh, and the email stays reserved', async () => {
      const user = await createEmployee('delete.me@taskapp.dev');
      const session = await loginAgent(ctx.app, user);

      await admin.delete(`/api/users/${user.id}`).expect(204);

      await admin.get(`/api/users/${user.id}`).expect(404);
      const list = await admin.get('/api/users?limit=100').expect(200);
      expect(list.body.items.some((u: { id: number }) => u.id === user.id)).toBe(false);
      await session.post('/api/auth/refresh').expect(401);
      await session.get('/api/auth/me').expect(401);
      await request(ctx.app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: user.password }).expect(401);

      const roles = await admin.get('/api/roles').expect(200);
      const roleId = roles.body.find((r: { code: string }) => r.code === 'EMPLOYEE').id;
      await admin.post('/api/users').send({ name: 'Again', email: user.email, password: 'Welcome123', roleId }).expect(409);
      await admin.delete(`/api/users/${user.id}`).expect(404);
    });

    it('refuses to delete yourself', async () => {
      const myId = await userIdOf(ctx.dataSource, ADMIN.email);
      const res = await admin.delete(`/api/users/${myId}`).expect(409);
      expect(res.body.code).toBe('CONFLICT');
    });

    it('refuses to delete default (seeded) accounts, including the other admin', async () => {
      const priyaId = await userIdOf(ctx.dataSource, PRIYA.email);
      const admin2Id = await userIdOf(ctx.dataSource, 'admin2@taskapp.dev');
      for (const id of [priyaId, admin2Id]) {
        const res = await admin.delete(`/api/users/${id}`).expect(409);
        expect(res.body.message).toMatch(/default/i);
      }
      expect((await admin.get(`/api/users/${priyaId}`).expect(200)).body.isDefault).toBe(true);
    });

    it('refuses to delete a user who has any task, even a completed one, until the task is gone', async () => {
      const user = await createEmployee('busy@taskapp.dev');
      expect((await admin.get(`/api/users/${user.id}`).expect(200)).body.isDefault).toBe(false);
      const tasks = ctx.dataSource.getRepository(Task);
      const adminId = await userIdOf(ctx.dataSource, ADMIN.email);
      const task = await tasks.save(
        tasks.create({
          title: 'Finished work', description: 'x', priority: TaskPriority.LOW, status: TaskStatus.COMPLETED,
          dueDate: '2030-01-01', assigneeId: user.id, createdById: adminId,
        }),
      );

      const blocked = await admin.delete(`/api/users/${user.id}`).expect(409);
      expect(blocked.body.message).toMatch(/assigned task/i);

      await tasks.softDelete(task.id);
      await admin.delete(`/api/users/${user.id}`).expect(204);
    });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd backend && npm run test:e2e -- users`
Expected: FAIL (routes missing).

- [ ] **Step 3: DTOs**

`backend/src/modules/users/dto/create-user.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { NormalizeEmail, Trim } from '../../../common/decorators/trim.decorator';

export class CreateUserDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @NormalizeEmail()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,20}$/, { message: 'phone must be 7–20 characters: digits, spaces, +, -, ( )' })
  phone?: string;

  // 72 is bcrypt's input limit; longer passwords would be silently truncated.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'password must contain at least one letter and one number' })
  password!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  roleId!: number;
}
```
`backend/src/modules/users/dto/update-user.dto.ts` (the role is deliberately not editable: it would break the "assignee must be an Employee" invariant for tasks the user already holds):
```ts
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { NormalizeEmail, Trim } from '../../../common/decorators/trim.decorator';

export class UpdateUserDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  // `null` clears the phone; `IsOptional` skips the checks for null and undefined.
  @IsOptional()
  @Trim()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,20}$/, { message: 'phone must be 7–20 characters: digits, spaces, +, -, ( )' })
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'password must contain at least one letter and one number' })
  password?: string;
}
```
`backend/src/modules/users/dto/list-users-query.dto.ts`:
```ts
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ROLE_CODES, RoleCode } from '../../../common/enums/role-code.enum';

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ROLE_CODES)
  roleCode?: RoleCode;
}
```

- [ ] **Step 4: Service, controllers, module**

`backend/src/modules/users/users.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Paginated, toPaginated } from '../../common/dto/pagination-query.dto';
import { RoleCode } from '../../common/enums/role-code.enum';
import { AppException } from '../../common/errors/app.exception';
import { isDuplicateEntry } from '../../common/errors/db-errors';
import { RefreshToken, Role, Task, User } from '../../database/entities';
import { PasswordService } from '../security/password.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { toUserSummary, UserSummary } from './user.mapper';

const EMAIL_TAKEN = 'A user with this email already exists';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    private readonly passwords: PasswordService,
  ) {}

  listRoles(): Promise<Role[]> {
    return this.roles.find({ order: { id: 'ASC' } });
  }

  async list(query: ListUsersQueryDto): Promise<Paginated<UserSummary>> {
    const qb = this.users
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.role', 'role')
      .where('user.deletedAt IS NULL')
      .orderBy('user.name', 'ASC')
      .addOrderBy('user.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.roleCode) qb.andWhere('role.code = :roleCode', { roleCode: query.roleCode });

    const [rows, total] = await qb.getManyAndCount();
    return toPaginated(rows.map(toUserSummary), total, query.page, query.limit);
  }

  async get(id: number): Promise<UserSummary> {
    return toUserSummary(await this.findActiveOrFail(id));
  }

  async create(dto: CreateUserDto): Promise<UserSummary> {
    const role = await this.roles.findOne({ where: { id: dto.roleId } });
    if (!role) throw AppException.validation([{ field: 'roleId', message: 'Unknown role' }]);

    try {
      const saved = await this.users.save(
        this.users.create({ name: dto.name, email: dto.email, phone: dto.phone ?? null, roleId: role.id, passwordHash: await this.passwords.hash(dto.password) }),
      );
      // Re-read so the response carries the role relation exactly like every other user payload.
      return toUserSummary(await this.users.findOneByOrFail({ id: saved.id }));
    } catch (error) {
      // The unique index is the real guard; a pre-check alone would race.
      if (isDuplicateEntry(error)) throw AppException.conflict(EMAIL_TAKEN);
      throw error;
    }
  }

  /** Changes only the fields that were sent. A new password also signs the user out everywhere. */
  async update(id: number, dto: UpdateUserDto): Promise<UserSummary> {
    const user = await this.findActiveOrFail(id);
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.password !== undefined) user.passwordHash = await this.passwords.hash(dto.password);

    try {
      await this.users.save(user);
    } catch (error) {
      if (isDuplicateEntry(error)) throw AppException.conflict(EMAIL_TAKEN);
      throw error;
    }
    if (dto.password !== undefined) await this.revokeSessions(user.id);
    return toUserSummary(await this.users.findOneByOrFail({ id }));
  }

  /**
   * Soft delete, for non-default users with no tasks. The row stays so tasks, comments and history keep their authors, and the email stays reserved
   * (the unique index still covers it). An access token already issued lives until it expires (30 min at most);
   * refresh and sign-in are refused immediately.
   */
  async remove(actorId: number, id: number): Promise<void> {
    if (actorId === id) throw AppException.conflict('You cannot delete your own account');
    const user = await this.findActiveOrFail(id);
    if (user.isDefault) throw AppException.conflict('Default accounts cannot be deleted');

    // Any status counts, COMPLETED included: a user with task history is kept so that history stays meaningful.
    const assigned = await this.tasks.count({ where: { assigneeId: id } });
    if (assigned > 0) {
      throw AppException.conflict(`This user has ${assigned} assigned task(s). Delete or reassign them before deleting the user.`);
    }

    await this.users.update(user.id, { deletedAt: new Date() });
    await this.revokeSessions(user.id);
  }

  /** Tasks can only be assigned to existing employees. Reported against the `assigneeId` field so forms can show it inline. */
  async ensureAssignableEmployee(userId: number): Promise<User> {
    const user = await this.users.findOne({ where: { id: userId, deletedAt: IsNull() } });
    if (!user || user.role.code !== RoleCode.EMPLOYEE) {
      throw AppException.validation([{ field: 'assigneeId', message: 'Assignee must be an existing employee' }]);
    }
    return user;
  }

  private async findActiveOrFail(id: number): Promise<User> {
    const user = await this.users.findOne({ where: { id, deletedAt: IsNull() } });
    if (!user) throw AppException.notFound('User');
    return user;
  }

  private async revokeSessions(userId: number): Promise<void> {
    await this.refreshTokens.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}
```
`backend/src/modules/users/users.controller.ts`:
```ts
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paginated } from '../../common/dto/pagination-query.dto';
import { RoleCode } from '../../common/enums/role-code.enum';
import { AuthUser } from '../../common/types/request.types';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserSummary } from './user.mapper';
import { UsersService } from './users.service';

const UserIdPipe = new ParseIntPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });

@ApiTags('users')
@Roles(RoleCode.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: ListUsersQueryDto): Promise<Paginated<UserSummary>> {
    return this.users.list(query);
  }

  @Get(':id')
  get(@Param('id', UserIdPipe) id: number): Promise<UserSummary> {
    return this.users.get(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto): Promise<UserSummary> {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(@Param('id', UserIdPipe) id: number, @Body() dto: UpdateUserDto): Promise<UserSummary> {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() actor: AuthUser, @Param('id', UserIdPipe) id: number): Promise<void> {
    return this.users.remove(actor.id, id);
  }
}
```
`backend/src/modules/users/roles.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleCode } from '../../common/enums/role-code.enum';
import { UsersService } from './users.service';

@ApiTags('roles')
@Roles(RoleCode.ADMIN)
@Controller('roles')
export class RolesController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(): Promise<Array<{ id: number; code: string; name: string }>> {
    const roles = await this.users.listRoles();
    return roles.map(({ id, code, name }) => ({ id, code, name }));
  }
}
```
`backend/src/modules/users/users.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken, Role, Task, User } from '../../database/entities';
import { SecurityModule } from '../security/security.module';
import { RolesController } from './roles.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, Task, RefreshToken]), SecurityModule],
  controllers: [UsersController, RolesController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```
Add `UsersModule` to `AppModule.imports`.

- [ ] **Step 5: Run and commit**

Run: `cd backend && npm run test:e2e -- users`
Expected: PASS.
```bash
git add backend
git commit -m "feat(backend): add admin user and role endpoints"
```

---

### Task 8: Tasks — CRUD, role scoping, filters

**Files:**
- Create: `backend/src/common/validators/is-iso-date-only.validator.ts`, `backend/src/common/utils/escape-like.ts`
- Create: `backend/src/modules/tasks/dto/{create-task,update-task,list-tasks-query}.dto.ts`
- Create: `backend/src/modules/tasks/{task.mapper,tasks.service,tasks.controller,tasks.module}.ts`
- Create: `backend/test/helpers/factories.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/common/utils/escape-like.spec.ts`, `backend/test/tasks.e2e-spec.ts`

**Interfaces:**
- Consumes: `UsersService.ensureAssignableEmployee`, `allowedTargets`, `Paginated`
- Produces:
```ts
interface TaskResponse {
  id: number; title: string; description: string; priority: TaskPriority; status: TaskStatus;
  dueDate: string; assignee: PersonRef; createdBy: PersonRef;
  allowedTransitions: TaskStatus[]; createdAt: Date; updatedAt: Date;
}
interface PersonRef { id: number; name: string; email: string }
TasksService.createScopedQuery(user: AuthUser): SelectQueryBuilder<Task>   // alias 'task'
TasksService.getForViewer(user, id): Promise<Task>                          // 404 when out of scope
TasksService.getResponse(user, id): Promise<TaskResponse>
TasksService.list/create/update/remove
```
- Endpoints: `GET /api/tasks`, `POST /api/tasks` (Admin), `GET /api/tasks/:id`, `PATCH /api/tasks/:id` (Admin), `DELETE /api/tasks/:id` (Admin, 204)

- [ ] **Step 1: Test helpers and unit test**

`backend/src/common/utils/escape-like.spec.ts`:
```ts
import { escapeLike } from './escape-like';

describe('escapeLike', () => {
  it('escapes SQL LIKE wildcards and the escape character itself', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('back\\slash')).toBe('back\\\\slash');
    expect(escapeLike('plain')).toBe('plain');
  });
});
```
`backend/test/helpers/factories.ts`:
```ts
import { Agent } from './auth';

export interface TaskBody {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string;
  assignee: { id: number; name: string; email: string };
  allowedTransitions: string[];
  [key: string]: unknown;
}

/** Creates a task as the given admin agent and returns the response body. */
export async function createTask(
  admin: Agent,
  assigneeId: number,
  overrides: Partial<{ title: string; description: string; priority: string; dueDate: string }> = {},
): Promise<TaskBody> {
  const res = await admin
    .post('/api/tasks')
    .send({
      title: 'Prepare quarterly report',
      description: 'Collect figures from every team.',
      priority: 'MEDIUM',
      dueDate: '2030-01-15',
      assigneeId,
      ...overrides,
    })
    .expect(201);
  return res.body as TaskBody;
}
```

- [ ] **Step 2: Write the failing e2e test** — `backend/test/tasks.e2e-spec.ts`

```ts
import request from 'supertest';
import { Task } from '../src/database/entities';
import { ADMIN, Agent, loginAgent, PRIYA, RAHUL, userIdOf } from './helpers/auth';
import { createTask } from './helpers/factories';
import { clearTaskData, createTestApp, TestContext } from './helpers/test-app';

describe('tasks: CRUD, scoping and filters', () => {
  let ctx: TestContext;
  let admin: Agent;
  let priya: Agent;
  let rahul: Agent;
  let priyaId: number;
  let rahulId: number;
  let adminId: number;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAgent(ctx.app, ADMIN);
    priya = await loginAgent(ctx.app, PRIYA);
    rahul = await loginAgent(ctx.app, RAHUL);
    priyaId = await userIdOf(ctx.dataSource, PRIYA.email);
    rahulId = await userIdOf(ctx.dataSource, RAHUL.email);
    adminId = await userIdOf(ctx.dataSource, ADMIN.email);
  });
  beforeEach(async () => clearTaskData(ctx.dataSource));
  afterAll(async () => ctx.close());

  describe('authentication', () => {
    it('protects every task endpoint', async () => {
      const http = request(ctx.app.getHttpServer());
      await http.get('/api/tasks').expect(401);
      await http.post('/api/tasks').send({}).expect(401);
      await http.get('/api/tasks/1').expect(401);
      await http.patch('/api/tasks/1').send({}).expect(401);
      await http.delete('/api/tasks/1').expect(401);
    });
  });

  describe('create', () => {
    it('lets an admin create a PENDING task and records the first history row', async () => {
      const task = await createTask(admin, priyaId, { title: '  Trim me  ' });

      expect(task).toMatchObject({ title: 'Trim me', status: 'PENDING', priority: 'MEDIUM', dueDate: '2030-01-15' });
      expect(task.assignee).toMatchObject({ id: priyaId, email: PRIYA.email });
      expect(task.allowedTransitions).toEqual([]); // admins cannot perform employee steps

      const history = await ctx.dataSource.query('SELECT from_status, to_status, actor_id FROM task_status_history WHERE task_id = ?', [task.id]);
      expect(history).toEqual([{ from_status: null, to_status: 'PENDING', actor_id: adminId }]);
    });

    it('forbids employees from creating, updating or deleting', async () => {
      const task = await createTask(admin, priyaId);
      await priya.post('/api/tasks').send({}).expect(403);
      await priya.patch(`/api/tasks/${task.id}`).send({ title: 'Hacked' }).expect(403);
      await priya.delete(`/api/tasks/${task.id}`).expect(403);
    });

    it('rejects invalid input with field-level details', async () => {
      const base = { title: 'Ok', description: 'Ok', priority: 'LOW', dueDate: '2030-01-01', assigneeId: priyaId };
      const fields = async (body: object): Promise<string[]> => {
        const res = await admin.post('/api/tasks').send(body).expect(422);
        return res.body.details.map((d: { field: string }) => d.field);
      };

      expect(await fields({ ...base, title: '   ' })).toContain('title');
      expect(await fields({ ...base, title: 'x'.repeat(201) })).toContain('title');
      expect(await fields({ ...base, priority: 'URGENT' })).toContain('priority');
      expect(await fields({ ...base, dueDate: '2030-02-30' })).toContain('dueDate');
      expect(await fields({ ...base, dueDate: '15/01/2030' })).toContain('dueDate');
      expect(await fields({ ...base, description: undefined })).toContain('description');
      // Clients may not set workflow fields directly.
      expect(await fields({ ...base, status: 'COMPLETED' })).toContain('status');
    });

    it('only allows assigning to existing employees', async () => {
      const base = { title: 'Ok', description: 'Ok', priority: 'LOW', dueDate: '2030-01-01' };
      for (const assigneeId of [adminId, 99999]) {
        const res = await admin.post('/api/tasks').send({ ...base, assigneeId }).expect(422);
        expect(res.body.details).toEqual([{ field: 'assigneeId', message: 'Assignee must be an existing employee' }]);
      }
    });
  });

  describe('visibility', () => {
    it('shows an employee only their own tasks and an admin all of them', async () => {
      await createTask(admin, priyaId, { title: 'For Priya' });
      await createTask(admin, rahulId, { title: 'For Rahul' });

      const mine = await priya.get('/api/tasks').expect(200);
      expect(mine.body.items.map((t: { title: string }) => t.title)).toEqual(['For Priya']);

      const everything = await admin.get('/api/tasks').expect(200);
      expect(everything.body.items).toHaveLength(2);
    });

    it('ignores an employee trying to widen scope with the assignee filter', async () => {
      await createTask(admin, rahulId, { title: 'For Rahul' });
      const res = await priya.get(`/api/tasks?assigneeId=${rahulId}`).expect(200);
      expect(res.body.items).toEqual([]);
    });

    it('answers 404 (not 403) when an employee asks for someone else\'s task, so its existence is not revealed', async () => {
      const task = await createTask(admin, rahulId);
      const res = await priya.get(`/api/tasks/${task.id}`).expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
      await priya.get('/api/tasks/99999').expect(404);
    });

    it('returns viewer-specific allowedTransitions on detail', async () => {
      const task = await createTask(admin, priyaId);
      expect((await priya.get(`/api/tasks/${task.id}`).expect(200)).body.allowedTransitions).toEqual(['IN_PROGRESS']);
      expect((await admin.get(`/api/tasks/${task.id}`).expect(200)).body.allowedTransitions).toEqual([]);
    });

    it('rejects non-numeric ids', async () => {
      await admin.get('/api/tasks/abc').expect(422);
    });
  });

  describe('filters and pagination', () => {
    beforeEach(async () => {
      await createTask(admin, priyaId, { title: 'Alpha report', priority: 'HIGH' });
      await createTask(admin, priyaId, { title: 'Beta budget 100%', priority: 'LOW' });
      await createTask(admin, rahulId, { title: 'Gamma_audit', priority: 'HIGH' });
      await ctx.dataSource.getRepository(Task).update({ title: 'Alpha report' }, { status: 'IN_PROGRESS' as never });
    });

    const titles = (res: request.Response): string[] => res.body.items.map((t: { title: string }) => t.title).sort();

    it('filters by status, priority and (for admins) employee', async () => {
      expect(titles(await admin.get('/api/tasks?status=IN_PROGRESS').expect(200))).toEqual(['Alpha report']);
      expect(titles(await admin.get('/api/tasks?priority=HIGH').expect(200))).toEqual(['Alpha report', 'Gamma_audit']);
      expect(titles(await admin.get(`/api/tasks?assigneeId=${rahulId}`).expect(200))).toEqual(['Gamma_audit']);
      expect(titles(await admin.get(`/api/tasks?assigneeId=${priyaId}&priority=HIGH`).expect(200))).toEqual(['Alpha report']);
    });

    it('applies filters inside an employee\'s own scope', async () => {
      expect(titles(await priya.get('/api/tasks?priority=HIGH').expect(200))).toEqual(['Alpha report']);
    });

    it('matches % and _ in search literally instead of as wildcards', async () => {
      expect(titles(await admin.get('/api/tasks?search=100%25').expect(200))).toEqual(['Beta budget 100%']);
      expect(titles(await admin.get('/api/tasks?search=%25').expect(200))).toEqual(['Beta budget 100%']);
      expect(titles(await admin.get('/api/tasks?search=a_a').expect(200))).toEqual([]);
      expect(titles(await admin.get('/api/tasks?search=gamma_').expect(200))).toEqual(['Gamma_audit']);
      expect(titles(await admin.get('/api/tasks?search=ALPHA').expect(200))).toEqual(['Alpha report']);
    });

    it('paginates newest first with accurate meta and rejects out-of-range values', async () => {
      const page1 = await admin.get('/api/tasks?limit=2&page=1').expect(200);
      expect(page1.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
      expect(page1.body.items.map((t: { title: string }) => t.title)).toEqual(['Gamma_audit', 'Beta budget 100%']);

      const page2 = await admin.get('/api/tasks?limit=2&page=2').expect(200);
      expect(page2.body.items.map((t: { title: string }) => t.title)).toEqual(['Alpha report']);

      await admin.get('/api/tasks?limit=101').expect(422);
      await admin.get('/api/tasks?page=0').expect(422);
      await admin.get('/api/tasks?status=DONE').expect(422);
    });
  });

  describe('update and delete', () => {
    it('lets an admin edit fields and reassign to another employee', async () => {
      const task = await createTask(admin, priyaId);
      const res = await admin.patch(`/api/tasks/${task.id}`).send({ title: 'Renamed', priority: 'HIGH', assigneeId: rahulId }).expect(200);
      expect(res.body).toMatchObject({ title: 'Renamed', priority: 'HIGH', status: 'PENDING' });
      expect(res.body.assignee.id).toBe(rahulId);

      await priya.get(`/api/tasks/${task.id}`).expect(404);
      await rahul.get(`/api/tasks/${task.id}`).expect(200);
    });

    it('treats an empty patch as a no-op and never lets status be patched', async () => {
      const task = await createTask(admin, priyaId);
      await admin.patch(`/api/tasks/${task.id}`).send({}).expect(200);
      const res = await admin.patch(`/api/tasks/${task.id}`).send({ status: 'COMPLETED' }).expect(422);
      expect(res.body.details[0].field).toBe('status');
    });

    it('does not allow editing a completed task', async () => {
      const task = await createTask(admin, priyaId);
      await ctx.dataSource.query("UPDATE tasks SET status = 'COMPLETED' WHERE id = ?", [task.id]);
      const res = await admin.patch(`/api/tasks/${task.id}`).send({ title: 'Too late' }).expect(409);
      expect(res.body.code).toBe('STATE_CONFLICT');
    });

    it('soft-deletes: the task disappears from the API but its history remains', async () => {
      const task = await createTask(admin, priyaId);
      await admin.delete(`/api/tasks/${task.id}`).expect(204);

      await admin.get(`/api/tasks/${task.id}`).expect(404);
      await priya.get(`/api/tasks/${task.id}`).expect(404);
      expect((await admin.get('/api/tasks').expect(200)).body.items).toEqual([]);
      await admin.delete(`/api/tasks/${task.id}`).expect(404);

      const rows = await ctx.dataSource.query('SELECT deleted_at FROM tasks WHERE id = ?', [task.id]);
      expect(rows[0].deleted_at).not.toBeNull();
      const history = await ctx.dataSource.query('SELECT id FROM task_status_history WHERE task_id = ?', [task.id]);
      expect(history).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `cd backend && npx jest src/common && npm run test:e2e -- tasks`
Expected: FAIL (modules and routes missing).

- [ ] **Step 4: Validators and utils**

`backend/src/common/utils/escape-like.ts`:
```ts
/** Escapes `\`, `%` and `_` so user input is matched literally inside a SQL LIKE pattern. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
```
`backend/src/common/validators/is-iso-date-only.validator.ts`:
```ts
import { registerDecorator, ValidationOptions } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** True for real calendar dates written as YYYY-MM-DD. Rejects shapes like 2030-02-30 that Date would silently roll over. */
export function isIsoDateOnly(value: unknown): boolean {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function IsIsoDateOnly(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isIsoDateOnly',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: { message: `${String(propertyKey)} must be a valid date in YYYY-MM-DD format`, ...options },
      validator: { validate: isIsoDateOnly },
    });
}
```

- [ ] **Step 5: DTOs**

`backend/src/modules/tasks/dto/create-task.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator';
import { TaskPriority } from '../../../common/enums/task-priority.enum';
import { IsIsoDateOnly } from '../../../common/validators/is-iso-date-only.validator';

export class CreateTaskDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;

  @IsEnum(TaskPriority)
  priority!: TaskPriority;

  @IsIsoDateOnly()
  dueDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeId!: number;
}
```
`backend/src/modules/tasks/dto/update-task.dto.ts`:
```ts
import { PartialType } from '@nestjs/swagger';
import { CreateTaskDto } from './create-task.dto';

/** Every field optional. Status is intentionally absent: it only changes through the transition endpoint. */
export class UpdateTaskDto extends PartialType(CreateTaskDto) {}
```
`backend/src/modules/tasks/dto/list-tasks-query.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { TaskPriority } from '../../../common/enums/task-priority.enum';
import { TaskStatus } from '../../../common/enums/task-status.enum';

export class ListTasksQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  /** Honoured for admins only; employees are always limited to their own tasks. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeId?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;
}
```

- [ ] **Step 6: Mapper and service**

`backend/src/modules/tasks/task.mapper.ts`:
```ts
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { AuthUser } from '../../common/types/request.types';
import { Task, User } from '../../database/entities';
import { allowedTargets } from './task-state-machine';

export interface PersonRef {
  id: number;
  name: string;
  email: string;
}

export interface TaskResponse {
  id: number;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  assignee: PersonRef;
  createdBy: PersonRef;
  /** What the current viewer may move this task to. The UI renders from this and never re-implements the rules. */
  allowedTransitions: TaskStatus[];
  createdAt: Date;
  updatedAt: Date;
}

const toPersonRef = ({ id, name, email }: User): PersonRef => ({ id, name, email });

export function toTaskResponse(task: Task, viewer: AuthUser): TaskResponse {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    dueDate: task.dueDate,
    assignee: toPersonRef(task.assignee),
    createdBy: toPersonRef(task.createdBy),
    allowedTransitions: allowedTargets({ role: viewer.role, isAssignee: task.assigneeId === viewer.id }, task.status),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
```
`backend/src/modules/tasks/tasks.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Paginated, toPaginated } from '../../common/dto/pagination-query.dto';
import { RoleCode } from '../../common/enums/role-code.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { AppException } from '../../common/errors/app.exception';
import { AuthUser } from '../../common/types/request.types';
import { escapeLike } from '../../common/utils/escape-like';
import { Task, TaskStatusHistory } from '../../database/entities';
import { UsersService } from '../users/users.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskResponse, toTaskResponse } from './task.mapper';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly users: UsersService,
  ) {}

  /**
   * The single definition of "which tasks may this viewer see". Employees only see tasks assigned to them; everything
   * that reads tasks (list, detail, comments, history, dashboard) starts from this query so the rules cannot drift.
   * Callers must add further conditions with andWhere, never where, or the scope would be overwritten.
   */
  createScopedQuery(user: AuthUser): SelectQueryBuilder<Task> {
    const qb = this.tasks.createQueryBuilder('task');
    if (user.role === RoleCode.EMPLOYEE) qb.andWhere('task.assigneeId = :scopeUserId', { scopeUserId: user.id });
    return qb;
  }

  async list(user: AuthUser, query: ListTasksQueryDto): Promise<Paginated<TaskResponse>> {
    const qb = this.createScopedQuery(user)
      .leftJoinAndSelect('task.assignee', 'assignee')
      .leftJoinAndSelect('task.createdBy', 'createdBy');

    if (query.status) qb.andWhere('task.status = :status', { status: query.status });
    if (query.priority) qb.andWhere('task.priority = :priority', { priority: query.priority });
    if (query.assigneeId && user.role === RoleCode.ADMIN) qb.andWhere('task.assigneeId = :assigneeId', { assigneeId: query.assigneeId });
    if (query.search) qb.andWhere('task.title LIKE :search', { search: `%${escapeLike(query.search)}%` });

    qb.orderBy('task.createdAt', 'DESC')
      .addOrderBy('task.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    return toPaginated(
      rows.map((task) => toTaskResponse(task, user)),
      total,
      query.page,
      query.limit,
    );
  }

  /** Loads a task the viewer is allowed to see, or throws 404 (never 403) so other people's task ids are not revealed. */
  async getForViewer(user: AuthUser, id: number): Promise<Task> {
    const task = await this.createScopedQuery(user)
      .leftJoinAndSelect('task.assignee', 'assignee')
      .leftJoinAndSelect('task.createdBy', 'createdBy')
      .andWhere('task.id = :id', { id })
      .getOne();
    if (!task) throw AppException.notFound('Task');
    return task;
  }

  async getResponse(user: AuthUser, id: number): Promise<TaskResponse> {
    return toTaskResponse(await this.getForViewer(user, id), user);
  }

  async create(admin: AuthUser, dto: CreateTaskDto): Promise<TaskResponse> {
    await this.users.ensureAssignableEmployee(dto.assigneeId);

    const id = await this.dataSource.transaction(async (em) => {
      const task = await em.getRepository(Task).save(
        em.getRepository(Task).create({ ...dto, status: TaskStatus.PENDING, createdById: admin.id }),
      );
      await em.getRepository(TaskStatusHistory).insert({
        taskId: task.id,
        fromStatus: null,
        toStatus: TaskStatus.PENDING,
        actorId: admin.id,
        note: null,
      });
      return task.id;
    });
    return this.getResponse(admin, id);
  }

  async update(admin: AuthUser, id: number, dto: UpdateTaskDto): Promise<TaskResponse> {
    const task = await this.getForViewer(admin, id);
    const changes = Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined));
    if (Object.keys(changes).length === 0) return toTaskResponse(task, admin);

    if (dto.assigneeId !== undefined && dto.assigneeId !== task.assigneeId) {
      await this.users.ensureAssignableEmployee(dto.assigneeId);
    }

    // The status guard lives in the UPDATE itself, so an edit cannot slip in after a concurrent approval.
    const result = await this.tasks
      .createQueryBuilder()
      .update()
      .set(changes)
      .where('id = :id AND status <> :completed AND deleted_at IS NULL', { id, completed: TaskStatus.COMPLETED })
      .execute();
    if (result.affected !== 1) throw AppException.stateConflict('Completed tasks cannot be edited');

    return this.getResponse(admin, id);
  }

  async remove(admin: AuthUser, id: number): Promise<void> {
    await this.getForViewer(admin, id);
    await this.tasks.softDelete(id);
  }
}
```
Note: the "completed task cannot be edited" case is detected by `affected !== 1`; for a task completed *before* the request, `getForViewer` succeeds and the guarded UPDATE affects 0 rows, which yields the same 409.

- [ ] **Step 7: Controller and module**

`backend/src/modules/tasks/tasks.controller.ts` (transition and history routes are added in Task 9):
```ts
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paginated } from '../../common/dto/pagination-query.dto';
import { RoleCode } from '../../common/enums/role-code.enum';
import { AuthUser } from '../../common/types/request.types';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskResponse } from './task.mapper';
import { TasksService } from './tasks.service';

/** A malformed id is a validation problem (422), not a missing resource. */
export const TaskIdPipe = new ParseIntPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListTasksQueryDto): Promise<Paginated<TaskResponse>> {
    return this.tasks.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', TaskIdPipe) id: number): Promise<TaskResponse> {
    return this.tasks.getResponse(user, id);
  }

  @Roles(RoleCode.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto): Promise<TaskResponse> {
    return this.tasks.create(user, dto);
  }

  @Roles(RoleCode.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', TaskIdPipe) id: number, @Body() dto: UpdateTaskDto): Promise<TaskResponse> {
    return this.tasks.update(user, id, dto);
  }

  @Roles(RoleCode.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', TaskIdPipe) id: number): Promise<void> {
    return this.tasks.remove(user, id);
  }
}
```
`backend/src/modules/tasks/tasks.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task, TaskStatusHistory } from '../../database/entities';
import { UsersModule } from '../users/users.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [TypeOrmModule.forFeature([Task, TaskStatusHistory]), UsersModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
```
Add `TasksModule` to `AppModule.imports`.

- [ ] **Step 8: Run and commit**

Run: `cd backend && npx jest src/common && npm run test:e2e -- tasks`
Expected: PASS. (If the `status: 'IN_PROGRESS' as never` seeding line in the filters `beforeEach` complains, import `TaskStatus` and use `TaskStatus.IN_PROGRESS` instead.)
```bash
git add backend
git commit -m "feat(backend): add task CRUD with role scoping, filters and pagination"
```

---

### Task 9: Workflow — transitions, history and comments

**Files:**
- Create: `backend/src/modules/tasks/dto/transition-task.dto.ts`
- Modify: `backend/src/modules/tasks/tasks.service.ts`, `backend/src/modules/tasks/tasks.controller.ts`
- Create: `backend/src/modules/comments/{comments.module,comments.service,comments.controller}.ts`, `backend/src/modules/comments/dto/create-comment.dto.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/workflow.e2e-spec.ts`

**Interfaces:**
- Consumes: `evaluateTransition`, `TasksService.getForViewer`
- Produces:
  - `POST /api/tasks/:id/transition` `{ to, note? }` → `TaskResponse` (throttled 20/min)
  - `GET /api/tasks/:id/history` → `HistoryEntry[]`: `{ id; fromStatus: TaskStatus | null; toStatus; note: string | null; actor: { id; name }; createdAt }`
  - `GET /api/tasks/:id/comments` → `CommentResponse[]`; `POST /api/tasks/:id/comments` `{ body }` → `201 CommentResponse`: `{ id; body; author: { id; name }; createdAt }`

- [ ] **Step 1: Write the failing test** — `backend/test/workflow.e2e-spec.ts`

```ts
import request from 'supertest';
import { ADMIN, Agent, loginAgent, PRIYA, RAHUL, userIdOf } from './helpers/auth';
import { createTask, TaskBody } from './helpers/factories';
import { clearTaskData, createTestApp, TestContext } from './helpers/test-app';

describe('workflow: transitions, approval, history and comments', () => {
  let ctx: TestContext;
  let admin: Agent;
  let priya: Agent;
  let rahul: Agent;
  let priyaId: number;
  let adminId: number;
  let task: TaskBody;

  const transition = (agent: Agent, id: number, to: string, note?: string) =>
    agent.post(`/api/tasks/${id}/transition`).send({ to, ...(note === undefined ? {} : { note }) });
  const statusOf = async (id: number): Promise<string> => (await admin.get(`/api/tasks/${id}`).expect(200)).body.status;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAgent(ctx.app, ADMIN);
    priya = await loginAgent(ctx.app, PRIYA);
    rahul = await loginAgent(ctx.app, RAHUL);
    priyaId = await userIdOf(ctx.dataSource, PRIYA.email);
    adminId = await userIdOf(ctx.dataSource, ADMIN.email);
  });
  beforeEach(async () => {
    await clearTaskData(ctx.dataSource);
    task = await createTask(admin, priyaId);
  });
  afterAll(async () => ctx.close());

  async function moveToPendingApproval(): Promise<void> {
    await transition(priya, task.id, 'IN_PROGRESS').expect(200);
    await transition(priya, task.id, 'PENDING_APPROVAL').expect(200);
  }

  describe('happy path', () => {
    it('runs PENDING → IN_PROGRESS → PENDING_APPROVAL → COMPLETED and records each step', async () => {
      const started = await transition(priya, task.id, 'IN_PROGRESS').expect(200);
      expect(started.body.status).toBe('IN_PROGRESS');
      expect(started.body.allowedTransitions).toEqual(['PENDING_APPROVAL']);

      const submitted = await transition(priya, task.id, 'PENDING_APPROVAL', 'Ready for review').expect(200);
      expect(submitted.body.allowedTransitions).toEqual([]);
      expect((await admin.get(`/api/tasks/${task.id}`).expect(200)).body.allowedTransitions.sort()).toEqual(['COMPLETED', 'IN_PROGRESS']);

      const approved = await transition(admin, task.id, 'COMPLETED').expect(200);
      expect(approved.body.status).toBe('COMPLETED');
      expect(approved.body.allowedTransitions).toEqual([]);

      const history = (await priya.get(`/api/tasks/${task.id}/history`).expect(200)).body;
      expect(history.map((h: { fromStatus: string | null; toStatus: string }) => [h.fromStatus, h.toStatus])).toEqual([
        [null, 'PENDING'],
        ['PENDING', 'IN_PROGRESS'],
        ['IN_PROGRESS', 'PENDING_APPROVAL'],
        ['PENDING_APPROVAL', 'COMPLETED'],
      ]);
      expect(history[2]).toMatchObject({ note: 'Ready for review', actor: { id: priyaId } });
      expect(history[3].actor.id).toBe(adminId);
    });
  });

  describe('rejection', () => {
    it('requires a non-blank reason, then returns the task to IN_PROGRESS with the reason in history', async () => {
      await moveToPendingApproval();

      for (const note of [undefined, '', '   ']) {
        const res = await transition(admin, task.id, 'IN_PROGRESS', note).expect(422);
        expect(res.body.details).toEqual([{ field: 'note', message: 'A reason is required when rejecting a task' }]);
      }
      expect(await statusOf(task.id)).toBe('PENDING_APPROVAL');

      const rejected = await transition(admin, task.id, 'IN_PROGRESS', ' Missing the budget section ').expect(200);
      expect(rejected.body.status).toBe('IN_PROGRESS');

      const history = (await priya.get(`/api/tasks/${task.id}/history`).expect(200)).body;
      expect(history.at(-1)).toMatchObject({ fromStatus: 'PENDING_APPROVAL', toStatus: 'IN_PROGRESS', note: 'Missing the budget section' });

      // The employee can fix the work and submit again.
      await transition(priya, task.id, 'PENDING_APPROVAL').expect(200);
    });
  });

  describe('authorization', () => {
    it('does not let an employee approve or reject (403) and leaves the status unchanged', async () => {
      await moveToPendingApproval();
      const approve = await transition(priya, task.id, 'COMPLETED').expect(403);
      expect(approve.body.code).toBe('FORBIDDEN');
      await transition(priya, task.id, 'IN_PROGRESS', 'self-reject').expect(403);
      expect(await statusOf(task.id)).toBe('PENDING_APPROVAL');
    });

    it('does not let an admin perform the employee steps', async () => {
      await transition(admin, task.id, 'IN_PROGRESS').expect(403);
      await transition(priya, task.id, 'IN_PROGRESS').expect(200);
      await transition(admin, task.id, 'PENDING_APPROVAL').expect(403);
    });

    it('hides the task from an employee who is not the assignee (404)', async () => {
      await transition(rahul, task.id, 'IN_PROGRESS').expect(404);
      await rahul.get(`/api/tasks/${task.id}/history`).expect(404);
      await rahul.get(`/api/tasks/${task.id}/comments`).expect(404);
      await rahul.post(`/api/tasks/${task.id}/comments`).send({ body: 'hi' }).expect(404);
    });

    it('requires authentication', async () => {
      const http = request(ctx.app.getHttpServer());
      await http.post(`/api/tasks/${task.id}/transition`).send({ to: 'IN_PROGRESS' }).expect(401);
      await http.get(`/api/tasks/${task.id}/history`).expect(401);
      await http.get(`/api/tasks/${task.id}/comments`).expect(401);
    });
  });

  describe('invalid transitions', () => {
    it('rejects pairs that have no rule with INVALID_TRANSITION, even for an admin', async () => {
      const skip = await transition(admin, task.id, 'COMPLETED').expect(422);
      expect(skip.body.code).toBe('INVALID_TRANSITION');
      await transition(priya, task.id, 'PENDING_APPROVAL').expect(422);
      await transition(priya, task.id, 'PENDING').expect(422);
    });

    it('treats COMPLETED as final', async () => {
      await moveToPendingApproval();
      await transition(admin, task.id, 'COMPLETED').expect(200);
      for (const to of ['PENDING', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED']) {
        await transition(admin, task.id, to, 'x').expect(422);
      }
    });

    it('validates the payload', async () => {
      await priya.post(`/api/tasks/${task.id}/transition`).send({}).expect(422);
      await priya.post(`/api/tasks/${task.id}/transition`).send({ to: 'DONE' }).expect(422);
      await priya.post(`/api/tasks/${task.id}/transition`).send({ to: 'IN_PROGRESS', note: 'x'.repeat(1001) }).expect(422);
      await priya.post(`/api/tasks/${task.id}/transition`).send({ to: 'IN_PROGRESS', extra: 1 }).expect(422);
    });

    it('treats a soft-deleted task as not found', async () => {
      await admin.delete(`/api/tasks/${task.id}`).expect(204);
      await transition(priya, task.id, 'IN_PROGRESS').expect(404);
    });
  });

  describe('concurrency', () => {
    it('lets exactly one of two simultaneous approvals win and writes a single history row', async () => {
      await moveToPendingApproval();
      const results = await Promise.all([transition(admin, task.id, 'COMPLETED'), transition(admin, task.id, 'COMPLETED')]);

      const statuses = results.map((r) => r.status).sort();
      expect(statuses[0]).toBe(200);
      expect([409, 422]).toContain(statuses[1]);

      const rows = await ctx.dataSource.query("SELECT id FROM task_status_history WHERE task_id = ? AND to_status = 'COMPLETED'", [task.id]);
      expect(rows).toHaveLength(1);
    });
  });

  describe('comments', () => {
    it('lets the assignee and an admin comment, in order, with trimmed bodies', async () => {
      const first = await priya.post(`/api/tasks/${task.id}/comments`).send({ body: '  Started on this  ' }).expect(201);
      expect(first.body).toMatchObject({ body: 'Started on this', author: { id: priyaId, name: 'Priya Sharma' } });
      await admin.post(`/api/tasks/${task.id}/comments`).send({ body: 'Thanks, keep me posted' }).expect(201);

      const list = await priya.get(`/api/tasks/${task.id}/comments`).expect(200);
      expect(list.body.map((c: { body: string }) => c.body)).toEqual(['Started on this', 'Thanks, keep me posted']);
    });

    it('rejects blank or oversized bodies', async () => {
      await priya.post(`/api/tasks/${task.id}/comments`).send({ body: '    ' }).expect(422);
      await priya.post(`/api/tasks/${task.id}/comments`).send({ body: 'x'.repeat(2001) }).expect(422);
      await priya.post(`/api/tasks/${task.id}/comments`).send({}).expect(422);
    });

    it('keeps comments open after completion so follow-ups are possible', async () => {
      await moveToPendingApproval();
      await transition(admin, task.id, 'COMPLETED').expect(200);
      await priya.post(`/api/tasks/${task.id}/comments`).send({ body: 'Thanks!' }).expect(201);
    });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd backend && npm run test:e2e -- workflow`
Expected: FAIL (routes missing).

- [ ] **Step 3: Transition DTO and service methods**

`backend/src/modules/tasks/dto/transition-task.dto.ts`:
```ts
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator';
import { TaskStatus } from '../../../common/enums/task-status.enum';

export class TransitionTaskDto {
  @IsEnum(TaskStatus)
  to!: TaskStatus;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
```
In `tasks.service.ts` add imports (`TransitionTaskDto`, `evaluateTransition`, `TransitionDecision`) and these members to the class:
```ts
export interface HistoryEntry {
  id: number;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  note: string | null;
  actor: { id: number; name: string };
  createdAt: Date;
}
```
(declare `HistoryEntry` above the class), then:
```ts
  async transition(user: AuthUser, id: number, dto: TransitionTaskDto): Promise<TaskResponse> {
    const task = await this.getForViewer(user, id);

    const decision = evaluateTransition({
      role: user.role,
      isAssignee: task.assigneeId === user.id,
      from: task.status,
      to: dto.to,
      note: dto.note,
    });
    if (!decision.allowed) throw this.toTransitionException(decision, task.status, dto.to);

    const from = task.status;
    const note = dto.note?.trim() || null;

    await this.dataSource.transaction(async (em) => {
      // Compare-and-set on the status we validated against. If anyone changed the task since we read it, zero rows
      // match and we fail instead of writing a history row for a transition that did not happen.
      const result = await em
        .getRepository(Task)
        .createQueryBuilder()
        .update()
        .set({ status: dto.to })
        .where('id = :id AND status = :from AND deleted_at IS NULL', { id, from })
        .execute();
      if (result.affected !== 1) {
        throw AppException.stateConflict('This task was just updated by someone else. Please refresh and try again.');
      }
      await em.getRepository(TaskStatusHistory).insert({ taskId: id, fromStatus: from, toStatus: dto.to, actorId: user.id, note });
    });

    return this.getResponse(user, id);
  }

  async listHistory(user: AuthUser, id: number): Promise<HistoryEntry[]> {
    await this.getForViewer(user, id);
    const rows = await this.dataSource
      .getRepository(TaskStatusHistory)
      .createQueryBuilder('history')
      .innerJoinAndSelect('history.actor', 'actor')
      .where('history.taskId = :id', { id })
      .orderBy('history.createdAt', 'ASC')
      .addOrderBy('history.id', 'ASC')
      .getMany();

    return rows.map((row) => ({
      id: row.id,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      note: row.note,
      actor: { id: row.actor.id, name: row.actor.name },
      createdAt: row.createdAt,
    }));
  }

  private toTransitionException(decision: Extract<TransitionDecision, { allowed: false }>, from: TaskStatus, to: TaskStatus): AppException {
    switch (decision.reason) {
      case 'INVALID_TRANSITION':
        return AppException.invalidTransition(`A task cannot move from ${from} to ${to}`);
      case 'NOTE_REQUIRED':
        return AppException.validation([{ field: 'note', message: 'A reason is required when rejecting a task' }]);
      case 'FORBIDDEN':
        return AppException.forbidden('You are not allowed to make this status change');
    }
  }
```
Import line to add: `import { evaluateTransition, TransitionDecision } from './task-state-machine';`

- [ ] **Step 4: Controller routes**

In `tasks.controller.ts` add `import { Throttle } from '@nestjs/throttler';`, the DTO import `TransitionTaskDto`, `HistoryEntry` import from the service, and these handlers inside the class:
```ts
  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  transition(@CurrentUser() user: AuthUser, @Param('id', TaskIdPipe) id: number, @Body() dto: TransitionTaskDto): Promise<TaskResponse> {
    return this.tasks.transition(user, id, dto);
  }

  @Get(':id/history')
  history(@CurrentUser() user: AuthUser, @Param('id', TaskIdPipe) id: number): Promise<HistoryEntry[]> {
    return this.tasks.listHistory(user, id);
  }
```
Also `export` `HistoryEntry` from `tasks.service.ts`.

- [ ] **Step 5: Comments module**

`backend/src/modules/comments/dto/create-comment.dto.ts`:
```ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator';

export class CreateCommentDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}
```
`backend/src/modules/comments/comments.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/types/request.types';
import { TaskComment } from '../../database/entities';
import { TasksService } from '../tasks/tasks.service';

export interface CommentResponse {
  id: number;
  body: string;
  author: { id: number; name: string };
  createdAt: Date;
}

/** Upper bound for one task's thread; real tasks stay far below it, and it keeps a response from growing without limit. */
const MAX_COMMENTS_PER_RESPONSE = 500;

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(TaskComment) private readonly comments: Repository<TaskComment>,
    private readonly tasks: TasksService,
  ) {}

  async list(user: AuthUser, taskId: number): Promise<CommentResponse[]> {
    await this.tasks.getForViewer(user, taskId); // 404 for tasks outside the viewer's scope
    const rows = await this.comments.find({
      where: { taskId },
      relations: { author: true },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: MAX_COMMENTS_PER_RESPONSE,
    });
    return rows.map(this.toResponse);
  }

  async create(user: AuthUser, taskId: number, body: string): Promise<CommentResponse> {
    await this.tasks.getForViewer(user, taskId);
    const saved = await this.comments.save(this.comments.create({ taskId, authorId: user.id, body }));
    const row = await this.comments.findOneOrFail({ where: { id: saved.id }, relations: { author: true } });
    return this.toResponse(row);
  }

  private toResponse(row: TaskComment): CommentResponse {
    return { id: row.id, body: row.body, author: { id: row.author.id, name: row.author.name }, createdAt: row.createdAt };
  }
}
```
`backend/src/modules/comments/comments.controller.ts`:
```ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/request.types';
import { TaskIdPipe } from '../tasks/tasks.controller';
import { CommentResponse, CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@ApiTags('comments')
@Controller('tasks/:id/comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('id', TaskIdPipe) id: number): Promise<CommentResponse[]> {
    return this.comments.list(user, id);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@CurrentUser() user: AuthUser, @Param('id', TaskIdPipe) id: number, @Body() dto: CreateCommentDto): Promise<CommentResponse> {
    return this.comments.create(user, id, dto.body);
  }
}
```
`backend/src/modules/comments/comments.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskComment } from '../../database/entities';
import { TasksModule } from '../tasks/tasks.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [TypeOrmModule.forFeature([TaskComment]), TasksModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
```
Add `CommentsModule` to `AppModule.imports`.

- [ ] **Step 6: Run and commit**

Run: `cd backend && npm run test:e2e -- workflow && npm run test:e2e -- tasks`
Expected: PASS for both.
```bash
git add backend
git commit -m "feat(backend): add status transitions with history, approval flow and comments"
```

---

### Task 10: Dashboard, health, hardening tests and final verification

**Files:**
- Create: `backend/src/modules/dashboard/{dashboard.module,dashboard.service,dashboard.controller}.ts`
- Create: `backend/src/modules/health/{health.module,health.controller}.ts`
- Modify: `backend/src/app.module.ts`, `backend/nest-cli.json`
- Test: `backend/test/dashboard.e2e-spec.ts`, `backend/test/security.e2e-spec.ts`, `backend/test/throttling.e2e-spec.ts`

**Interfaces:**
- Produces: `GET /api/dashboard` → `{ counts: Record<TaskStatus, number>; total: number }` (scoped); `GET /api/health` → `{ status: 'ok'; db: 'up' }` (public, not throttled)

- [ ] **Step 1: Write the failing tests**

`backend/test/dashboard.e2e-spec.ts`:
```ts
import request from 'supertest';
import { ADMIN, Agent, loginAgent, PRIYA, RAHUL, userIdOf } from './helpers/auth';
import { createTask } from './helpers/factories';
import { clearTaskData, createTestApp, TestContext } from './helpers/test-app';

describe('dashboard and health', () => {
  let ctx: TestContext;
  let admin: Agent;
  let priya: Agent;
  let rahul: Agent;
  let priyaId: number;
  let rahulId: number;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAgent(ctx.app, ADMIN);
    priya = await loginAgent(ctx.app, PRIYA);
    rahul = await loginAgent(ctx.app, RAHUL);
    priyaId = await userIdOf(ctx.dataSource, PRIYA.email);
    rahulId = await userIdOf(ctx.dataSource, RAHUL.email);
  });
  beforeEach(async () => clearTaskData(ctx.dataSource));
  afterAll(async () => ctx.close());

  const zero = { PENDING: 0, IN_PROGRESS: 0, PENDING_APPROVAL: 0, COMPLETED: 0 };

  it('requires authentication', async () => {
    await request(ctx.app.getHttpServer()).get('/api/dashboard').expect(401);
  });

  it('returns zeros for every status when there are no tasks', async () => {
    const res = await admin.get('/api/dashboard').expect(200);
    expect(res.body).toEqual({ counts: zero, total: 0 });
  });

  it('counts all tasks for an admin and only own tasks for an employee, matching the list', async () => {
    const a = await createTask(admin, priyaId);
    await createTask(admin, priyaId);
    await createTask(admin, rahulId);
    await ctx.dataSource.query("UPDATE tasks SET status = 'IN_PROGRESS' WHERE id = ?", [a.id]);

    expect((await admin.get('/api/dashboard').expect(200)).body).toEqual({ counts: { ...zero, PENDING: 2, IN_PROGRESS: 1 }, total: 3 });
    expect((await priya.get('/api/dashboard').expect(200)).body).toEqual({ counts: { ...zero, PENDING: 1, IN_PROGRESS: 1 }, total: 2 });
    expect((await rahul.get('/api/dashboard').expect(200)).body).toEqual({ counts: { ...zero, PENDING: 1 }, total: 1 });

    const list = await priya.get('/api/tasks').expect(200);
    expect(list.body.meta.total).toBe(2);
  });

  it('excludes soft-deleted tasks', async () => {
    const task = await createTask(admin, priyaId);
    await admin.delete(`/api/tasks/${task.id}`).expect(204);
    expect((await admin.get('/api/dashboard').expect(200)).body.total).toBe(0);
  });

  it('exposes a public health check that confirms the database', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });
});
```
`backend/test/security.e2e-spec.ts`:
```ts
import request from 'supertest';
import { ADMIN } from './helpers/auth';
import { createTestApp, TestContext } from './helpers/test-app';

describe('request origin policy and headers', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.close());

  it('refuses a state-changing request from an unknown origin', async () => {
    const res = await http().post('/api/auth/login').set('Origin', 'https://evil.example').send(ADMIN).expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('accepts the same request from an allowed origin and from a client without Origin', async () => {
    await http().post('/api/auth/login').set('Origin', 'http://localhost:3000').send(ADMIN).expect(200);
    await http().post('/api/auth/login').send(ADMIN).expect(200);
  });

  it('answers CORS preflight only for allowed origins and allows credentials', async () => {
    const allowed = await http().options('/api/tasks').set('Origin', 'http://localhost:3000').set('Access-Control-Request-Method', 'GET');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await http().options('/api/tasks').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sends hardening headers', async () => {
    const res = await http().get('/api/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
```
`backend/test/throttling.e2e-spec.ts`:
```ts
import request from 'supertest';
import { ADMIN, PRIYA } from './helpers/auth';
import { createTestApp, TestContext } from './helpers/test-app';

describe('throttling', () => {
  let ctx: TestContext;
  const login = (credentials: { email: string; password: string }) =>
    request(ctx.app.getHttpServer()).post('/api/auth/login').send(credentials);

  beforeAll(async () => {
    ctx = await createTestApp({ THROTTLING_ENABLED: 'true' });
  });
  afterAll(async () => ctx.close());

  it('blocks the sixth login attempt for the same email with RATE_LIMITED and a Retry-After header', async () => {
    const wrong = { email: ADMIN.email, password: 'Wrong@12345' };
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await login(wrong).expect(401);
    }
    const blocked = await login(wrong).expect(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();

    // Even the correct password is refused while the bucket is full.
    await login(ADMIN).expect(429);
  });

  it('keys the login limit by email, so one locked account does not lock everyone out', async () => {
    await login(PRIYA).expect(200);
  });
});
```

- [ ] **Step 2: Run to see failures**

Run: `cd backend && npm run test:e2e -- dashboard security throttling`
Expected: dashboard FAIL (routes missing); security and throttling may already pass except where `x-powered-by` or `/api/health` are involved (health fails). Proceed to implement.

- [ ] **Step 3: Dashboard and health**

`backend/src/modules/dashboard/dashboard.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { AuthUser } from '../../common/types/request.types';
import { TasksService } from '../tasks/tasks.service';

export interface DashboardResponse {
  counts: Record<TaskStatus, number>;
  total: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly tasks: TasksService) {}

  async getCounts(user: AuthUser): Promise<DashboardResponse> {
    // Built on the same scoped query as the task list, so the numbers can never disagree with what the user can open.
    const rows = await this.tasks
      .createScopedQuery(user)
      .select('task.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('task.status')
      .getRawMany<{ status: TaskStatus; count: string }>();

    const counts = Object.values(TaskStatus).reduce(
      (acc, status) => ({ ...acc, [status]: 0 }),
      {} as Record<TaskStatus, number>,
    );
    for (const row of rows) counts[row.status] = Number(row.count);

    return { counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
  }
}
```
`backend/src/modules/dashboard/dashboard.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/request.types';
import { DashboardResponse, DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@CurrentUser() user: AuthUser): Promise<DashboardResponse> {
    return this.dashboard.getCounts(user);
  }
}
```
`backend/src/modules/dashboard/dashboard.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TasksModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
```
`backend/src/modules/health/health.controller.ts`:
```ts
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';

/** Target of Render's health check and the uptime ping that keeps the free instance warm. */
@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  async check(): Promise<{ status: 'ok'; db: 'up' }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ok', db: 'up' };
  }
}
```
`backend/src/modules/health/health.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
```
Add `DashboardModule` and `HealthModule` to `AppModule.imports`. Enable Swagger schema generation from DTOs by editing `backend/nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "plugins": ["@nestjs/swagger"]
  }
}
```

- [ ] **Step 4: Run the whole backend suite**

Run: `cd backend && npx jest && npm run test:e2e`
Expected: every unit and e2e spec PASS. If `x-powered-by` is still present, call `(app as NestExpressApplication).disable('x-powered-by')` in `configureApp` (helmet normally removes it).

- [ ] **Step 5: Lint, build and smoke the real server against Aiven**

Run:
```bash
cd backend && npm run lint && npm run build
npm run migration:run          # connects to Aiven over TLS using backend/.env
npm run seed
npm run start:prod &           # or: npm run start:dev
sleep 6 && curl -s localhost:4000/api/health && echo
curl -s -c /tmp/jar -H 'Content-Type: application/json' -d '{"email":"admin@taskapp.dev","password":"Admin@12345"}' localhost:4000/api/auth/login && echo
curl -s -b /tmp/jar localhost:4000/api/dashboard && echo
```
Expected: health `{"status":"ok","db":"up"}`; login returns the admin user; dashboard returns counts including the seeded sample tasks. Open `http://localhost:4000/api/docs` and confirm Swagger lists every route. Stop the server afterwards.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(backend): add dashboard, health check and hardening tests"
```
