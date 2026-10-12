# Backend - NestJS API

REST API for tasks, approvals and users. TypeScript (strict), NestJS 11 (Express), TypeORM, MySQL 8. Setup, environment variables, migrate/seed and known limitations are in the [root README](../README.md).

## Scripts

| Command | Purpose |
|---|---|
| `npm run start:dev` | Run with reload on `:4000` |
| `npm run build` / `npm run start:prod` | Compile and run `dist/main` |
| `npm test` | Unit tests (Jest, no database) |
| `npm run lint` | ESLint (with `--fix`) |
| `npm run migration:run` / `migration:revert` | Apply / revert migrations |
| `npm run migration:generate -- src/database/migrations/<Name>` | Generate a migration from entity changes |
| `npm run migration:run:prod`, `npm run seed:prod` | Same as above against the compiled `dist/` (run `npm run build` first) |
| `npm run seed` | Idempotent seed (roles, demo users, sample tasks) |

There are no backend HTTP/e2e tests; the former e2e suite was removed. `.env.test*` files are unused leftovers.

## HTTP surface

- Business routes are URI-versioned: `/api/v1/auth`, `/api/v1/users`, `/api/v1/roles`, `/api/v1/tasks`, comments under `tasks/:id/comments`, `/api/v1/dashboard`.
- `GET /api/health` is version-neutral and unauthenticated (uptime monitors may use `HEAD`).
- Swagger UI: `/api/docs` (public).
- Cookies: access token path `/api`, refresh token path `/api/v1/auth`.

## Structure

```
src/
  main.ts, app.setup.ts, swagger.setup.ts   bootstrap, shared HTTP configuration, Swagger
  config/                    zod-validated environment (env.validation.ts)
  database/                  TypeORM options, data-source, migrations, seeds
  security/                  tokens, cookie options, password hashing, refresh-token utils
  common/                    guards, middleware, errors, pipes, decorators, enums, DTO helpers
  modules/<name>/            auth, users, tasks, comments, dashboard, health
    controllers/ services/ dto/ entities/   (plus mappers/ and state-machine/ where needed)
```

Entities live in each module's `entities/` folder and are loaded by glob.

## Request pipeline

1. Middleware: request id, then Origin check (state-changing requests), then JWT authentication. JWT auth is skipped for `POST auth/login`, `auth/refresh`, `auth/logout` and `GET/HEAD health` (see `app.module.ts`).
2. Global guards: rate limiter (`AppThrottlerGuard`; login limited per email+IP) and `RolesGuard`.
3. Validation pipe (whitelist, unknown fields rejected), controller, service.
4. Global exception filter renders the single error shape.

## Conventions

- Controllers are thin; rules live in services or pure functions (for example `task-state-machine.ts`).
- Every error is an `AppException` with a stable `code`.
- Anything that reads tasks starts from `TasksService.createScopedQuery`, so visibility rules cannot drift.
- Schema changes only through migrations; `synchronize` is off.
