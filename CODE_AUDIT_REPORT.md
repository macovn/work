# QLCV — Code Audit Report

**Date:** audit session (read-only; **no code was modified**)
**Scope:** full audit — security, correctness, quality, performance — of the entire QLCV codebase
**Method:** every source file read (app/, components/, lib/, prisma/, config, root scripts); high-severity mechanics independently re-verified against source. Findings are ranked Critical → High → Medium → Low. Each references exact file/line and gives a fix direction.

---

## 1. CRITICAL

### C1. Destructive schema sync runs in the build pipeline — every Vercel deploy/preview mutates the live DB, no migrations exist
- `package.json:7` — `"build": "prisma generate && prisma db push --accept-data-loss && next build"`
- No `prisma/migrations/` directory exists anywhere in the repo.
- **Issue:** Vercel runs `next build` on every production *and preview* deploy, so `prisma db push --accept-data-loss` diffs `schema.prisma` against the build's `DATABASE_URL` and applies destructive DDL (drop column/table) directly with **no migration history and no prompt**. A developer who edits the schema locally (every start script does exactly this), deletes a column/table and commits — the next deploy silently DROPs that production data. Preview branches pointed at the same DB can do the same. This is the single highest-risk item in the repo.
- **Fix:** remove `db push` from the build; create a migration baseline (`prisma migrate dev --create-only` / `migrate diff`) and run `prisma migrate deploy` (additive, idempotent) in the build instead.

---

## 2. HIGH

### H1. Demo-seed & wipe code with publicly known admin credentials ships in production
- `prisma/seed.ts:110-123,163` — `runSeed()` upserts `admin@example.com` / **`admin123`** (force-role ADMIN) plus `user1-3@example.com` / `user123`, then executes `prisma.task.deleteMany({})` (wipes ALL tasks, cascading logs/alerts).
- `app/api/seed/route.ts:7-42` — POST `/api/seed` → `runSeed()`; DELETE `/api/seed` → `task.deleteMany`. Guarded only by `role !== "ADMIN"` (403), i.e. **live in production for any admin**.
- `app/login/page.tsx:108-129` — the public login page ships one-click buttons that fill `admin@example.com`/`admin123` and `user1@example.com`/`user123`.
- **Issue:** three independent problems chained: (1) any environment seeded from this code (dev DB copied to prod, or `/api/seed` ever invoked) carries an admin account whose password is publicly visible in the shipped client bundle; (2) the wipe endpoint can delete every real task with one call; (3) `/api/seed` POST returns the demo passwords in its response.
- **Fix:** never ship demo seeding/wipe paths in production (compile them out with `NODE_ENV`, or an env-gated feature flag); force real passwords / random seed passwords outside dev; remove the demo quick-login buttons from the shipped login page.

### H2. Missing `DATABASE_URL` in production silently falls back to a hard-coded localhost DB
- `lib/prisma.ts:9-22` — `LOCAL_DEV_DB_URL = "postgresql://postgres:acceptancetest@127.0.0.1:54332/postgres..."` is used whenever `DATABASE_URL` is unset, **including in production** (only `console.error` when NODE_ENV=production).
- **Issue:** on a serverless host a misconfigured deploy doesn't fail fast — every query targets a localhost DB with a committed default password → site-wide ECONNREFUSED/500s, and the credential string ships inside the server bundle. Degradation is silent.
- **Fix:** throw at module load in production when `DATABASE_URL` is absent; keep the dev fallback only behind `NODE_ENV !== "production"`.

### H3. Missing `JWT_SECRET` in production falls back to per-process ephemeral random keys
- `lib/jwt-secret.ts:8-40` — in production with no `JWT_SECRET` it warns and returns a per-process random secret.
- **Issue:** middleware (Edge runtime) and `lib/auth.ts` (Node runtime) hold independent module copies; every isolate/cold start derives a different key → a token signed by one instance is rejected by another → intermittent-to-total 401s and **all sessions invalidated on every deploy/cold start**. Silent availability failure masking a misconfiguration (auth appears broken for no obvious reason).
- **Fix:** fail hard in production when `JWT_SECRET` is unset/blank (throw at first use / validate at boot) and remove ephemeral fallback from production code paths.

### H4. Evaluation / performance-rating math produces demonstrably wrong ratings
- `lib/evaluation.ts:156-203` — `calculateEvaluation` **never reads `task.status`**, and when `completedScore` is null it falls back to `assignedScore` (full assigned credit for unfinished work). Rating thresholds at 90/70/50 then classify `totalScore`.
- `app/api/reports/evaluation/route.ts:24-61` — query filters only on assignee/position/field/month; **no status filter**, so TODO/PAUSED/CANCELLED tasks are aggregated as if completed; 0-vs-null `completedVolume` flips outcomes (NULL volumes drop the task from S_tb; 0 volumes drag it to 0). Reviewer-verified example: a user with 2/2 completed, near-EXCELLENT evaluated tasks is rated "KHÔNG HOÀN THÀNH" because unstarted tasks count as 0.
- **Fix:** filter evaluation to `status = COMPLETED` (or an explicit per-status policy); drop the `assignedScore` fallback for non-completed tasks; define 0-vs-null semantics centrally in `calculateTaskScores`.

### H5. No freeze on COMPLETED / KPI-scored tasks — assignees can rewrite evaluation inputs after scoring
- `app/api/tasks/[id]/route.ts:30-60` — the non-admin branch has **no status-transition rules and never checks `kpiEvaluatedAt`**. The assignee may reopen a COMPLETED task, change status back to TODO, or raise `completedVolume` so `completedScore`/`completionRate` are rewritten — and since H4's evaluation reads live `completedScore`, the assignee **retroactively inflates their own rating** after an admin scored them.
- **Fix:** freeze user edits (status/result/volume) once `status = COMPLETED` or `kpiEvaluatedAt` is set; enforce a status FSM server-side (e.g. require a result to mark COMPLETED; only ADMIN may reopen, with an audit trail).

### H6. "Reports" are silently computed from only the first 100 tasks
- `app/reports/page.tsx:83`, `app/notifications/page.tsx:58`, `app/calendar/page.tsx:99` all request `?limit=1000`, but `app/api/tasks/route.ts:33` caps `limit` at **100** (page 1, soonest deadlines first) and the pages ignore the returned `pagination.total`.
- **Issue:** past 100 tasks (the seed alone creates 100), the admin report totals, %-rates, employee table and ratings, the calendar grid, and the reminder buckets silently drop the remainder — frequently the current/next-month tasks, since old overdue tasks sort first. The on-screen numbers then diverge from the all-data Excel export and from `/api/reports/evaluation`.
- **Fix:** stop re-aggregating truncated client fetches — consume the unpaginated server report endpoint (with its own fixes from H4) or page through `/api/tasks`; at minimum surface `pagination.total` and warn when truncated.

### H7. No timezone policy — deadline handling corrupts data on multiple surfaces
Root cause: clients send naive `"YYYY-MM-DDTHH:mm"` strings parsed server-side with `new Date(deadline)` in **server-local time** (`app/api/tasks/route.ts:224`, `app/api/tasks/[id]/route.ts:168`); `Intl` formatting and all "today/overdue/month" math run in server time with **no timeZone configured anywhere in the repo** (no `Asia/Ho_Chi_Minh` reference).
- `app/tasks/page.tsx:306,333,374` and `app/calendar/page.tsx:290-291,315` — edit/create forms prefill datetime-local inputs with `toISOString().slice(0,16)` (**UTC wall-clock text**): displayed time is wrong in any browser whose TZ ≠ UTC; on a +07 server every no-op save shifts the deadline −7 h; user edits are interpreted as UTC.
- `app/calendar/page.tsx:194`, `app/reports/page.tsx:132-139` — "today" highlight and date-range bounds mix UTC-midnight parsing with local `setHours(23:59)` (deadlines due 00:00–06:59 local of the chosen day are dropped).
- `lib/notification-engine.ts:278-288` and `app/api/reports/evaluation/route.ts:40-41` — warning windows, overdue tests and month filters are computed in server TZ against UTC deadlines → near-deadline notifications/ratings land on the wrong day.
- **Fix:** adopt one policy — store instants, send explicit offsets (or local wall-clock + IANA TZ), set `timeZone: "Asia/Ho_Chi_Minh"` for all date math/formatting, and prefill inputs from local components (`getFullYear/getMonth/getHours/...`).

### H8. `Task.code` uniqueness handled by check-then-create → race, whole-batch import failure, orphan calendar events
- `app/api/tasks/route.ts:159-164,218` — `findUnique` pre-check then `create`; two concurrent creates of the same code → P2002 → 500.
- `app/api/tasks/import/route.ts:127-132,242` — auto-codes use a `Date.now()`-based sequence; two imports in the same ms produce identical codes, both pass the pre-fetched set, and the single atomic `createMany` fails entirely (no partial import, no retry).
- `app/api/tasks/route.ts:204-218` — the Google Calendar event is created **before** the DB insert, so any create failure leaves an orphan calendar event.
- **Fix:** create first and retry on P2002 with regenerated code (or `createMany({ skipDuplicates })` per code), and reorder to persist first / compensate on failure.

### H9. Zalo notification channel can never deliver
- `lib/notification-engine.ts:224-227` — passes `ctx.user.email` as the Zalo recipient `user_id`; the Zalo OA API requires a Zalo user/phone id and the User model has **no phone or Zalo field anywhere** (schema/UI). `enableZalo` defaults true, so every eligible event takes a guaranteed-failing API call and writes a FAILED log.
- **Fix:** add a real Zalo identifier (phone/Zalo id) to the user profile and settings, or remove/disable the channel; verify against the actual Zalo OA API contract.

---

## 3. MEDIUM

### M1. Notification dedupe is check-then-insert without a unique constraint, and engine runs overlap
`lib/notification-engine.ts:398-455` dedupes via `findFirst` then writes log rows per channel; `NotificationLog` has only a non-unique `@@index` (`schema.prisma:209`). The full-table engine runs fire-and-forget from the cron route, every task create/patch/import (`tasks/route.ts:260`, `tasks/[id]/route.ts:220`, import `:247`) **and** login alerts (`auth/login/route.ts:84`) — overlapping invocations both pass the check → duplicate emails/pushes/in-app alerts. Because In-App always logs SENT first, a transient EMAIL/WEB_PUSH/ZALO failure is **never retried** and channels enabled later never fire (dedupe ignores channel). Fix: unique constraint `(userId,taskId,notificationType,channel,ruleKey,deadline)` with `ON CONFLICT DO NOTHING`; serialize/lease engine runs.

### M2. Enum/id validation largely absent on write paths; raw Prisma `error.message` returned to clients
Handlers accept arbitrary `status`/`priority` strings and unvalidated ids, then return `error?.message` verbatim in catch blocks: `tasks/route.ts:267`, `tasks/[id]/route.ts:227`, `kpi/route.ts:95`, `import/route.ts:260`, `users/route.ts:82` (P2002 race), `standard-tasks/seed/route.ts:24`, `work-summary/route.ts:229`, `reports/evaluation/route.ts:118`. Client mistakes (bad enum → P2009, missing FK id → P2003) become 500s leaking schema/DB internals instead of clean 400s. Fix: validate enums + referential ids up front; log server-side and return generic messages.

### M3. Scoring math accepts negatives / NaN / >100 %; 0/0 forced to 100 %; stale snapshots on null volume
`lib/standard-task.ts:67-71`, `tasks/route.ts:191-199`, `tasks/[id]/route.ts:37-59,140-159` — negative or NaN volumes accepted (`Number("abc")` → NaN stored); `completedVolume > assignedVolume` → completionRate > 100; `assigned=0,completed=0` → forced 100 % ("nothing assigned = complete"); setting a volume to `null` skips recompute but still updates the volume column → stale `assignedScore`/`completedScore`/`completionRate` that evaluation later reads. Fix: one validated recompute path (finite, ≥0, explicit null semantics — null scores, not 100).

### M4. xlsx import robustness (DoS/shape)
`app/api/tasks/import/route.ts` — only the compressed 5 MB upload is capped; a 5 MB xlsx can decompress far larger (zip-bomb); the whole sheet/row array is materialized in memory with no row/cell cap; one giant `createMany` can exceed Postgres bind limits and abort the whole batch; content-type never checked. Fix: cap decoded rows, chunked createMany, verify content type, isolate per-row unique-violation errors.

### M5. Import assigns tasks to the wrong user
`app/api/tasks/import/route.ts:194-210` — unmatched "Người thực hiện" silently assigns to the importing admin; otherwise it substring-matches email/fullName (`"an"`/`"a"` match many) and picks the first hit. A large import can bulk-misassign ownership/evaluation data with no error. Fix: require exact match; collect unmatched/ambiguous rows into `errors`.

### M6. Work-summary endpoint unbounded for ADMIN; counts disagree with list
`app/api/tasks/work-summary/route.ts:22,68-81` — for ADMIN, `baseWhere = {}` returns **every** non-cancelled task (all columns incl. notes/result/KPI + two user joins) with no pagination; `completedToday` counts tasks by `updatedAt` while the returned list contains all completed tasks ever, so summary numbers don't match the list. Fix: paginate/server cutoff; align the completed list with the count window.

### M7. Raw runtime DDL (schema migration) executed from request handlers
`lib/prisma.ts:28-118` (`ensureStandardTaskSchema`/`ensureTaskTypeColumn`) is invoked from ~10 request paths and the dashboard page on every cold start (`dashboard/page.tsx:24`, `tasks/route.ts:12,122`, catalog routes, etc.), performing `CREATE TYPE/TABLE`, `ALTER TABLE` from web traffic — racing on concurrent cold starts and masking drift from `schema.prisma`. Fix: replace with real migrations (C1); at minimum gate to non-production.

### M8. LOCKED users still notified
`lib/notification-engine.ts:332-341,398-455` — the cron/task-triggered active-task query has no `assignee.status` filter and dispatch never checks it (only `handleLoginAlert` guards at :369). A locked user keeps receiving emails/pushes. Fix: join/filter `assignee.status = ACTIVE` (and honor a global "no email to LOCKED" rule).

### M9. Push-subscription ownership can be overwritten; stale subscriptions never cleaned
`app/api/notifications/push-subscription/route.ts:23-34` — `upsert` keys on `endpoint` and overwrites `userId`, so the second user to register the same browser endpoint (shared computer, two accounts) silently **steals** push ownership from the first; `keys` JSON unvalidated; no DELETE/stale-410 cleanup, so dead endpoints accumulate FAILED logs each run. Fix: ownership check before overwrite; endpoint URL/keys validation; prune on 410/404.

### M10. Web Push is a dead-end feature
`app/providers.tsx:6-17` registers `/sw.js` only — grep confirms **no** `Notification.requestPermission`, `pushManager.subscribe`, or POST to `/api/notifications/push-subscription` anywhere in app/ or components/. Toggling "Web Push" in settings just saves a flag the server can never use. Fix: implement subscribe + registration (or remove the toggle).

### M11. Google Calendar integration cannot be completed and sync is unreliable
No client code references `/api/auth/google`; `app/settings/page.tsx` only exposes a `googleCalendarEnabled` checkbox. `app/api/auth/google/callback/route.ts:52-61` exchanges the code and returns JSON, **persisting nothing** — the refresh token is unrecoverable from the app, while `lib/google-calendar.ts:38-51` reads only the env `GOOGLE_REFRESH_TOKEN` (manual ops provisioning). Sync errors are fire-and-forget after DB writes (`tasks/[id]/route.ts:201-218,254-262`), and event creation precedes the DB insert (orphan risk, see H8) — DB and calendar silently diverge. Fix: real Connect UI + server-side refresh-token persistence + retry/outbox and surfaced status.

### M12. Excel export diverges from the on-screen report
`app/reports/page.tsx:412-418` links to `/api/reports/export` with **no filter parameters**; `app/api/reports/export/route.ts:16-18` loads the entire task history (no limit) and emits only per-field/per-user counts — no KPI/ratings — so after applying filters the admin downloads a full-history file that cannot reproduce the screen. Also loads `include: { assignee: true }` pulling `passwordHash` into memory (never serialized — no leak in output, verified). Fix: forward filters (and evaluation content) to the export or generate from the exact filtered set; narrow the include.

### M13. `JobTaskGroup.weight` is dead data
Weights (25/45/30 etc.) are never read by scoring, evaluation or export, while `lib/evaluation.ts:196` labels a plain mean "weightedAverageScore" and the docstring (`:120-121`) claims weights were already applied. Fix: either apply weights in evaluation per the locked spec or stop labeling it weighted.

### M14. Calendar gives USER-role admin-only create/edit affordances that silently discard their edits
`app/calendar/page.tsx:78-92,288-355,706-715` — USERs see "Thêm việc"/"Chỉnh sửa" and a full form (title/deadline/assignee/field), but the server applies only `status/result/notes/completedVolume` for non-admins (`tasks/[id]/route.ts:30-60`) → the extra edits are silently dropped (no error); the create POST is admin-only (403) and `/api/users` fetch 403s (error swallowed → empty dropdowns). Fix: hide create/full-edit for USER (offer the narrow status/result form) and skip `/api/users`.

### M15. Create-user "Khóa" silently creates an ACTIVE account
`app/users/page.tsx:124-126` posts `status`, but `app/api/users/route.ts:67` hard-codes `status: "ACTIVE"` and never reads `body.status`. Fix: honor the status or remove the dropdown.

### M16. Reports date filter mixes UTC and local day bounds; evaluation month param loosely validated
`app/reports/page.tsx:132-139` — `new Date(fromDateFilter)` is UTC midnight while the `to` bound is shifted to local 23:59:59; buckets use local midnight. `app/api/reports/evaluation/route.ts:39-46` silently ignores malformed months and maps `2025-13` to Jan-2026; month boundaries are server-local (see H7). Fix: consistent local-day bounds; strict month validation (400 on bad input).

### M17. Reports donut charts double-count buckets
`app/reports/page.tsx:196-232,367-376,817-855` — "Quá hạn" is counted independently of status buckets (an overdue IN_PROGRESS task appears in both), so segments aren't mutually exclusive, legend percentages can exceed 100 %, and arc offsets assume exclusive buckets. Fix: mutually exclusive buckets computed from exact shares.

### M18. Tasks list permanently pinned by `?id=` deep-link
`app/tasks/page.tsx:229-230,254-256,845` — the URL `id` is re-sent on every fetch and auto-reopens the detail modal; closing only clears local state, so the list stays pinned to one task with no way back short of editing the URL. Fix: clear the param (router.replace) when the modal closes.

### M19. Notification UX mismatch: "Xem tất cả & Audit Log" goes to the wrong page; single-read never used
`components/NotificationBell.tsx:40-52,108-114` links to `/notifications`, but that page is a **task-reminders** page (fetches `/api/tasks`), never showing `inAppAlerts`/logs from `GET /api/notifications`; no per-id read PATCH is ever used; the badge is cleared optimistically even if the bulk PATCH fails. Fix: point the link at a real inbox (or surface alerts there) and confirm-on-failure.

### M20. `/api/reports/evaluation` is not admin-gated
Middleware's admin list covers `/api/reports/export` but not `/api/reports/evaluation`. The handler does self-scope USERs (`user.role === "ADMIN" ? assigneeId : user.id`, route `:22`) so **no cross-user leak was found** — but decide whether aggregated org analytics should be admin-only and add the guard.

---

## 4. LOW

- **L1. KPI route:** status/completed check (400) runs before the ADMIN check (403) → authenticated USERs can probe task ids (404 vs 400 vs 403) as an existence/status oracle (`kpi/route.ts:27-48`); repeated re-scoring silently overwrites the prior evaluator/comment with no history (`:67-77`).
- **L2. Calendar minors:** initial month hard-coded `new Date(2026, 7, 23)` (`calendar/page.tsx:44`); "today" highlight compares UTC date to local cell keys (`:194`); day-modal header formats a "YYYY-MM-DD" key via UTC-midnight parsing (`:896`); filter fetches have no AbortController/sequence guard (stale results, `:94-120`); default code `TASK-${tasks.length+1}` collides with existing codes (`:311`).
- **L3. Tasks page / modal minors:** no stale-response guard on per-keystroke search refetch (`tasks/page.tsx:528-531`); random client codes `TASK-100..999` are never checked against the DB (server 400s on collision, `:302`); date-range filter doesn't reset page (`:601-613`); WorkSummaryModal keeps nested-modal state across close/reopen (`WorkSummaryModal.tsx:96-97,130`); quick-complete/update PATCH failures are swallowed with no message (`:162-168`; notifications `:157-165`); the reminders page computes its "overdue / next-3-days" buckets from a render-time `now` with no ticker, going stale after midnight, and the `useMemo` keyed on that fresh `now` object recomputes every render (`notifications/page.tsx:75-79`).
- **L4. Reports math minors:** CANCELLED tasks remain in `total` denominators, depressing completion/on-time rates, and count toward "Chưa có kết quả"; COMPLETED-without-result also inflates "Chưa có kết quả" (`reports/page.tsx:178,196-234,334-337`).
- **L5. Users API:** PATCH of an unknown id returns 500 instead of 404; no DELETE route; no email-format or password-strength validation on create/update (`users/route.ts:47-48`, `users/[id]/route.ts`); schema `User → Task/Logs/Alerts/Subscriptions onDelete: CASCADE` (`schema.prisma:139,196,215,227`) is a silent data-loss foot-gun if a delete API is ever added.
- **L6. Settings:** client coerces 0/empty hour input to 1 and `max=168` only affects the spinner (`settings/page.tsx:140-187`); server `parseInt` without bounds — negative hours disable warnings, huge hours spam, NaN → 500 — and `Boolean("false") === true` coerces string "false" to enabled (`settings/route.ts:44-50`).
- **L7. Engine misc:** `getSettings` find-then-create races on first concurrent run (P2002 aborts cron) (`notification-engine.ts:302-323`); PAUSED tasks are not excluded from warnings (confirm intended); email subject built from raw task code/title with no CRLF sanitization; login alert fires on every login (deduped per rule+deadline).
- **L8. Ops:** missing `CRON_SECRET` fails the daily cron silently with no operator alert; CSP allows `script-src 'unsafe-inline' 'unsafe-eval'` (`next.config.mjs:23`) — XSS would not be blocked; committed dev scripts `serve_app.ts`/`start_local.ts`/`start_postgres_daemon.ts` embed the DB password, rewrite the developer's `.env` and bind dev Next on 0.0.0.0; SMTP transporter created per send (no pooling); `/api/seed` response discloses demo passwords.
- **L9. Service worker:** `notificationclick` opens a second window when the app is open at a non-exact URL (`sw.js:24`) — fix by matching `pathname`; no fetch/cache handler exists, so no stale-bundle or cached-auth-data risk (clean).
- **L10. Session model:** logout only clears the cookie — tokens stay valid until 7-day expiry, no server-side revocation/jti; middleware gates admin UI + some APIs on the **JWT role claim** (stale up to 7 days after demotion) — safe today because every data handler re-derives role/status from the DB via `getCurrentUser`, but the UI gating itself lags role changes; password changes don't invalidate existing sessions.

---

## 5. Cross-cutting root causes

1. **Schema lifecycle is ad-hoc** — `db push --accept-data-loss` in the build (C1) plus raw DDL from request handlers (M7), with no migrations anywhere.
2. **Silent production misconfiguration** — DB URL (H2), JWT secret (H3), CRON secret (L8) all degrade with warnings instead of failing fast.
3. **No timezone policy** — naive client strings, server-local parsing, UTC round-trips, and server-TZ date math (H7 + H4 month filter + M16).
4. **Demo/dev affordances leak into production** — seed creds + wipe endpoints + demo login buttons (H1), demo calendar month (L2), dev scripts that rewrite `.env`.
5. **Evaluation logic is duplicated and divergent** — server `/api/reports/evaluation` (H4/M13), client re-aggregation of a truncated fetch (H6), and the export route (M12) each compute different numbers.

---

## 6. Verified clean / non-findings (assurance)

- **No authorization bypass found.** Every mutating handler re-derives role and LOCKED status from the DB via `getCurrentUser`; task POST / DELETE and KPI scoring are ADMIN-only; catalog, settings, users and export write paths are ADMIN-gated inline; USERs are self-scoped on tasks/notifications/evaluation; admin self-demotion/lockout is blocked.
- **No XSS sinks client-side.** No `dangerouslySetInnerHTML`, `eval`, `innerHTML`, `javascript:` hrefs, `window.open` of user input, or markdown/HTML renderers; all dynamic content is React-escaped (email HTML is escaped server-side in `NotificationFormatter.buildEmailHtml`).
- **No client-side secret storage.** Only the intended `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; auth is an httpOnly cookie; no localStorage of auth/PII (single benign sessionStorage flag); no OAuth tokens returned to the client.
- **Auth hardening present and correct:** bcrypt cost 10; httpOnly + Secure-in-prod + SameSite=Lax cookie; OAuth `state` cookie with constant-time compare and one-time consumption; cron auth fail-closed via `Authorization: Bearer` + timing-safe compare (no secret in query string); login rate limiting keyed IP+email and email-global (header-based IP trust caveat on non-Vercel hosting).
- **Export workbook** contains only sanitized aggregates (formula-injection guard applied to its two string cells); `passwordHash` is loaded but never serialized.
- **`public/sw.js` caches nothing** (no fetch handler) — no stale-bundle or cross-user cached-API risk; `vercel.json` contains no secrets; `.gitignore` correctly excludes `.env`, build/test artifacts, and harness scripts; test harness scripts (`run_*`, `scratch_*`, `verify_*`) embed only localhost throwaway DB passwords and are excluded from the build (tsconfig excludes + never imported).
- KPI formula, mark-all-read bulk PATCH, work-summary response shape, and WorkSummaryModal grouping all match their server counterparts.

---

## 7. Suggested remediation order (quick wins first)

1. Remove `db push` from build; introduce migrations (C1).
2. Delete `app/api/seed/route.ts` + demo quick-login from production; make seed passwords env-random (H1).
3. Fail fast on missing `DATABASE_URL` / `JWT_SECRET` / `CRON_SECRET` in production (H2, H3, L8).
4. Fix evaluation semantics: COMPLETED-only, no `assignedScore` fallback, explicit 0/null rules (H4), and freeze scored tasks (H5).
5. Adopt a timezone policy and fix deadline round-trips/date bounds (H7, M16).
6. Point reports/calendar/notifications at paginated or server-computed data (H6).
7. Make `Task.code` creation race-safe and reorder calendar-sync (H8, M11).
8. Remove or wire up the dead channels (Zalo H9, Web Push M10, Google Connect M11).
9. Add enum/range validation and stop leaking `error.message` (M2, M3).
10. Tighten import (M4/M5) and work-summary (M6) limits; add NotificationLog uniqueness (M1).
