# Frontend - Next.js app

Next.js (App Router) + TypeScript, Tailwind, shadcn/ui, Redux Toolkit + RTK Query, React Hook Form + zod. Setup and environment are in the [root README](../README.md).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server on `:3000` (needs the backend; `BACKEND_URL` in `.env.local`) |
| `npm run build` / `npm start` | Production build / server. `BACKEND_URL` must be set when building: the build fails without it |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Playwright workflow test; needs backend + frontend running, `E2E_BASE_URL` selects the target (default `http://localhost:3000`). First run `npx playwright install chromium` |
| `npm run typecheck` / `npm run lint` | Static checks |

## How API calls work

The browser calls relative `/api/v1/...` URLs. `next.config.ts` rewrites `/api/:path*` to `BACKEND_URL` (server-side only, never exposed to the browser), so cookies are first-party.

- `services/api/baseQuery.ts`: one entry point for all requests. On an expired session it refreshes once (shared by concurrent requests) and retries; it retries GETs while a sleeping backend wakes up; it normalises every failure to an `ApiError`.
- `store/middleware/apiNotificationMiddleware.ts`: the place where API outcomes become toasts; components contain no toast code for API results.
- `lib/apiMessages.ts` (success wording) and `lib/apiNotification.ts` (error level mapping) are the two tables to edit to change messages.
- Task status changes go through the status dropdown with a confirmation dialog; selectable options come from the backend's `allowedTransitions`.
- `components/layout/ServerStatusBanner.tsx` shows the "waking up the server" banner during a cold start.

## Structure

```
src/app/            routes: (auth)/login, (app)/dashboard | tasks | tasks/[id] | users
src/components/     ui (shadcn), layout, common, tasks, dashboard, users, auth
src/hooks/          useAuth, useApiAction, useConfirm, useDebouncedValue, useTaskFilters
src/services/api/   RTK Query endpoint groups (baseApi, baseQuery, auth, tasks, comments, users, dashboard)
src/store/          store, slices, notification middleware
src/lib/            pure helpers (errors, dates, filters, messages) with unit tests
e2e/                Playwright smoke test
```
