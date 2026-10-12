# AI usage

## Tools

- **Claude Code** (Anthropic's CLI, Claude Sonnet 5.5), using brainstorming, planning and subagent-driven development: each implementation task was done by a subagent and followed by a review loop (spec compliance, then code quality) before the next task.
- No other AI tool is recorded here.

## What AI did

- Turned the assessment requirements into a design spec with a requirement-to-design traceability table, and wrote the implementation plans (`docs/superpowers/specs/`, `docs/superpowers/plans/`).
- Generated most of the backend, frontend, unit tests, Playwright smoke test and this documentation from those plans, with review findings fixed in follow-up commits.

## What the human decided and directed

- Backend folder structure per feature module (`modules/<name>/{controllers,services,dto,entities}`, shared code in `security` and `common`).
- Origin check and JWT authentication as Nest middleware instead of guards.
- URI API versioning (`/api/v1`, version-neutral health).
- Removal of the backend e2e suite, leaving unit tests only.

## Verification

- Automated: backend and frontend unit tests, type checks, lint and builds were run during development; the Playwright smoke test exists for the main workflow.
- The documentation commands were followed in a fresh clone (see the task report for exactly which steps).
- Deployment: the owner created the Vercel, Render and Aiven services and set their environment variables; the AI diagnosed deploy failures from the logs the owner pasted and ran HTTP and browser checks against the live URLs (a scripted API suite and the Playwright workflow test). Those checks found two real problems that were then fixed: rate limiting that never fired behind the proxies, and a login that could be cancelled if submitted during the first-visit session check.
- Not claimed: no 14-day uptime check, and no independent manual security audit. Items a reviewer should re-check by hand: role restrictions (employee cannot see other tasks, approve, or open `/users`), cookie flags in a browser, the refresh-token rotation code and the migration.

## Known gaps

See "Known limitations" in the [README](../README.md): notably no backend HTTP/e2e tests, free-tier cold starts if hosted that way, and shared sessions across tabs. A later hardening pass closed earlier gaps: access tokens are now refused as soon as a user is deleted or their password changes, Swagger is off in production unless enabled, and insecure production settings stop the app from booting.
