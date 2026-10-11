# Backend Foundation Implementation Plan (Plan 1 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the NestJS backend skeleton: repo scaffolding, validated config, the shared error contract, the MySQL schema with migrations and seed, and the pure task state machine.

**Architecture:** NestJS (Express) with a global `/api` prefix. One error shape for every failure, produced by a global filter. TypeORM entities with snake_case columns, schema owned by migrations only (`synchronize: false`). The task workflow rules live in a pure, DB-free function so they can be tested exhaustively.

**Tech Stack:** Node 20+, NestJS, TypeScript (strict), TypeORM + mysql2, MySQL 8 (docker-compose), zod (env), class-validator, Jest + supertest.

**Spec:** `docs/superpowers/specs/2026-10-10-task-approval-design.md`

**Plan series:** 01 backend foundation (this) → 02 backend features → 03 frontend foundation → 04 frontend features → 05 delivery. Each plan leaves working, tested software.

## Global Constraints

- TypeScript `strict: true`; no `any`; explicit return types on exported functions; comments explain *why*, not *what*.
- API prefix `/api`. Every error body: `{ statusCode, code, message, details?, requestId, timestamp, path }`. Codes: `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `INVALID_TRANSITION`, `STATE_CONFLICT`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`.
- Enums: `TaskStatus` = `PENDING | IN_PROGRESS | PENDING_APPROVAL | COMPLETED`; `TaskPriority` = `LOW | MEDIUM | HIGH`; role codes `ADMIN | EMPLOYEE` (roles are rows in `roles`).
- Access token JWT 30 min; refresh token opaque, 1 year, SHA-256 hashed in DB, rotated. Cookies `access_token` (Path `/api`) and `refresh_token` (Path `/api/auth`), HttpOnly, both Max-Age 1 year.
- Schema changes only through migrations. Passwords: bcrypt. Parameterized queries only. No secrets in git: only `.env.example` files are committed.
- Local ports: MySQL dev `3306`, MySQL test `3307`, backend `4000`, frontend `3000`.
- Commit messages are conventional (`feat:`, `test:`, `chore:`) and end with the attribution trailer the session requires.

## Review Focus

Failure modes the spec implies that deserve a test (each is pinned in the owning task):

1. Malformed or unknown request body fields must produce the standard 422 shape, not Nest's default error (Task 2).
2. An unknown route must return the standard error shape with a `requestId` header (Task 2).
3. Missing/invalid environment values must stop the app at boot, especially insecure production cookie/origin settings (Task 1).
4. Re-running the seed must not create duplicates (Task 3).
5. A transition whose actor is right but whose note is blank (whitespace) must be rejected (Task 4).

---

## File Structure

```
task-approval-app/
  .gitignore
  docker-compose.yml
  backend/
    package.json                      scripts for test, migrations, seed
    .env.example  .env.test.example
    src/
      main.ts                         bootstrap only
      app.setup.ts                    configureApp(): prefix, helmet, cookies, CORS, pipe, filter (shared with e2e)
      swagger.setup.ts
      app.module.ts
      config/env.validation.ts        zod schema + validateEnv()
      common/
        enums/{task-status,task-priority,role-code}.enum.ts
        errors/{error-codes.ts,app.exception.ts,resolve-error.ts,all-exceptions.filter.ts}
        pipes/validation.pipe.ts
        middleware/request-id.middleware.ts
        decorators/trim.decorator.ts
        dto/pagination-query.dto.ts
        types/request.types.ts        Express.Request augmentation + AuthUser
      database/
        entities/{role,user,task,task-comment,task-status-history,refresh-token}.entity.ts
        entities/index.ts
        typeorm.options.ts            buildDataSourceOptions()
        data-source.ts                CLI DataSource (default export)
        migrations/                   generated InitSchema
        seeds/{demo-data.ts,run-seed.ts,seed.ts}
      modules/tasks/task-state-machine.ts
    test/
      jest-e2e.json  setup-env.ts
      helpers/test-app.ts
      *.e2e-spec.ts
```

---

### Task 1: Repo bootstrap, backend scaffold and validated config

**Files:**
- Create: `.gitignore`, `docker-compose.yml`
- Create: `backend/` (via Nest CLI), `backend/src/config/env.validation.ts`, `backend/.env.example`, `backend/.env.test.example`
- Test: `backend/src/config/env.validation.spec.ts`

**Interfaces:**
- Produces: `validateEnv(raw: Record<string, unknown>): Env`, `type Env`, `envSchema`

- [ ] **Step 1: Create root files**

`.gitignore`:
```gitignore
node_modules/
dist/
.next/
coverage/
playwright-report/
test-results/
*.log
.DS_Store
.env
.env.*
!.env.example
!.env.test.example
```

`docker-compose.yml` (local-only throwaway credentials, overridable via env):
```yaml
services:
  mysql:
    image: mysql:8.0
    container_name: taskapp-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-rootpass}
      MYSQL_DATABASE: ${MYSQL_DATABASE:-taskapp}
      MYSQL_USER: ${MYSQL_USER:-taskapp}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:-taskapp}
    ports:
      - '3306:3306'
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost', '-uroot', '-p${MYSQL_ROOT_PASSWORD:-rootpass}']
      interval: 5s
      timeout: 5s
      retries: 20

  # Separate instance for e2e tests: data lives in RAM and is wiped on every run.
  mysql_test:
    image: mysql:8.0
    container_name: taskapp-mysql-test
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-rootpass}
      MYSQL_DATABASE: taskapp_test
      MYSQL_USER: ${MYSQL_USER:-taskapp}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:-taskapp}
    ports:
      - '3307:3306'
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
    tmpfs:
      - /var/lib/mysql
    healthcheck:
      test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost', '-uroot', '-p${MYSQL_ROOT_PASSWORD:-rootpass}']
      interval: 5s
      timeout: 5s
      retries: 20

volumes:
  mysql_data:
```

- [ ] **Step 2: Scaffold the Nest app and remove the demo files**

Run from the repo root:
```bash
npx @nestjs/cli@latest new backend --package-manager npm --skip-git --strict
rm backend/src/app.controller.ts backend/src/app.controller.spec.ts backend/src/app.service.ts
```
Then replace `backend/src/app.module.ts` with:
```ts
import { Module } from '@nestjs/common';

@Module({})
export class AppModule {}
```

- [ ] **Step 3: Install dependencies**

```bash
cd backend
npm i @nestjs/config @nestjs/typeorm typeorm mysql2 typeorm-naming-strategies @nestjs/jwt @nestjs/throttler @nestjs/swagger class-validator class-transformer cookie-parser helmet bcrypt zod dotenv
npm i -D @types/cookie-parser @types/bcrypt
```
Confirm `supertest`, `@types/supertest`, `jest`, `ts-jest` are already in `devDependencies` (the Nest scaffold adds them). If the installed zod is v4, nothing below changes.

- [ ] **Step 4: Write the failing test** — `backend/src/config/env.validation.spec.ts`

```ts
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
```

- [ ] **Step 5: Run it to see it fail**

Run: `cd backend && npx jest src/config/env.validation.spec.ts`
Expected: FAIL, "Cannot find module './env.validation'".

- [ ] **Step 6: Implement** — `backend/src/config/env.validation.ts`

```ts
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
```

- [ ] **Step 7: Create the env example files**

`backend/.env.example`:
```dotenv
NODE_ENV=development
PORT=4000

DB_HOST=localhost
DB_PORT=3306
DB_USER=taskapp
DB_PASSWORD=taskapp
DB_NAME=taskapp
DB_SSL=false
# DB_SSL_CA=   (PEM text; use \n for line breaks when set as a single-line variable)

# Generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_ACCESS_SECRET=replace-with-a-random-string-of-at-least-32-characters
ACCESS_TOKEN_TTL=30m
REFRESH_TOKEN_TTL_DAYS=365

COOKIE_SECURE=false
COOKIE_SAMESITE=lax
FRONTEND_ORIGINS=http://localhost:3000
TRUST_PROXY_HOPS=0
THROTTLING_ENABLED=true
```

`backend/.env.test.example`:
```dotenv
NODE_ENV=test
PORT=4001

DB_HOST=localhost
DB_PORT=3307
DB_USER=taskapp
DB_PASSWORD=taskapp
DB_NAME=taskapp_test
DB_SSL=false

JWT_ACCESS_SECRET=test-secret-test-secret-test-secret-0123456789
ACCESS_TOKEN_TTL=30m
REFRESH_TOKEN_TTL_DAYS=365

COOKIE_SECURE=false
COOKIE_SAMESITE=lax
FRONTEND_ORIGINS=http://localhost:3000
TRUST_PROXY_HOPS=0
# Off by default so repeated logins in tests are not rate limited; the throttling spec turns it on.
THROTTLING_ENABLED=false
```

- [ ] **Step 8: Run tests**

Run: `cd backend && npx jest src/config/env.validation.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 9: Commit**

```bash
cd .. && git init -q 2>/dev/null; git add .gitignore docker-compose.yml backend
git commit -m "chore: scaffold backend with validated environment config"
```

---

### Task 2: Shared building blocks — error contract, validation pipe, request id, app setup

**Files:**
- Create: `backend/src/common/enums/{task-status,task-priority,role-code}.enum.ts`
- Create: `backend/src/common/errors/{error-codes,app.exception,resolve-error,all-exceptions.filter}.ts`
- Create: `backend/src/common/pipes/validation.pipe.ts`
- Create: `backend/src/common/middleware/request-id.middleware.ts`
- Create: `backend/src/common/decorators/trim.decorator.ts`
- Create: `backend/src/common/dto/pagination-query.dto.ts`
- Create: `backend/src/common/types/request.types.ts`
- Create: `backend/src/app.setup.ts`, `backend/src/swagger.setup.ts`; Modify: `backend/src/main.ts`, `backend/src/app.module.ts`
- Create: `backend/test/jest-e2e.json`, `backend/test/setup-env.ts`, `backend/test/helpers/test-app.ts`
- Test: `backend/src/common/errors/resolve-error.spec.ts`, `backend/src/common/pipes/validation.pipe.spec.ts`, `backend/test/error-contract.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `enum TaskStatus`, `enum TaskPriority`, `const RoleCode` + `type RoleCode`
  - `enum ErrorCode`; `class AppException(status, code, message, details?)` with statics `unauthenticated(msg?)`, `tokenExpired()`, `forbidden(msg?)`, `notFound(what?)`, `validation(details, msg?)`, `invalidTransition(msg)`, `stateConflict(msg)`, `conflict(msg)`
  - `resolveError(exception: unknown): ResolvedError`
  - `createValidationPipe(): ValidationPipe`, `flattenValidationErrors(errors, parent?)`
  - `configureApp(app: INestApplication): void`
  - `PaginationQueryDto { page: number; limit: number }`, `Paginated<T>`, `toPaginated(items, total, page, limit)`
  - `@Trim()` property decorator; `AuthUser { id: number; role: RoleCode }`; `Express.Request` gains `id?: string` and `user?: AuthUser`
  - e2e helper `createTestApp(envOverrides?)`

- [ ] **Step 1: Write the failing unit tests**

`backend/src/common/errors/resolve-error.spec.ts`:
```ts
import { BadRequestException, ForbiddenException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppException } from './app.exception';
import { ErrorCode } from './error-codes';
import { resolveError } from './resolve-error';

describe('resolveError', () => {
  it('passes AppException through unchanged', () => {
    const resolved = resolveError(AppException.stateConflict('changed'));
    expect(resolved).toEqual({ statusCode: 409, code: ErrorCode.STATE_CONFLICT, message: 'changed', details: undefined });
  });

  it('keeps validation details', () => {
    const resolved = resolveError(AppException.validation([{ field: 'title', message: 'must not be empty' }]));
    expect(resolved.statusCode).toBe(422);
    expect(resolved.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(resolved.details).toEqual([{ field: 'title', message: 'must not be empty' }]);
  });

  it('maps framework HttpExceptions to stable codes', () => {
    expect(resolveError(new NotFoundException()).code).toBe(ErrorCode.NOT_FOUND);
    expect(resolveError(new ForbiddenException()).code).toBe(ErrorCode.FORBIDDEN);
    expect(resolveError(new BadRequestException('bad json')).code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('maps throttling to RATE_LIMITED', () => {
    const resolved = resolveError(new ThrottlerException());
    expect(resolved.statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(resolved.code).toBe(ErrorCode.RATE_LIMITED);
  });

  it('hides internals of unknown errors', () => {
    const resolved = resolveError(new Error('SQL syntax error near ...'));
    expect(resolved).toMatchObject({ statusCode: 500, code: ErrorCode.INTERNAL_ERROR, message: 'Something went wrong' });
  });
});
```

`backend/src/common/pipes/validation.pipe.spec.ts`:
```ts
import { IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AppException } from '../errors/app.exception';
import { createValidationPipe } from './validation.pipe';

class ChildDto {
  @IsString() @MinLength(3) name!: string;
}
class ParentDto {
  @IsString() title!: string;
  @ValidateNested() @Type(() => ChildDto) child!: ChildDto;
}

describe('createValidationPipe', () => {
  const pipe = createValidationPipe();
  const meta = { type: 'body' as const, metatype: ParentDto };

  it('returns a 422 AppException with flattened field details', async () => {
    const error = await pipe.transform({ title: 5, child: { name: 'a' } }, meta).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    const exception = error as AppException;
    expect(exception.getStatus()).toBe(422);
    expect(exception.details?.map((d) => d.field).sort()).toEqual(['child.name', 'title']);
  });

  it('rejects unknown fields', async () => {
    const error = (await pipe
      .transform({ title: 'ok', child: { name: 'abc' }, isAdmin: true }, meta)
      .catch((e: unknown) => e)) as AppException;
    expect(error.details?.[0]).toEqual({ field: 'isAdmin', message: 'property isAdmin should not exist' });
  });

  it('accepts a valid payload', async () => {
    await expect(pipe.transform({ title: 'ok', child: { name: 'abc' } }, meta)).resolves.toBeInstanceOf(ParentDto);
  });
});
```

- [ ] **Step 2: Run to see failures**

Run: `cd backend && npx jest src/common`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement enums and types**

`backend/src/common/enums/task-status.enum.ts`:
```ts
export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  COMPLETED = 'COMPLETED',
}
```
`backend/src/common/enums/task-priority.enum.ts`:
```ts
export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}
```
`backend/src/common/enums/role-code.enum.ts`:
```ts
/**
 * Codes of the system roles stored in the `roles` table. Roles are data, but what a role may do is decided in code
 * (guards and the task state machine key off these codes), so adding a role row alone grants no permissions.
 */
export const RoleCode = {
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
} as const;

export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

export const ROLE_CODES: readonly RoleCode[] = Object.values(RoleCode);
```
`backend/src/common/types/request.types.ts`:
```ts
import type { RoleCode } from '../enums/role-code.enum';

/** Identity carried by a verified access token. Display data (name, email) is loaded from the DB when needed. */
export interface AuthUser {
  id: number;
  role: RoleCode;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
      user?: AuthUser;
    }
  }
}
```

- [ ] **Step 4: Implement the error contract**

`backend/src/common/errors/error-codes.ts`:
```ts
export enum ErrorCode {
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_TRANSITION = 'INVALID_TRANSITION',
  STATE_CONFLICT = 'STATE_CONFLICT',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
```
`backend/src/common/errors/app.exception.ts`:
```ts
import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export interface ErrorDetail {
  field: string;
  message: string;
}

/** The only exception type domain code throws, so every failure carries a stable, client-facing `code`. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message, status);
  }

  static unauthenticated(message = 'Authentication required'): AppException {
    return new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHENTICATED, message);
  }

  static tokenExpired(): AppException {
    return new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.TOKEN_EXPIRED, 'Access token expired');
  }

  static forbidden(message = 'You do not have permission to perform this action'): AppException {
    return new AppException(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, message);
  }

  static notFound(what = 'Resource'): AppException {
    return new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, `${what} not found`);
  }

  static validation(details: ErrorDetail[], message = 'Validation failed'): AppException {
    return new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_ERROR, message, details);
  }

  static invalidTransition(message: string): AppException {
    return new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.INVALID_TRANSITION, message);
  }

  static stateConflict(message: string): AppException {
    return new AppException(HttpStatus.CONFLICT, ErrorCode.STATE_CONFLICT, message);
  }

  static conflict(message: string): AppException {
    return new AppException(HttpStatus.CONFLICT, ErrorCode.CONFLICT, message);
  }
}
```
`backend/src/common/errors/resolve-error.ts`:
```ts
import { HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppException, ErrorDetail } from './app.exception';
import { ErrorCode } from './error-codes';

export interface ResolvedError {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: ErrorDetail[];
}

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

/** Pure mapping from any thrown value to the public error contract. Kept separate from the filter so it is trivially testable. */
export function resolveError(exception: unknown): ResolvedError {
  if (exception instanceof AppException) {
    return {
      statusCode: exception.getStatus(),
      code: exception.code,
      message: exception.message,
      details: exception.details,
    };
  }
  if (exception instanceof ThrottlerException) {
    return {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many requests. Please try again shortly.',
    };
  }
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    return {
      statusCode,
      code: CODE_BY_STATUS[statusCode] ?? ErrorCode.INTERNAL_ERROR,
      message: exception.message,
    };
  }
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode.INTERNAL_ERROR,
    message: 'Something went wrong',
  };
}
```
`backend/src/common/errors/all-exceptions.filter.ts`:
```ts
import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import '../types/request.types';
import { resolveError } from './resolve-error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const resolved = resolveError(exception);

    if (resolved.statusCode >= 500) {
      // Full detail goes to the logs, correlated by request id; the client only ever sees the generic message.
      this.logger.error(
        `[${request.id}] ${request.method} ${request.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(resolved.statusCode).json({
      ...resolved,
      requestId: request.id,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }
}
```

- [ ] **Step 5: Implement validation pipe, request id, trim, pagination**

`backend/src/common/pipes/validation.pipe.ts`:
```ts
import { ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException, ErrorDetail } from '../errors/app.exception';

export function flattenValidationErrors(errors: ValidationError[], parent = ''): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => AppException.validation(flattenValidationErrors(errors)),
  });
}
```
`backend/src/common/middleware/request-id.middleware.ts`:
```ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import '../types/request.types';

const MAX_INCOMING_ID_LENGTH = 100;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.header('x-request-id');
    // Honour an upstream id (e.g. from the Vercel proxy) for end-to-end tracing, but never trust unbounded input.
    request.id = incoming && incoming.length <= MAX_INCOMING_ID_LENGTH ? incoming : randomUUID();
    response.setHeader('X-Request-Id', request.id);
    next();
  }
}
```
`backend/src/common/decorators/trim.decorator.ts`:
```ts
import { Transform } from 'class-transformer';

/** Trims string input so "  " fails @IsNotEmpty and stored text has no stray whitespace. */
export const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** Trims and lower-cases, used for e-mail addresses so lookups are case-insensitive. */
export const NormalizeEmail = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));
```
`backend/src/common/dto/pagination-query.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export const MAX_PAGE_SIZE = 100;

export class PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = 20;
}

export interface Paginated<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export function toPaginated<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
  return { items, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}
```

- [ ] **Step 6: Run unit tests**

Run: `cd backend && npx jest src/common`
Expected: PASS (resolve-error 5, validation pipe 3).

- [ ] **Step 7: Write app setup, swagger, main and module**

`backend/src/app.setup.ts`:
```ts
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Env } from './config/env.validation';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { createValidationPipe } from './common/pipes/validation.pipe';

/**
 * Everything that makes the HTTP surface behave correctly. Shared by main.ts and the e2e suite so tests exercise the
 * exact production configuration.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Requests reach Render through Vercel, so Express must know how many proxy hops to trust for protocol and client IP.
  (app as NestExpressApplication).set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('FRONTEND_ORIGINS', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'X-Request-Id'],
    maxAge: 600,
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
}
```
`backend/src/swagger.setup.ts`:
```ts
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Task & Approval API')
      .setDescription('Authentication uses httpOnly cookies set by POST /api/auth/login.')
      .setVersion('1.0')
      .addCookieAuth('access_token')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
}
```
`backend/src/main.ts`:
```ts
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { Env } from './config/env.validation';
import { setupSwagger } from './swagger.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  setupSwagger(app);
  const port = app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();
```
`backend/src/app.module.ts`:
```ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
```
Nest's `ConfigModule.validate` receives the raw env object and must return the validated config, which `validateEnv` does.

- [ ] **Step 8: E2E infrastructure**

`backend/test/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "..",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "setupFiles": ["<rootDir>/test/setup-env.ts"],
  "testTimeout": 30000
}
```
`backend/test/setup-env.ts`:
```ts
import { config } from 'dotenv';
import { resolve } from 'node:path';

// .env.test is a local copy of .env.test.example (never committed).
config({ path: resolve(__dirname, '..', '.env.test') });
```
In `backend/package.json` set the scripts (keep the others the scaffold generated):
```json
"test": "jest",
"test:e2e": "jest --config ./test/jest-e2e.json --runInBand"
```
Create the local test env: `cd backend && cp .env.test.example .env.test`.

`backend/test/helpers/test-app.ts` (database support is added in Task 3):
```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

export interface TestContext {
  app: INestApplication;
  close: () => Promise<void>;
}

/**
 * Builds the app exactly as main.ts does. `envOverrides` lets one spec flip a setting (e.g. throttling) without
 * touching the others; the previous values are restored on close.
 */
export async function createTestApp(envOverrides: Record<string, string> = {}): Promise<TestContext> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(envOverrides)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return {
    app,
    close: async () => {
      await app.close();
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}
```

- [ ] **Step 9: Write the e2e test** — `backend/test/error-contract.e2e-spec.ts`

```ts
import request from 'supertest';
import { createTestApp, TestContext } from './helpers/test-app';

describe('error contract', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.close());

  it('returns the standard error shape for an unknown route', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/nope').expect(404);

    expect(res.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', path: '/api/nope' });
    expect(res.body.requestId).toEqual(expect.any(String));
    expect(res.body.timestamp).toEqual(expect.any(String));
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('echoes a client supplied request id', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/nope').set('X-Request-Id', 'abc-123').expect(404);
    expect(res.body.requestId).toBe('abc-123');
  });
});
```

- [ ] **Step 10: Run e2e**

Run: `cd backend && npm run test:e2e -- error-contract`
Expected: PASS (2 tests). No database is needed yet.

- [ ] **Step 11: Commit**

```bash
git add backend
git commit -m "feat(backend): add error contract, validation pipe, request id and app setup"
```

---

### Task 3: Database — entities, migration, seed and test harness

**Files:**
- Create: `backend/src/database/entities/{role,user,task,task-comment,task-status-history,refresh-token}.entity.ts`, `backend/src/database/entities/index.ts`
- Create: `backend/src/database/typeorm.options.ts`, `backend/src/database/data-source.ts`
- Create: `backend/src/database/seeds/{demo-data,run-seed,seed}.ts`
- Create: `backend/src/database/migrations/<timestamp>-InitSchema.ts` (generated)
- Modify: `backend/src/app.module.ts`, `backend/package.json`, `backend/test/helpers/test-app.ts`
- Test: `backend/test/database.e2e-spec.ts`

**Interfaces:**
- Consumes: enums from Task 2
- Produces:
  - Entities `Role`, `User`, `Task`, `TaskComment`, `TaskStatusHistory`, `RefreshToken` (field names below are exact)
  - `buildDataSourceOptions(db: DbEnv): DataSourceOptions`
  - `runSeed(dataSource, { sampleTasks }): Promise<void>`; `DEMO_USERS`, `DEMO_PASSWORDS`
  - e2e helpers `resetDatabase(ds)`, `clearTaskData(ds)`; `TestContext.dataSource`

- [ ] **Step 1: Point the dev environment at Aiven and start the test database**

Development uses the **Aiven MySQL** instance (so local runs exercise the same TLS connection as production); only the throwaway e2e database runs in Docker.

1. Create `backend/.env` (gitignored) from `.env.example`, then set the real values locally, never in a committed file: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` from the Aiven console, `DB_SSL=true`, and `DB_SSL_CA` = the project CA certificate on one line with `\n` for line breaks (Aiven console → service → "CA certificate", or `openssl s_client -starttls mysql -connect <host>:<port> -showcerts` and take the last certificate in the chain). Also set a random `JWT_ACCESS_SECRET`.
2. Start only the test database: `docker compose up -d mysql_test` then `docker compose ps` (expect `healthy`). The `mysql` service in `docker-compose.yml` is optional and only needed for fully offline work.
3. Connection check once the app can boot (after Step 4): `npm run migration:run` must connect over TLS. A failure here is a connection or CA problem, not a code problem.

**Never run the e2e suite against Aiven.** `.env.test` must point at `localhost:3307` / `taskapp_test`; `resetDatabase` below refuses to run on any database whose name does not end in `_test`.

- [ ] **Step 2: Entities**

`backend/src/database/entities/role.entity.ts`:
```ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 32, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
```
`backend/src/database/entities/user.entity.ts`:
```ts
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Role } from './role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  /** Optional contact number, stored as typed (digits, spaces, +, -, parentheses). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  /** True for the seeded demo accounts. They can be edited but never deleted. */
  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  /**
   * Soft delete, handled by hand (not @DeleteDateColumn): tasks, comments and history keep pointing at the person who
   * did the work, and TypeORM's automatic soft-delete filter would hide those authors from joined queries.
   */
  @Column({ type: 'datetime', nullable: true })
  deletedAt!: Date | null;

  @Column({ type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column()
  roleId!: number;

  // Eager because every authenticated code path needs the role code.
  @ManyToOne(() => Role, { eager: true, nullable: false })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
```
`backend/src/database/entities/task.entity.ts`:
```ts
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { User } from './user.entity';

@Entity('tasks')
@Index(['assigneeId', 'status'])
@Index(['status', 'priority'])
@Index(['dueDate'])
export class Task {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'enum', enum: TaskPriority, default: TaskPriority.MEDIUM })
  priority!: TaskPriority;

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.PENDING })
  status!: TaskStatus;

  /** Calendar date as `YYYY-MM-DD`. Kept as a string so it never shifts across time zones. */
  @Column({ type: 'date' })
  dueDate!: string;

  @Column()
  assigneeId!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'assignee_id' })
  assignee!: User;

  @Column()
  createdById!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User;

  /** Soft delete keeps comments and history intact for audit. */
  @DeleteDateColumn()
  deletedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
```
`backend/src/database/entities/task-comment.entity.ts`:
```ts
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Task } from './task.entity';
import { User } from './user.entity';

@Entity('task_comments')
@Index(['taskId', 'createdAt'])
export class TaskComment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  taskId!: number;

  @ManyToOne(() => Task, { nullable: false })
  @JoinColumn({ name: 'task_id' })
  task!: Task;

  @Column()
  authorId!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'author_id' })
  author!: User;

  @Column({ type: 'text' })
  body!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
```
`backend/src/database/entities/task-status-history.entity.ts`:
```ts
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { Task } from './task.entity';
import { User } from './user.entity';

@Entity('task_status_history')
@Index(['taskId', 'createdAt'])
export class TaskStatusHistory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  taskId!: number;

  @ManyToOne(() => Task, { nullable: false })
  @JoinColumn({ name: 'task_id' })
  task!: Task;

  /** Null for the row written when the task is created. */
  @Column({ type: 'enum', enum: TaskStatus, nullable: true })
  fromStatus!: TaskStatus | null;

  @Column({ type: 'enum', enum: TaskStatus })
  toStatus!: TaskStatus;

  @Column()
  actorId!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'actor_id' })
  actor!: User;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  note!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
```
`backend/src/database/entities/refresh-token.entity.ts`:
```ts
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('refresh_tokens')
@Index(['userId'])
@Index(['familyId'])
export class RefreshToken {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  userId!: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  /** All tokens descending from one login share a family so reuse of a rotated token can revoke the whole chain. */
  @Column({ type: 'char', length: 36 })
  familyId!: string;

  /** SHA-256 of the token. The raw value exists only in the user's cookie. */
  @Column({ type: 'char', length: 64, unique: true })
  tokenHash!: string;

  @Column({ type: 'datetime' })
  expiresAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'int', nullable: true })
  replacedById!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
```
`backend/src/database/entities/index.ts`:
```ts
import { RefreshToken } from './refresh-token.entity';
import { Role } from './role.entity';
import { TaskComment } from './task-comment.entity';
import { TaskStatusHistory } from './task-status-history.entity';
import { Task } from './task.entity';
import { User } from './user.entity';

export { RefreshToken, Role, Task, TaskComment, TaskStatusHistory, User };
export const ENTITIES = [Role, User, Task, TaskComment, TaskStatusHistory, RefreshToken];
```

- [ ] **Step 3: DataSource options and CLI data source**

`backend/src/database/typeorm.options.ts`:
```ts
import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { Env } from '../config/env.validation';
import { ENTITIES } from './entities';

export type DbEnv = Pick<Env, 'DB_HOST' | 'DB_PORT' | 'DB_USER' | 'DB_PASSWORD' | 'DB_NAME' | 'DB_SSL' | 'DB_SSL_CA'>;

export function buildDataSourceOptions(db: DbEnv): DataSourceOptions {
  return {
    type: 'mysql',
    host: db.DB_HOST,
    port: db.DB_PORT,
    username: db.DB_USER,
    password: db.DB_PASSWORD,
    database: db.DB_NAME,
    charset: 'utf8mb4',
    timezone: 'Z',
    // Managed MySQL (Aiven) requires TLS. A single-line env var cannot hold newlines, so "\n" is expanded here.
    ssl: db.DB_SSL ? { ca: db.DB_SSL_CA?.replace(/\\n/g, '\n'), rejectUnauthorized: true } : undefined,
    namingStrategy: new SnakeNamingStrategy(),
    entities: ENTITIES,
    migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
    // The schema is owned by migrations. Letting TypeORM auto-sync would silently diverge environments.
    synchronize: false,
    migrationsRun: false,
  };
}
```
`backend/src/database/data-source.ts`:
```ts
import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation';
import { buildDataSourceOptions } from './typeorm.options';

loadDotenv();

/** Entry point for the TypeORM CLI (migrations) and the seed script. Not imported by the running app. */
export default new DataSource(buildDataSourceOptions(validateEnv(process.env)));
```

- [ ] **Step 4: Wire TypeORM into the app and add scripts**

`backend/src/app.module.ts`:
```ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { Env, validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.options';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildDataSourceOptions({
          DB_HOST: config.get('DB_HOST', { infer: true }),
          DB_PORT: config.get('DB_PORT', { infer: true }),
          DB_USER: config.get('DB_USER', { infer: true }),
          DB_PASSWORD: config.get('DB_PASSWORD', { infer: true }),
          DB_NAME: config.get('DB_NAME', { infer: true }),
          DB_SSL: config.get('DB_SSL', { infer: true }),
          DB_SSL_CA: config.get('DB_SSL_CA', { infer: true }),
        }),
    }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
```
Add to `backend/package.json` `scripts`:
```json
"typeorm": "typeorm-ts-node-commonjs -d src/database/data-source.ts",
"migration:generate": "npm run typeorm -- migration:generate",
"migration:run": "npm run typeorm -- migration:run",
"migration:revert": "npm run typeorm -- migration:revert",
"migration:run:prod": "typeorm migration:run -d dist/database/data-source.js",
"seed": "ts-node src/database/seeds/seed.ts",
"seed:prod": "node dist/database/seeds/seed.js"
```

- [ ] **Step 5: Generate and review the migration**

Run: `cd backend && npm run migration:generate -- src/database/migrations/InitSchema`
Open the generated file and verify: six tables; `ENUM('PENDING','IN_PROGRESS','PENDING_APPROVAL','COMPLETED')` on `tasks.status`; `due_date` is `date`; unique indexes on `users.email`, `roles.code`, `refresh_tokens.token_hash`; the composite indexes from the entities; foreign keys present. Fix the entity and regenerate (delete the file first) if anything is missing.
Run: `npm run migration:run`
Expected: "Migration InitSchema... has been executed successfully".

- [ ] **Step 6: Seed data** 

`backend/src/database/seeds/demo-data.ts`:
```ts
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { RoleCode } from '../../common/enums/role-code.enum';

/** Demo-only accounts that the README publishes for reviewers. Never reuse these values for real systems. */
export const DEMO_PASSWORDS = {
  admin: 'Admin@12345',
  employee: 'Employee@12345',
} as const;

export const SEED_ROLES = [
  { code: RoleCode.ADMIN, name: 'Administrator' },
  { code: RoleCode.EMPLOYEE, name: 'Employee' },
] as const;

export const DEMO_USERS = [
  { name: 'Mohit Singh', phone: '+91 90000 00001', email: 'admin@taskapp.dev', role: RoleCode.ADMIN, password: DEMO_PASSWORDS.admin },
  { name: 'Kavya Nair', phone: '+91 90000 00002', email: 'admin2@taskapp.dev', role: RoleCode.ADMIN, password: DEMO_PASSWORDS.admin },
  { name: 'Priya Sharma', phone: '+91 90000 00003', email: 'priya@taskapp.dev', role: RoleCode.EMPLOYEE, password: DEMO_PASSWORDS.employee },
  { name: 'Rahul Verma', phone: '+91 90000 00004', email: 'rahul@taskapp.dev', role: RoleCode.EMPLOYEE, password: DEMO_PASSWORDS.employee },
  { name: 'Ananya Iyer', phone: '+91 90000 00005', email: 'ananya@taskapp.dev', role: RoleCode.EMPLOYEE, password: DEMO_PASSWORDS.employee },
] as const;

export interface SampleTask {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueInDays: number;
  assignee: (typeof DEMO_USERS)[number]['email'];
}

export const SAMPLE_TASKS: readonly SampleTask[] = [
  { title: 'Prepare Q4 onboarding checklist', description: 'Draft the onboarding checklist for new joiners.', priority: TaskPriority.HIGH, status: TaskStatus.PENDING, dueInDays: 5, assignee: 'priya@taskapp.dev' },
  { title: 'Update vendor contact sheet', description: 'Verify phone numbers and emails of active vendors.', priority: TaskPriority.LOW, status: TaskStatus.PENDING, dueInDays: 9, assignee: 'rahul@taskapp.dev' },
  { title: 'Reconcile September expenses', description: 'Match receipts against the ledger and flag gaps.', priority: TaskPriority.MEDIUM, status: TaskStatus.IN_PROGRESS, dueInDays: 3, assignee: 'priya@taskapp.dev' },
  { title: 'Migrate shared drive folders', description: 'Move legacy folders to the new structure.', priority: TaskPriority.HIGH, status: TaskStatus.IN_PROGRESS, dueInDays: -1, assignee: 'rahul@taskapp.dev' },
  { title: 'Draft customer FAQ page', description: 'Collect the top 15 questions and write answers.', priority: TaskPriority.MEDIUM, status: TaskStatus.PENDING_APPROVAL, dueInDays: 2, assignee: 'priya@taskapp.dev' },
  { title: 'Audit access permissions', description: 'Review who has admin access to internal tools.', priority: TaskPriority.HIGH, status: TaskStatus.PENDING_APPROVAL, dueInDays: 4, assignee: 'rahul@taskapp.dev' },
  { title: 'Publish release notes v1.4', description: 'Summarise shipped changes for stakeholders.', priority: TaskPriority.LOW, status: TaskStatus.COMPLETED, dueInDays: -6, assignee: 'priya@taskapp.dev' },
  { title: 'Renew domain certificates', description: 'Renew and verify TLS certificates.', priority: TaskPriority.MEDIUM, status: TaskStatus.COMPLETED, dueInDays: -3, assignee: 'rahul@taskapp.dev' },
];
```
`backend/src/database/seeds/run-seed.ts`:
```ts
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { Role, Task, TaskStatusHistory, User } from '../entities';
import { DEMO_USERS, SAMPLE_TASKS, SEED_ROLES } from './demo-data';

export const BCRYPT_COST = 12;

/** The ordered statuses a task passes through to reach `target`, starting from PENDING. */
function pathTo(target: TaskStatus): TaskStatus[] {
  const order = [TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.PENDING_APPROVAL, TaskStatus.COMPLETED];
  return order.slice(0, order.indexOf(target) + 1);
}

function dateOffset(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Idempotent: roles and users are looked up before being created, and sample tasks are only inserted into an
 * empty table, so running the seed twice never duplicates data.
 */
export async function runSeed(dataSource: DataSource, options: { sampleTasks: boolean }): Promise<void> {
  const roles = dataSource.getRepository(Role);
  const users = dataSource.getRepository(User);

  for (const seedRole of SEED_ROLES) {
    const existing = await roles.findOne({ where: { code: seedRole.code } });
    if (!existing) await roles.save(roles.create(seedRole));
  }

  for (const demo of DEMO_USERS) {
    const existing = await users.findOne({ where: { email: demo.email } });
    if (existing) continue;
    const role = await roles.findOneByOrFail({ code: demo.role });
    await users.save(
      users.create({
        name: demo.name,
        email: demo.email,
        phone: demo.phone,
        isDefault: true,
        roleId: role.id,
        passwordHash: await bcrypt.hash(demo.password, BCRYPT_COST),
      }),
    );
  }

  if (!options.sampleTasks) return;
  if ((await dataSource.getRepository(Task).count({ withDeleted: true })) > 0) return;

  const admin = await users.findOneByOrFail({ email: DEMO_USERS[0].email });
  await dataSource.transaction(async (em) => {
    for (const sample of SAMPLE_TASKS) {
      const assignee = await em.getRepository(User).findOneByOrFail({ email: sample.assignee });
      const task = await em.getRepository(Task).save(
        em.getRepository(Task).create({
          title: sample.title,
          description: sample.description,
          priority: sample.priority,
          status: sample.status,
          dueDate: dateOffset(sample.dueInDays),
          assigneeId: assignee.id,
          createdById: admin.id,
        }),
      );

      // History mirrors what the real workflow would have written: employees do the early steps, the admin approves.
      const steps = pathTo(sample.status);
      const rows = steps.map((to, index) =>
        em.getRepository(TaskStatusHistory).create({
          taskId: task.id,
          fromStatus: index === 0 ? null : steps[index - 1],
          toStatus: to,
          actorId: index === 0 || to === TaskStatus.COMPLETED ? admin.id : assignee.id,
          note: null,
        }),
      );
      await em.getRepository(TaskStatusHistory).save(rows);
    }
  });
}
```
`backend/src/database/seeds/seed.ts`:
```ts
import dataSource from '../data-source';
import { runSeed } from './run-seed';

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    await runSeed(dataSource, { sampleTasks: true });
    console.log('Seed complete.');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 7: Extend the e2e helper** — replace `backend/test/helpers/test-app.ts`

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { runSeed } from '../../src/database/seeds/run-seed';

export interface TestContext {
  app: INestApplication;
  dataSource: DataSource;
  close: () => Promise<void>;
}

/** Drops everything, re-applies the real migrations and seeds roles and demo users (no sample tasks). */
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  // Safety net: this drops every table. It must never run against a development or production database.
  const database = String(dataSource.options.database ?? '');
  if (!database.endsWith('_test')) {
    throw new Error(`Refusing to reset "${database}": e2e tests only run against databases whose name ends in "_test".`);
  }
  await dataSource.dropDatabase();
  await dataSource.runMigrations();
  await runSeed(dataSource, { sampleTasks: false });
}

/** Cheap between-test cleanup: removes task data but keeps users, roles and tokens. */
export async function clearTaskData(dataSource: DataSource): Promise<void> {
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of ['task_status_history', 'task_comments', 'tasks']) {
    await dataSource.query(`TRUNCATE TABLE ${table}`);
  }
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
}

/**
 * Builds the app exactly as main.ts does against a freshly migrated database. `envOverrides` lets one spec flip a
 * setting (e.g. throttling) without affecting others; previous values are restored on close.
 */
export async function createTestApp(envOverrides: Record<string, string> = {}): Promise<TestContext> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(envOverrides)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const dataSource = app.get(DataSource);
  await resetDatabase(dataSource);

  return {
    app,
    dataSource,
    close: async () => {
      await app.close();
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}
```

- [ ] **Step 8: Write the e2e test** — `backend/test/database.e2e-spec.ts`

```ts
import { DEMO_USERS } from '../src/database/seeds/demo-data';
import { runSeed } from '../src/database/seeds/run-seed';
import { Role, Task, TaskStatusHistory, User } from '../src/database/entities';
import { createTestApp, TestContext } from './helpers/test-app';

describe('database schema and seed', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.close());

  it('seeds both roles and the five demo users (2 admins, 3 employees)', async () => {
    const roles = await ctx.dataSource.getRepository(Role).find({ order: { code: 'ASC' } });
    expect(roles.map((r) => r.code)).toEqual(['ADMIN', 'EMPLOYEE']);

    const users = await ctx.dataSource.getRepository(User).find();
    expect(users.map((u) => u.email).sort()).toEqual(DEMO_USERS.map((u) => u.email).sort());
    expect(users.filter((u) => u.role.code === 'ADMIN')).toHaveLength(2);
    expect(users.filter((u) => u.role.code === 'EMPLOYEE')).toHaveLength(3);
    expect(users.every((u) => u.passwordHash.startsWith('$2'))).toBe(true);
    expect(users.every((u) => Boolean(u.phone))).toBe(true);
    expect(users.every((u) => u.isDefault)).toBe(true);
  });

  it('is idempotent: running the seed twice creates no duplicates', async () => {
    await runSeed(ctx.dataSource, { sampleTasks: true });
    const tasksAfterFirst = await ctx.dataSource.getRepository(Task).count();
    const historyAfterFirst = await ctx.dataSource.getRepository(TaskStatusHistory).count();

    await runSeed(ctx.dataSource, { sampleTasks: true });

    expect(await ctx.dataSource.getRepository(User).count()).toBe(5);
    expect(await ctx.dataSource.getRepository(Role).count()).toBe(2);
    expect(await ctx.dataSource.getRepository(Task).count()).toBe(tasksAfterFirst);
    expect(await ctx.dataSource.getRepository(TaskStatusHistory).count()).toBe(historyAfterFirst);
  });

  it('rejects an invalid status at the database level (native ENUM)', async () => {
    await expect(
      ctx.dataSource.query(
        "INSERT INTO tasks (title, description, priority, status, due_date, assignee_id, created_by_id) VALUES ('x','y','LOW','BOGUS','2030-01-01',1,1)",
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 9: Run e2e**

Run: `cd backend && npm run test:e2e`
Expected: PASS for `error-contract` and `database` (the error-contract spec now also migrates the test DB).

- [ ] **Step 10: Run the real seed once against the dev DB (Aiven) and commit**

Run: `cd backend && npm run seed`
Expected: "Seed complete." (running it again prints the same line and adds nothing).
```bash
git add backend
git commit -m "feat(backend): add entities, init migration, idempotent seed and e2e DB harness"
```

---

### Task 4: Task state machine (pure function)

**Files:**
- Create: `backend/src/modules/tasks/task-state-machine.ts`
- Test: `backend/src/modules/tasks/task-state-machine.spec.ts`

**Interfaces:**
- Consumes: `TaskStatus`, `RoleCode`
- Produces:
```ts
interface TransitionContext { role: RoleCode; isAssignee: boolean; from: TaskStatus; to: TaskStatus; note?: string | null }
type TransitionDecision =
  | { allowed: true }
  | { allowed: false; reason: 'INVALID_TRANSITION' | 'FORBIDDEN' | 'NOTE_REQUIRED' };
function evaluateTransition(ctx: TransitionContext): TransitionDecision
function allowedTargets(viewer: { role: RoleCode; isAssignee: boolean }, from: TaskStatus): TaskStatus[]
```

- [ ] **Step 1: Write the failing test** — `task-state-machine.spec.ts`

```ts
import { RoleCode } from '../../common/enums/role-code.enum';
import { TaskStatus as S } from '../../common/enums/task-status.enum';
import { allowedTargets, evaluateTransition } from './task-state-machine';

const ALL = Object.values(S);

describe('evaluateTransition', () => {
  const allowedCases: Array<[string, RoleCode, boolean, S, S, string | undefined]> = [
    ['assignee starts a task', RoleCode.EMPLOYEE, true, S.PENDING, S.IN_PROGRESS, undefined],
    ['assignee submits for approval', RoleCode.EMPLOYEE, true, S.IN_PROGRESS, S.PENDING_APPROVAL, undefined],
    ['admin approves', RoleCode.ADMIN, false, S.PENDING_APPROVAL, S.COMPLETED, undefined],
    ['admin rejects with a reason', RoleCode.ADMIN, false, S.PENDING_APPROVAL, S.IN_PROGRESS, 'Needs more detail'],
  ];
  it.each(allowedCases)('allows: %s', (_name, role, isAssignee, from, to, note) => {
    expect(evaluateTransition({ role, isAssignee, from, to, note })).toEqual({ allowed: true });
  });

  it('rejects an approval attempted by the assigned employee (forbidden actor)', () => {
    expect(evaluateTransition({ role: RoleCode.EMPLOYEE, isAssignee: true, from: S.PENDING_APPROVAL, to: S.COMPLETED })).toEqual({
      allowed: false,
      reason: 'FORBIDDEN',
    });
  });

  it('rejects an admin performing the employee steps', () => {
    for (const [from, to] of [
      [S.PENDING, S.IN_PROGRESS],
      [S.IN_PROGRESS, S.PENDING_APPROVAL],
    ] as const) {
      expect(evaluateTransition({ role: RoleCode.ADMIN, isAssignee: false, from, to })).toEqual({ allowed: false, reason: 'FORBIDDEN' });
    }
  });

  it('rejects an employee who is not the assignee', () => {
    expect(evaluateTransition({ role: RoleCode.EMPLOYEE, isAssignee: false, from: S.PENDING, to: S.IN_PROGRESS })).toEqual({
      allowed: false,
      reason: 'FORBIDDEN',
    });
  });

  it('requires a non-blank note to reject', () => {
    for (const note of [undefined, null, '', '   ']) {
      expect(evaluateTransition({ role: RoleCode.ADMIN, isAssignee: false, from: S.PENDING_APPROVAL, to: S.IN_PROGRESS, note })).toEqual({
        allowed: false,
        reason: 'NOTE_REQUIRED',
      });
    }
  });

  it('treats every pair without a rule as INVALID_TRANSITION, whoever asks', () => {
    const ruled = new Set(['PENDING>IN_PROGRESS', 'IN_PROGRESS>PENDING_APPROVAL', 'PENDING_APPROVAL>COMPLETED', 'PENDING_APPROVAL>IN_PROGRESS']);
    for (const from of ALL) {
      for (const to of ALL) {
        if (ruled.has(`${from}>${to}`)) continue;
        for (const [role, isAssignee] of [[RoleCode.ADMIN, false], [RoleCode.EMPLOYEE, true]] as const) {
          expect(evaluateTransition({ role, isAssignee, from, to, note: 'x' })).toEqual({ allowed: false, reason: 'INVALID_TRANSITION' });
        }
      }
    }
  });

  it('never allows leaving COMPLETED', () => {
    for (const to of ALL) {
      expect(evaluateTransition({ role: RoleCode.ADMIN, isAssignee: false, from: S.COMPLETED, to, note: 'x' }).allowed).toBe(false);
    }
  });
});

describe('allowedTargets', () => {
  it('lists what each viewer may do next', () => {
    expect(allowedTargets({ role: RoleCode.EMPLOYEE, isAssignee: true }, S.PENDING)).toEqual([S.IN_PROGRESS]);
    expect(allowedTargets({ role: RoleCode.EMPLOYEE, isAssignee: true }, S.IN_PROGRESS)).toEqual([S.PENDING_APPROVAL]);
    expect(allowedTargets({ role: RoleCode.EMPLOYEE, isAssignee: true }, S.PENDING_APPROVAL)).toEqual([]);
    expect(allowedTargets({ role: RoleCode.ADMIN, isAssignee: false }, S.PENDING_APPROVAL).sort()).toEqual([S.COMPLETED, S.IN_PROGRESS].sort());
    expect(allowedTargets({ role: RoleCode.ADMIN, isAssignee: false }, S.PENDING)).toEqual([]);
    expect(allowedTargets({ role: RoleCode.ADMIN, isAssignee: false }, S.COMPLETED)).toEqual([]);
  });

  it('offers nothing to an employee who is not the assignee', () => {
    expect(allowedTargets({ role: RoleCode.EMPLOYEE, isAssignee: false }, S.PENDING)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd backend && npx jest src/modules/tasks/task-state-machine.spec.ts`
Expected: FAIL, "Cannot find module './task-state-machine'".

- [ ] **Step 3: Implement** — `task-state-machine.ts`

```ts
import { RoleCode } from '../../common/enums/role-code.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';

type Actor = 'ASSIGNED_EMPLOYEE' | 'ADMIN';

interface TransitionRule {
  from: TaskStatus;
  to: TaskStatus;
  actor: Actor;
  noteRequired: boolean;
}

/** The single source of truth for the workflow. Frontend permissions are derived from it, never duplicated. */
export const TRANSITION_RULES: readonly TransitionRule[] = [
  { from: TaskStatus.PENDING, to: TaskStatus.IN_PROGRESS, actor: 'ASSIGNED_EMPLOYEE', noteRequired: false },
  { from: TaskStatus.IN_PROGRESS, to: TaskStatus.PENDING_APPROVAL, actor: 'ASSIGNED_EMPLOYEE', noteRequired: false },
  { from: TaskStatus.PENDING_APPROVAL, to: TaskStatus.COMPLETED, actor: 'ADMIN', noteRequired: false },
  // Rejection sends the task back to the employee, who needs to know why.
  { from: TaskStatus.PENDING_APPROVAL, to: TaskStatus.IN_PROGRESS, actor: 'ADMIN', noteRequired: true },
];

export interface Viewer {
  role: RoleCode;
  isAssignee: boolean;
}

export interface TransitionContext extends Viewer {
  from: TaskStatus;
  to: TaskStatus;
  note?: string | null;
}

export type TransitionDecision =
  | { allowed: true }
  | { allowed: false; reason: 'INVALID_TRANSITION' | 'FORBIDDEN' | 'NOTE_REQUIRED' };

function isPermittedActor(rule: TransitionRule, viewer: Viewer): boolean {
  return rule.actor === 'ADMIN'
    ? viewer.role === RoleCode.ADMIN
    : viewer.role === RoleCode.EMPLOYEE && viewer.isAssignee;
}

export function evaluateTransition(ctx: TransitionContext): TransitionDecision {
  const rule = TRANSITION_RULES.find((r) => r.from === ctx.from && r.to === ctx.to);
  if (!rule) return { allowed: false, reason: 'INVALID_TRANSITION' };
  if (!isPermittedActor(rule, ctx)) return { allowed: false, reason: 'FORBIDDEN' };
  if (rule.noteRequired && !ctx.note?.trim()) return { allowed: false, reason: 'NOTE_REQUIRED' };
  return { allowed: true };
}

/** Statuses the viewer may move a task to right now. Sent to the client so the UI never re-implements the rules. */
export function allowedTargets(viewer: Viewer, from: TaskStatus): TaskStatus[] {
  return TRANSITION_RULES.filter((rule) => rule.from === from && isPermittedActor(rule, viewer)).map((rule) => rule.to);
}
```

- [ ] **Step 4: Run all unit tests**

Run: `cd backend && npx jest`
Expected: PASS (env validation, errors, pipe, state machine).

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(backend): add pure task state machine with exhaustive tests"
```
