---

description: "Task list for PlantsVSHumans — Shared Plant Care Tracker"
---

# Tasks: PlantsVSHumans — Shared Plant Care Tracker

> **Prototype status (2026-11-12)**: At the user's request, a working prototype was built in
> place of the full task list. The tasks below remain the plan for the production build and
> are intentionally left unchecked.
>
> - **Prototype includes**:
>   - `backend/src/server.ts`: a single Fastify process with JSON-file storage
>   - `backend/public/index.html`: a vanilla, phone-first UI
>   - pure domain modules in `backend/src/domain/`, with 15 passing tests written before the
>     code
> - **Covered**:
>   - US1 logging, attribution, backdating, undo/restore with history, and live updates over
>     server-sent events
>   - US2 due status
>   - US3 duplicate warning and race flagging
>   - US4 weekly dashboard with a member filter
> - **Not built**:
>   - sign-in (members pick their name), invites, the daily push summary, PostgreSQL storage
>   - contract, integration, and end-to-end suites
>   - the React frontend (`frontend/` is installed but not used)

**Input**: Design documents from `/specs/001-plant-care-tracker/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml,
contracts/realtime-and-push.md, quickstart.md

**Tests**: REQUIRED. Constitution Principle IV (NON-NEGOTIABLE) requires that tests for domain
logic (scheduling, due status, duplicate detection, conflict resolution) are written and seen
FAILING before implementation. The quickstart.md sections 3–5 define the validation suite.
Every test task in this file MUST be completed, and its test run and observed failing, before
the implementation task it precedes.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and
demoed on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US4)
- Every task names exact file paths

## Path Conventions

- Web app with npm workspaces: `backend/src/`, `backend/tests/`, `frontend/src/`, `frontend/tests/`
- Pure domain logic lives ONLY in `backend/src/domain/` (no I/O, no DB, no `Date.now()`; "now"
  and time zone are always passed in)
- API types for the frontend are generated from `specs/001-plant-care-tracker/contracts/openapi.yaml`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and tooling

- [ ] T001 Create root `package.json` with npm workspaces `["backend", "frontend"]`, `"engines": { "node": ">=24" }`, and root scripts `dev` (runs both workspaces concurrently), `test`, `lint`, `typecheck`; add `.nvmrc` containing `24` and a root `.gitignore` (node_modules, dist, .env, coverage, playwright-report)
- [ ] T002 Create `docker-compose.yml` at repo root with a `db` service using `postgres:17`, port `5432:5432`, database/user/password `pvh`/`pvh`/`pvh`, and a named volume
- [ ] T003 Initialize backend workspace in `backend/package.json` and `backend/tsconfig.json` (TypeScript 5.x, `strict: true`, ESM, target ES2023) with dependencies `fastify@5`, `drizzle-orm`, `pg`, `zod`, `luxon`, `web-push`, `uuid` (v7) and dev dependencies `typescript`, `tsx`, `drizzle-kit`, `vitest`, `fast-check`, `@testcontainers/postgresql`, `openapi-backend` (response schema validation against contracts/openapi.yaml), `@types/luxon`, `@types/pg`, `@types/web-push`; scripts `dev`, `build`, `db:migrate`, `db:generate`, `test:domain` (vitest run tests/unit/domain), `test:contract`, `test:integration`, `test`
- [ ] T004 [P] Initialize frontend workspace with Vite + React 19 + TypeScript in `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts` (dev server port 5173, proxy `/api` → `http://localhost:3000`), `frontend/index.html`; dependencies `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`; dev dependencies `vite-plugin-pwa`, `openapi-typescript`, `openapi-fetch`, `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `@playwright/test`
- [ ] T005 [P] Configure ESLint (typescript-eslint, strict) and Prettier at repo root in `eslint.config.js` and `.prettierrc`; add a rule in `eslint.config.js` that forbids importing `pg`, `drizzle-orm`, `fastify`, or `node:*` I/O modules from `backend/src/domain/**` (Principle III/IV: domain is pure)
- [ ] T006 [P] Create `backend/vitest.config.ts` with three projects (`domain` → `tests/unit/domain/**`, `contract` → `tests/contract/**`, `integration` → `tests/integration/**` with `testTimeout: 60000`) and `frontend/vitest.config.ts` (jsdom environment, `tests/unit/**`)
- [ ] T007 [P] Create `frontend/playwright.config.ts` (baseURL `http://localhost:5173`, `webServer` running root `npm run dev`, Chromium project with notification permission grant) and empty `frontend/tests/e2e/` directory with a `.gitkeep`
- [ ] T008 [P] Create `backend/.env.example` with `DATABASE_URL=postgres://pvh:pvh@localhost:5432/pvh`, `APP_ORIGIN=http://localhost:5173`, `PORT=3000`, `SESSION_COOKIE_NAME=pvh_session`, `MAIL_TRANSPORT=console`, `VAPID_PUBLIC_KEY=`, `VAPID_PRIVATE_KEY=`, `VAPID_SUBJECT=mailto:admin@example.com`
- [ ] T009 [P] Add CI workflow `.github/workflows/ci.yml` running `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:domain -w backend`, `npm run test:contract -w backend`, `npm run test:integration -w backend`, `npm run test -w frontend`; any failure blocks merge (Constitution: "MUST NOT be merged while any of these tests fail")

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Configuration, database, auth, household scoping, calendar helpers, and the frontend
shell. Every user story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Backend core

- [ ] T010 Implement typed environment config in `backend/src/config.ts` using Zod to parse every variable in `backend/.env.example`; fail fast on startup with a clear message when a required variable is missing
- [ ] T011 Create DB client and transaction helper in `backend/src/db/client.ts` (node-postgres `Pool` + Drizzle; export `db` and `withTransaction(fn)`)
- [ ] T012 Define foundational Drizzle tables in `backend/src/db/schema.ts` exactly per data-model.md: **users** (`id` uuid PK; `email` citext "required, unique, valid email"; `display_name` varchar(40) "required, 1–40 chars after trim"; `created_at` timestamptz default now()), **households** (`id`; `name` varchar(60) "required, 1–60 chars"; `time_zone` varchar(64) "required, valid IANA zone"; `week_start` smallint "fixed `1` (Monday) in v1"; `created_at`), **memberships** (`id`; `household_id` FK required; `user_id` FK required; `joined_at` default now(); `left_at` "null while active"; `ended_by_membership_id` nullable) with partial unique index on `user_id WHERE left_at IS NULL`, **login_tokens** (`id`, `email`, `token_hash` bytea unique, `expires_at` "+15 min", `used_at`), **sessions** (`id`, `user_id`, `token_hash` unique, `expires_at` "+30 days, rolling", `created_at`); use UUID v7 for all ids
- [ ] T013 Configure drizzle-kit in `backend/drizzle.config.ts`, generate the first migration into `backend/src/db/migrations/`, and add `CREATE EXTENSION IF NOT EXISTS citext;` at the top of it; wire `npm run db:migrate -w backend` to apply migrations in `backend/src/db/migrate.ts`
- [ ] T014 Implement the error model in `backend/src/http/errors.ts`: an `AppError(code, httpStatus, message, fields?)` class and a Fastify error handler that always responds `{ code, message, fields? }` per `components.schemas.Error` in contracts/openapi.yaml; map Zod failures to `422` with `code: "validation_error"` and per-field messages
- [ ] T015 Implement the Fastify app factory in `backend/src/app.ts` (`buildApp({ config, db, clock, mailer, push })` with injectable `clock` returning `now()` so tests control time; registers cookie plugin, error handler, `/api/v1` prefix, structured JSON logging that never logs emails or tokens) and process entry `backend/src/server.ts` (builds the app, listens on `PORT`)
- [ ] T016 [P] Implement the mailer abstraction in `backend/src/modules/auth/mailer.ts` with a `console` transport that logs the magic-link URL (used when `MAIL_TRANSPORT=console`) and an interface for a real SMTP transport later
- [ ] T017 [P] Write contract tests (FAILING first) for auth in `backend/tests/contract/auth.test.ts`: `POST /auth/magic-link` always returns `202` (even for unknown emails); `POST /auth/verify` with a valid token returns `200` `Me` and sets an `HttpOnly; Secure; SameSite=Lax` cookie `pvh_session`; reused or expired token (>15 min) returns `400`; `GET /me` without a cookie returns `401`; `PATCH /me` with `displayName` of 41 chars returns `422`; `POST /auth/logout` returns `204` and invalidates the session; validate each response body against contracts/openapi.yaml
- [ ] T018 Implement magic-link auth in `backend/src/modules/auth/routes.ts` and `backend/src/modules/auth/service.ts` per research R-8: random token, store only its SHA-256 in `login_tokens`, 15-minute expiry, single use; on verify create the user on first sign-in (display name defaulting to the email local part, editable via `PATCH /me`), create a session (store only the token hash, 30-day rolling expiry); implement `GET /me`, `PATCH /me`, `POST /auth/logout`; rate-limit `POST /auth/magic-link` to 5 requests per email per 15 minutes (`429`)
- [ ] T019 Implement the request auth hook in `backend/src/http/auth-hook.ts`: resolve the session cookie to `request.user`; return `401` for protected routes without a valid session; for household-scoped routes resolve the caller's active membership to `request.member` (`{ memberId, householdId, timeZone }`) and return `404 no_household` when none exists. All household queries MUST filter by `request.member.householdId` (FR-035)

### Domain foundations (test-first)

- [ ] T020 [P] Write FAILING tests for calendar helpers in `backend/tests/unit/domain/calendar.test.ts`: `localDate(instant, tz)` returns the household-local `YYYY-MM-DD` (an event at 23:30 `America/New_York` stays on that local date even though it is the next day in UTC); `addDays(date, n)` uses calendar days; `daysBetween(a, b)`; `isValidTimeZone("Europe/London") === true` and `isValidTimeZone("Mars/Base") === false`; DST forward and back dates for `America/New_York`, `Europe/London`, `Australia/Sydney` produce the same calendar arithmetic as non-DST dates
- [ ] T021 Implement `backend/src/domain/calendar.ts` with Luxon (`localDate`, `addDays`, `daysBetween`, `isValidTimeZone`, `localTimeOfDay(instant, tz)` returning `HH:mm`) until T020 passes; no I/O, and "now" is always a parameter

### Test infrastructure

- [ ] T022 [P] Create the integration test harness in `backend/tests/integration/helpers/db.ts` (start a `postgres:17` Testcontainer once per run, apply migrations, truncate tables between tests except seed data) and `backend/tests/helpers/app.ts` (build the app with a fake clock, a capturing mailer, and a capturing push sender; helpers `signIn(email)`, `createHouseholdAs(user)`, `joinAs(user, inviteToken)`)
- [ ] T023 [P] Create the contract-validation helper in `backend/tests/contract/helpers/validate.ts` that loads `specs/001-plant-care-tracker/contracts/openapi.yaml` and asserts that a response's status and body match the operation's declared schema

### Frontend shell

- [ ] T024 [P] Add `frontend/scripts/gen-api.mjs` and the npm script `gen:api` that runs `openapi-typescript ../specs/001-plant-care-tracker/contracts/openapi.yaml -o src/api/schema.d.ts`; create a typed client in `frontend/src/api/client.ts` using `openapi-fetch` with `credentials: "include"` and base URL `/api/v1`, plus a `toUserMessage(error)` helper that turns network failures into "Not saved — you're offline" style messages (FR-015)
- [ ] T025 [P] Create the app shell in `frontend/src/main.tsx` and `frontend/src/app/App.tsx`: TanStack Query provider (no silent retries on mutations; mutation errors surface to the UI), React Router routes `/sign-in`, `/auth/verify`, `/join/:token`, `/dashboard`, `/plants`, `/plants/new`, `/plants/:plantId`, `/household`, `/settings`, and an auth guard that redirects to `/sign-in` when `GET /me` returns `401`, and to `/household` (create or join) when `memberId` is null
- [ ] T026 [P] Create base styles and design tokens in `frontend/src/styles/global.css` (mobile-first, layout works from a 360 px viewport with no horizontal scroll, WCAG 2.2 AA contrast, tap targets ≥ 44×44 px, status colors only as reinforcement for text labels, per research R-12)
- [ ] T027 Implement sign-in pages in `frontend/src/pages/SignIn.tsx` (email form → `POST /auth/magic-link`, then a "Check your email" state) and `frontend/src/pages/AuthVerify.tsx` (reads `?token=` → `POST /auth/verify` → redirects to `redirectTo` or `/dashboard`)

**Checkpoint**: Foundation ready. A user can sign in, and the app knows whether they belong to a household.

---

## Phase 3: User Story 1 - Log a watering that the whole household can see (Priority: P1) 🎯 MVP

**Goal**: Roommates share a household and its plants. Any member logs a watering in ≤ 2
interactions; who and when are captured automatically; backdating is marked; mistakes are
undone or edited with an audit trail; other members see the change live.

**Independent Test**: Two members join the same household; one adds a plant; member A logs a
watering; member B sees the last watering time and A's name without re-entering anything
(quickstart E-1, E-3, E-5, E-6, E-11, E-12).

### Tests for User Story 1 (write FIRST, ensure they FAIL) ⚠️

- [ ] T028 [P] [US1] Contract tests for households, members, and invitations in `backend/tests/contract/households.test.ts`: `POST /households` → `201` (caller is the first member) and `409 already_in_household` on a second create; `name` of 61 chars → `422`; invalid IANA `timeZone` → `422`; `GET`/`PATCH /households/current`; `POST /households/current/invitations` → `201` with `url` and `expiresAt` = now + 7 days; `GET /invitations/{token}` (no auth) → `200` preview, or `410 invitation_invalid` when expired or revoked; `POST /invitations/{token}/accept` → `200`, or `409 already_in_household`; `DELETE /households/current/members/{memberId}` → `204`; `POST /households/current/leave` → `204`
- [ ] T029 [P] [US1] Contract tests for plants in `backend/tests/contract/plants.test.ts`: `POST /plants` with `wateringIntervalDays` 0 or 61 → `422`, `name` empty or 61 chars → `422`, `location` 61 chars → `422`, `lastWateredOn` after today (household-local) → `422`; valid create → `201` `PlantWithStatus` with a `watering` schedule; `GET /plants`, `GET /plants/{id}`, `PATCH /plants/{id}`, `POST /plants/{id}/archive`, `POST /plants/{id}/restore`; `GET /plants?includeArchived=true` includes archived plants
- [ ] T030 [P] [US1] Contract tests for care-event logging and audit in `backend/tests/contract/care-events.test.ts`: `POST /plants/{id}/care-events` with `{category:"watering", clientRequestId}` → `201` with `performedBy` = caller and `recordedAt` from the server clock; a client-supplied `performedBy` or `recordedAt` is ignored (or rejected with `422`); `performedAt` in the future → `422`; `performedAt` in the past → `isBackdated: true`; `note` of 281 chars → `422`; repeat `clientRequestId` → `200` with the same event id; `PATCH /care-events/{id}` with `expectedRevision` → `200`; stale `expectedRevision` → `409 revision_conflict`; `POST .../void` and `POST .../restore` → `200`; `GET /care-events/{id}/revisions` lists `edit`/`void`/`restore` with `before`/`after`; `GET /plants/{id}/care-events` includes voided events, newest first, with `limit` 1–100 (default 30)
- [ ] T031 [P] [US1] Integration tests in `backend/tests/integration/care-history.test.ts`: quickstart I-4 (same `clientRequestId` twice → one row), I-5 (direct SQL `DELETE FROM care_events` raises an error), I-6 (`PATCH` then void then restore → 3 revision rows, event `revision` = 4), I-7 (stale revision → nothing changes), I-8 (future `performedAt` → `422`), I-9 (a member of household A requesting household B's plant → `404`); also: an `UPDATE` of `recorded_at`, `performed_by_membership_id`, `plant_id`, or `category_code` raises an error; `UPDATE`/`DELETE` on `care_event_revisions` raises an error
- [ ] T032 [P] [US1] Integration test for live updates in `backend/tests/integration/realtime.test.ts`: member B opens `GET /households/current/stream`; member A logs a watering; B receives `event: care_event.created` with `plantId`, `eventId`, `isPossibleDuplicate:false`, `actorMemberId` within 5 seconds (SC-002); a member of another household receives nothing; heartbeat comment `: ping` arrives every 25 seconds (fake timers)
- [ ] T033 [P] [US1] E2E test in `frontend/tests/e2e/us1-shared-logging.spec.ts` with two browser contexts (A and B): quickstart E-1 (create household "Flat 4" in Europe/London, invite, B joins), E-3 (A taps **Water** once; B's view shows "A · just now" without refresh within 5 s), E-5 (backdated event shows a "Backdated" marker in history), E-6 (undo shows the event as undone with A's revision), E-11 (offline tap shows a "Not saved" error and no success state), E-12 (B removes A; A loses access; A's past events still show "A")

### Implementation for User Story 1

- [ ] T034 [US1] Add US1 tables to `backend/src/db/schema.ts` and generate a migration: **invitations** (`token_hash` bytea "SHA-256 of a random 128-bit token, unique"; `created_by_membership_id`; `expires_at` "created_at + 7 days"; `revoked_at` nullable), **plants** (`name` varchar(60) "required, 1–60 chars"; `location` varchar(60) optional; `created_on` date "household-local date of creation"; `created_by_membership_id`; `archived_at` "null = active"), **care_categories** (`code` varchar(32) PK, `label` varchar(40), `icon` varchar(40)) seeded with exactly one row `('watering','Watering','droplet')`, **care_schedules** (`interval_days` smallint "required, 1–60" with a CHECK constraint; `initial_last_cared_on` date nullable "must not be after `created_on`"; unique `(plant_id, category_code)`), **care_events** (all fields per data-model.md: `performed_at` "must be ≤ `recorded_at`" CHECK; `recorded_at` default now(); `is_backdated`, `is_intentional_extra`, `is_possible_duplicate` booleans default false; `duplicate_of_event_id` nullable FK; `note` varchar(280); `client_request_id` uuid with unique `(performed_by_membership_id, client_request_id)`; `voided_at`, `voided_by_membership_id`; `revision` integer default 1; index `(plant_id, category_code, performed_at DESC) WHERE voided_at IS NULL`; index `(household_id, performed_at)`), **care_event_revisions** (`revision` int with unique `(care_event_id, revision)`; `action` enum `edit | void | restore`; `changed_by_membership_id`; `changed_at`; `before` jsonb; `after` jsonb)
- [ ] T035 [US1] Write SQL triggers in a hand-written migration `backend/src/db/migrations/0002_care_history_guards.sql`: `BEFORE DELETE ON care_events` raises an exception; `BEFORE UPDATE ON care_events` raises if `recorded_at`, `performed_by_membership_id`, `plant_id`, `category_code`, or `household_id` change; `BEFORE UPDATE OR DELETE ON care_event_revisions` raises (Principle I, FR-013)
- [ ] T036 [P] [US1] Implement the household service and routes in `backend/src/modules/households/service.ts` and `backend/src/modules/households/routes.ts`: create household (validate IANA zone with `domain/calendar.isValidTimeZone`; creator becomes the first membership); get/patch current (returns `members` with `active` flag); leave (sets `left_at`, `ended_by_membership_id = null`, deletes that membership's push subscriptions if the table exists); remove member (any member may remove another, sets `ended_by_membership_id`); all members have equal permissions (FR-003)
- [ ] T037 [P] [US1] Implement invitations in `backend/src/modules/households/invitations.ts`: any member creates a multi-use invite link (random 128-bit token, store only its SHA-256, `expires_at` = now + 7 days, URL `${APP_ORIGIN}/join/{token}`); revoke; preview (household name, active member count, expiry); accept requires sign-in, blocks with `409 already_in_household` when the user has an active membership, and returns `410 invitation_invalid` when expired or revoked
- [ ] T038 [US1] Implement the plant service and routes in `backend/src/modules/plants/service.ts` and `backend/src/modules/plants/routes.ts`: create plant + `watering` schedule in one transaction (`created_on` = household-local today via `calendar.localDate(clock.now(), tz)`; optional `lastWateredOn` stored as `initial_last_cared_on`, rejected if after today); list (excluding archived unless `includeArchived=true`), get, patch (`name`, `location`, `wateringIntervalDays`), archive, restore; responses shaped as `PlantWithStatus` including `latestEventId` per schedule. Until US2 lands, `dueStatus` is omitted
- [ ] T039 [US1] Implement care-event writes in `backend/src/modules/care-events/service.ts`: `logEvent(member, plantId, input)` runs in one transaction that locks the plant's `care_schedules` row with `SELECT … FOR UPDATE` (research R-4); sets `performed_by_membership_id` from the session and `recorded_at` from the server clock (never from the client, FR-010); `performed_at` defaults to `recorded_at`; when `performedAt` is supplied it must be ≤ now (`422` otherwise) and `is_backdated = true` (FR-012); idempotent replay on duplicate `(member, client_request_id)` returns the existing event with `200`. Provide a `duplicateCheck` hook point that US3 fills in; until then, always save normally
- [ ] T040 [US1] Implement edit, void, restore, and revisions in `backend/src/modules/care-events/service.ts`: each checks `expectedRevision` (`409 revision_conflict` on mismatch), updates the event, increments `revision`, and inserts a `care_event_revisions` row with `action`, `changed_by_membership_id`, and `before`/`after` JSON of the changed fields in the SAME transaction; edit allows only `performedAt` (must remain ≤ the original `recorded_at`, and editing it sets `is_backdated = true`) and `note` (≤ 280 chars); void on an already-voided event → `409`; restore on a non-voided event → `409`
- [ ] T041 [US1] Implement care-event routes in `backend/src/modules/care-events/routes.ts` per contracts/openapi.yaml: `POST /plants/{plantId}/care-events` (only `category: "watering"` accepted), `GET /plants/{plantId}/care-events` (cursor `before`, `limit` 1–100, default 30, voided included), `PATCH /care-events/{eventId}`, `POST /care-events/{eventId}/void`, `POST /care-events/{eventId}/restore`, `GET /care-events/{eventId}/revisions`; `POST` responds with `CareEventCreated` `{ event, plant }`
- [ ] T042 [US1] Implement the realtime layer in `backend/src/realtime/event-bus.ts` (an `EventBus` interface with an in-process implementation keyed by `householdId`; publish ONLY after the transaction commits) and `backend/src/realtime/sse.ts` (`GET /households/current/stream`, `text/event-stream`, `: ping` every 25 s, envelope `{ householdId, actorMemberId, occurredAt, ...fields }` with a UUID v7 `id`); emit the events listed in contracts/realtime-and-push.md from the household, plant, and care-event services (`care_event.created`, `care_event.updated`, `plant.created|updated|archived|restored`, `member.joined|left`, `household.updated`)
- [ ] T043 [US1] Register all US1 routes in `backend/src/app.ts` and confirm T028–T032 pass
- [ ] T044 [P] [US1] Implement realtime on the client in `frontend/src/realtime/useHouseholdStream.ts`: open an `EventSource` to `/api/v1/households/current/stream`; on each event invalidate the TanStack Query keys listed in contracts/realtime-and-push.md (skip when `actorMemberId` is the current member); after any reconnect refetch the dashboard and plants; never patch computed status locally (FR-019)
- [ ] T045 [P] [US1] Build household pages in `frontend/src/pages/Household.tsx` (create household with name and time zone picker defaulting to the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`; member list; "Invite roommate" button that creates and copies an invite link; remove member; leave) and `frontend/src/pages/Join.tsx` (preview via `GET /invitations/{token}`, sign in if needed with `redirectTo=/join/{token}`, accept, then go to `/dashboard`; expired invites show a clear message)
- [ ] T046 [P] [US1] Build plant pages in `frontend/src/pages/Plants.tsx` (list with archived toggle) and `frontend/src/pages/PlantForm.tsx` (add/edit: name 1–60 chars, optional location ≤ 60 chars, watering interval 1–60 days, optional "last watered" date not after today; archive/restore)
- [ ] T047 [US1] Build the log action in `frontend/src/components/LogWateringButton.tsx`: one tap sends `POST /plants/{id}/care-events` with a fresh `crypto.randomUUID()` `clientRequestId` and the displayed `latestEventId` as `knownLatestEventId`; shows a pending state, then a success confirmation; on failure shows an explicit "Not saved" error with a retry that reuses the same `clientRequestId` (FR-015); an optional "Earlier…" affordance opens a date/time picker (no future times) and a note field (≤ 280 chars) for backdating
- [ ] T048 [US1] Build the plant detail and history page in `frontend/src/pages/PlantDetail.tsx` with `frontend/src/components/CareHistoryList.tsx`: last watered by whom and when, history newest first with markers "Backdated", "Undone", "Extra", "Possible duplicate" as text labels; per-event Undo/Restore and Edit (performedAt and note) sending `expectedRevision`; on `409 revision_conflict` refetch and tell the user; a "Changes" view per event listing revisions (`GET /care-events/{id}/revisions`)
- [ ] T049 [US1] Build an interim dashboard in `frontend/src/pages/Dashboard.tsx` listing active plants with the `LogWateringButton` and "Last watered by {name}, {relative time}" (replaced by the weekly view in US4); mount `useHouseholdStream` in the authenticated layout in `frontend/src/app/App.tsx`
- [ ] T050 [US1] Run T033 (E2E US1) and confirm it passes

**Checkpoint**: User Story 1 is fully functional and demoable. It is the MVP: a shared,
attributed, auditable watering log with live updates.

---

## Phase 4: User Story 2 - See which plants are upcoming, due, or overdue (Priority: P2)

**Goal**: The server computes each plant's status (Overdue / Due today / Upcoming, with day
counts) from its interval and latest watering, traceable to its basis, identical for all
members. Opted-in members also receive one daily summary of due and overdue plants (Story 2
scenarios 6–7, FR-031–FR-034).

**Independent Test**: A plant with a 3-day interval last watered 4 days ago shows "Overdue by
1 day" for every member; logging a watering changes it to "Upcoming — due in 3 days"
(quickstart §3 due-status table, E-2, E-10).

### Tests for User Story 2 (write FIRST, ensure they FAIL) ⚠️

- [ ] T051 [P] [US2] FAILING domain tests in `backend/tests/unit/domain/due-status.test.ts` for `computeDueStatus({ intervalDays, latestEventLocalDate?, initialLastCaredOn?, createdOn }, today)` covering every row of the quickstart §3 due-status table: interval 7 last 7 days ago → `due_today`; interval 3 last 5 days ago → `overdue`, `daysOverdue: 2`, label "Overdue by 2 days"; interval 5 last 1 day ago → `upcoming`, `daysUntilDue: 4`, label "Upcoming — due in 4 days"; no history and no initial date → due on `createdOn` (`due_today` on creation day), `basis.source: "created_on"`; initial last-watered date only → `basis.source: "initial_last_watered"`; interval 2 last 14 days ago → a single `overdue` result with `daysOverdue: 12`; the interval change from 7 to 3 is reflected immediately; `basis` includes `intervalDays`, `source`, and `baseDate`
- [ ] T052 [P] [US2] FAILING property-based tests (fast-check) in `backend/tests/unit/domain/due-status.property.test.ts`: (a) purity: same inputs always give the same output; (b) for overdue results `daysOverdue + intervalDays === daysBetween(baseDate, today)`; (c) adding a backdated event older than the latest event never changes `dueDate`; (d) for `today` across DST transition dates in `America/New_York`, `Europe/London`, `Australia/Sydney`, `dueDate` equals the plain calendar-day sum
- [ ] T053 [P] [US2] FAILING domain tests in `backend/tests/unit/domain/daily-summary.test.ts`: `summaryDue({ localNowTime, localDate, deliveryTime, existingDispatch })` is false before the delivery time, true at or after it when no dispatch exists, and false when a dispatch already exists for that `localDate`; `buildSummary(statuses)` lists overdue items first (with days) then due today, excludes upcoming and archived items, sets `isEmpty` when there are none, and produces `title` "{n} plant(s) need water" and a `body` truncated to about 120 chars with "+N more"
- [ ] T054 [P] [US2] Contract tests for status fields and notifications in `backend/tests/contract/due-status.test.ts` and `backend/tests/contract/notifications.test.ts`: `GET /plants` returns `today` and each schedule's `dueStatus` (`status` enum `overdue | due_today | upcoming`, `label`, `dueDate`, `basis`), with no `dueStatus` on archived plants; there is no writable status field (a `PATCH` with `status` is rejected or ignored); `GET`/`PUT /me/notification-preferences` with `deliveryTime` pattern `^([01]\d|2[0-3]):[0-5]\d$` (`"24:00"` → `422`) and default `{ dailySummaryEnabled: false, deliveryTime: "08:00" }`; `POST /me/push-subscriptions` upserts by endpoint and returns `201 { id }`; `DELETE /me/push-subscriptions/{id}` → `204`; `GET /push/vapid-public-key` (no auth) → `200 { publicKey }`
- [ ] T055 [P] [US2] Integration tests in `backend/tests/integration/due-status.test.ts`: two members fetching `GET /plants` at the same fake-clock instant get identical `dueStatus` (FR-019, SC-008); voiding the latest event makes status fall back to the previous event; a backdated event older than the latest does not change `dueDate`; changing the household time zone changes `today` consistently
- [ ] T056 [P] [US2] Integration tests for the scheduler in `backend/tests/integration/daily-summary.test.ts`: quickstart I-10 (3 ticks at 08:00/08:01 → one push, one `sent` dispatch row), I-11 (a plant watered at 07:55 is excluded; if nothing remains → `skipped_empty`, no push), I-12 (push service 410 → subscription deleted); a member with `dailySummaryEnabled: false` gets nothing; a 429/5xx is retried on the next tick, and the dispatch is `failed` only if every device fails; the payload matches contracts/realtime-and-push.md (`type: "daily_summary"`, `localDate`, `title`, `body`, `counts`, `url: "/dashboard"`)

### Implementation for User Story 2

- [ ] T057 [US2] Implement `backend/src/domain/due-status.ts` (`computeDueStatus` per research R-3: `dueDate = latestEventLocalDate + interval`, else `initialLastCaredOn + interval`, else `createdOn`; status by comparing `dueDate` with `today`; labels "Overdue by N day(s)", "Due today", "Upcoming — due in N day(s)"; `basis { intervalDays, source, baseDate }`) until T051 and T052 pass
- [ ] T058 [US2] Implement `backend/src/domain/daily-summary.ts` (`summaryDue`, `buildSummary`) until T053 passes
- [ ] T059 [US2] Implement status assembly in `backend/src/modules/plants/status.ts`: load each schedule's latest non-voided event (using index `(plant_id, category_code, performed_at DESC) WHERE voided_at IS NULL`) and its performer's display name; convert `performed_at` with `calendar.localDate(…, household.timeZone)`; call `computeDueStatus` with `today = localDate(clock.now(), tz)`; fill `basis.eventId`, `basis.performedAt`, `basis.performedBy`. Wire it into `GET /plants`, `GET /plants/{id}`, every plant mutation response, and `CareEventCreated.plant` in `backend/src/modules/plants/service.ts` and `backend/src/modules/care-events/service.ts`. Archived plants get no `dueStatus`
- [ ] T060 [US2] Add notification tables to `backend/src/db/schema.ts` and generate a migration: **notification_preferences** (`membership_id` PK/FK; `daily_summary_enabled` boolean "default false (opt-in)"; `delivery_time` time "default `08:00`", minute precision; `updated_at`), **push_subscriptions** (`endpoint` text "unique, https URL"; `p256dh` text required; `auth` text required; `created_at`; `last_success_at` nullable), **daily_summary_dispatches** (`local_date` date; `status` enum `sent | skipped_empty | failed`; `item_count` smallint; `dispatched_at`; unique `(membership_id, local_date)`)
- [ ] T061 [US2] Implement notification routes in `backend/src/modules/notifications/routes.ts` and `backend/src/modules/notifications/service.ts`: `GET`/`PUT /me/notification-preferences` (returns `hasPushSubscription`), `POST /me/push-subscriptions` (upsert by `endpoint`), `DELETE /me/push-subscriptions/{subscriptionId}`, `GET /push/vapid-public-key`; delete a membership's subscriptions when it leaves or is removed (update `backend/src/modules/households/service.ts`)
- [ ] T062 [US2] Implement the push sender in `backend/src/modules/notifications/push-sender.ts` wrapping `web-push` (VAPID from config; TTL 4 h; urgency `normal`; `Topic: daily-summary`); returns a per-subscription outcome (`ok | gone | retryable`); `gone` (404/410) deletes the subscription, and `ok` sets `last_success_at`
- [ ] T063 [US2] Implement the scheduler in `backend/src/jobs/daily-summary.ts`: `tick(now)` loads enabled preferences with their household time zone; for each where `summaryDue` is true, computes current statuses via `plants/status.ts`, then calls `buildSummary`; if not empty, sends to all of that member's subscriptions and records `sent`; otherwise records `skipped_empty`, using `INSERT … ON CONFLICT (membership_id, local_date) DO NOTHING` to claim the day BEFORE sending so ticks are idempotent; if every device returns `retryable`, delete the claim so the next tick retries once, then record `failed`. Start `setInterval(tick, 60_000)` from `backend/src/server.ts` (not from `app.ts`, so tests drive `tick` directly)
- [ ] T064 [P] [US2] Build `frontend/src/components/StatusBadge.tsx` rendering icon + text label for `overdue` / `due_today` / `upcoming` (e.g., "Overdue by 2 days") with color as reinforcement only (FR-027), and `frontend/src/components/StatusBasis.tsx` showing "Last watered by {performedBy} on {date} · every {intervalDays} days" (FR-018); add them to plant cards in `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Plants.tsx`, and `frontend/src/pages/PlantDetail.tsx`; sort the interim dashboard overdue → due today → upcoming
- [ ] T065 [P] [US2] Configure the PWA in `frontend/vite.config.ts` with `vite-plugin-pwa` (`injectManifest` strategy; manifest name "PlantsVSHumans", `display: "standalone"`, icons in `frontend/public/icons/`) and write `frontend/src/sw/service-worker.ts`: on `push` show a notification with `title`/`body`, `tag` `daily-summary-{localDate}`, and the app icon; on `notificationclick` focus an existing window and navigate to `url`, or open `url` (FR-034)
- [ ] T066 [US2] Build the settings page in `frontend/src/pages/Settings.tsx`: daily summary on/off and delivery time (HH:mm, default 08:00, labelled with the household time zone); turning it on requests notification permission, subscribes via `PushManager.subscribe` with the VAPID key, and posts the subscription; if permission is denied, show guidance and leave it off; on iOS outside standalone mode, explain "Add to Home Screen" is required; display name editing via `PATCH /me`
- [ ] T067 [US2] E2E test in `frontend/tests/e2e/us2-due-status.spec.ts`: quickstart E-2 (new plant with no last-watered date shows "Due today" for both members) and E-10 (enable the summary 2 minutes ahead using a test-only clock control, close the page, receive one notification listing overdue then due-today plants, and clicking it opens `/dashboard`); expose the test-only clock and tick trigger only when `NODE_ENV=test` in `backend/src/http/test-hooks.ts`

**Checkpoint**: User Stories 1 and 2 both work. Members see consistent, traceable status and
can opt into a daily summary.

---

## Phase 5: User Story 3 - Get warned before duplicating care (Priority: P3)

**Goal**: Before saving, the server warns when the same plant was already watered within the
duplicate window (`max(12h, interval × 12h)`), naming who and when. Cancel saves nothing; confirm
saves an intentional extra. True races save both and flag the later one.

**Independent Test**: A logs a watering; B immediately tries to log the same plant and sees a
warning naming A and the time; cancel saves nothing; confirm saves an event flagged as an
intentional extra (quickstart I-1–I-3, E-4).

### Tests for User Story 3 (write FIRST, ensure they FAIL) ⚠️

- [ ] T068 [P] [US3] FAILING domain tests in `backend/tests/unit/domain/duplicates.test.ts`: `duplicateWindow(1)` = 12 h; `duplicateWindow(7)` = 84 h (3.5 days); `duplicateWindow(60)` = 720 h; `classifyDuplicate({ candidates, knownLatestEventId, confirmDuplicate, newPerformedAt })` returns `save_normal` when no candidate is within the window (boundary: exactly at the window edge counts as outside); `warn` when a candidate is within the window and is the client's `knownLatestEventId` (or older than it) and `confirmDuplicate` is not true; `save_intentional_extra` when `confirmDuplicate` is true; `save_possible_duplicate` (with `duplicateOfEventId`) when a candidate within the window is newer than `knownLatestEventId` or `knownLatestEventId` is null while a candidate exists that the client never saw; voided events are never candidates
- [ ] T069 [P] [US3] Contract tests in `backend/tests/contract/duplicates.test.ts`: `POST /plants/{id}/care-events` returns `409` `DuplicateWarning` (`code: "duplicate_warning"`, `message` like "A watered Fern 3 hours ago — log anyway?", `existingEvent`, `windowHours`) and saves nothing; the same request with `confirmDuplicate: true` → `201` with `isIntentionalExtra: true` and `duplicateOfEventId` set
- [ ] T070 [P] [US3] Integration tests in `backend/tests/integration/concurrency.test.ts`: quickstart I-1 (two members `POST` concurrently with the same stale `knownLatestEventId` → both `201`, exactly one event has `isPossibleDuplicate: true`, total count 2; repeat 20 times to catch nondeterminism), I-2 (known event 3 hours old with interval 2, not confirmed → `409`, count unchanged), I-3 (confirmed → `201`, `isIntentionalExtra: true`); the SSE event `care_event.created` carries `isPossibleDuplicate: true` for the flagged event

### Implementation for User Story 3

- [ ] T071 [US3] Implement `backend/src/domain/duplicates.ts` (`duplicateWindow`, `classifyDuplicate`) per research R-4 until T068 passes
- [ ] T072 [US3] Fill the `duplicateCheck` hook in `backend/src/modules/care-events/service.ts`: inside the existing `FOR UPDATE` transaction, load non-voided events of the same plant and category within `duplicateWindow(interval)` of the new `performedAt`; call `classifyDuplicate`; on `warn` throw `AppError("duplicate_warning", 409)` with the `DuplicateWarning` body (performer display name and relative time); on `save_intentional_extra` / `save_possible_duplicate` set the flag and `duplicate_of_event_id`; ensure the `409` path writes nothing, and T069 and T070 pass
- [ ] T073 [P] [US3] Build `frontend/src/components/DuplicateWarningDialog.tsx`: opened by `LogWateringButton` on a `409 duplicate_warning`; shows the server `message`, with **Cancel** (nothing saved, dialog closes) and **Log anyway** (resends with `confirmDuplicate: true` and a NEW `clientRequestId`); accessible (focus trap, Esc = Cancel, labelled buttons); update `frontend/src/components/LogWateringButton.tsx` to use it, so the normal path is still 1 tap and the warning path is 2 taps (FR-009)
- [ ] T074 [P] [US3] Build `frontend/src/components/PossibleDuplicateNotice.tsx`: when `useHouseholdStream` receives `care_event.created` with `isPossibleDuplicate: true`, show a non-blocking notice ("{name} and you both logged {plant} — review?") linking to `/plants/{plantId}`; update `frontend/src/realtime/useHouseholdStream.ts` to surface it
- [ ] T075 [US3] E2E test in `frontend/tests/e2e/us3-duplicates.spec.ts`: quickstart E-4 (A waters Monstera; B taps Water and sees the warning naming A; Cancel → history unchanged; tap again and confirm → history shows an "Extra" entry)

**Checkpoint**: User Stories 1–3 all work. Duplicate care is prevented or flagged and never lost.

---

## Phase 6: User Story 4 - Weekly dashboard of all care activities (Priority: P4)

**Goal**: A Monday–Sunday dashboard in the household time zone with overdue items first, then
each day's completed and due items, clear category and status labels, previous/next week
navigation, and a member filter.

**Independent Test**: Seed a household with a week of completed, due, and overdue activities;
the dashboard shows every activity in the correct day and category, with overdue highlighted
first and each item showing plant, category, status, and performer (quickstart E-7–E-9).

### Tests for User Story 4 (write FIRST, ensure they FAIL) ⚠️

- [ ] T076 [P] [US4] FAILING domain tests in `backend/tests/unit/domain/week.test.ts`: `weekBounds("2026-11-15" /* Sunday */)` → `{ weekStart: "2026-11-09", weekEnd: "2026-11-15" }`; a Monday maps to itself; `projectDueDates({ dueDate, intervalDays, rangeStart, rangeEnd })` returns `dueDate` and every `+intervalDays` within the range, inclusive, with nothing before `dueDate`; a range containing a DST change in `Europe/London` gives the correct dates
- [ ] T077 [P] [US4] Contract tests in `backend/tests/contract/dashboard.test.ts`: `GET /dashboard` returns `Dashboard` with exactly 7 `days`, `today`, `weekStart` (a Monday), `weekEnd`, `timeZone`, `members`, and `categories` (length 1 in v1); `weekStart` not on a Monday → `422`; every item has `kind` (`completed | overdue | due_today | upcoming`), `plantName`, `category { code, label, icon }`, and a non-empty `statusLabel`
- [ ] T078 [P] [US4] Integration tests in `backend/tests/integration/dashboard.test.ts`: seeded week (fake clock on a Wednesday) → `overdue[]` holds overdue plants and is listed separately; today's day holds `due_today` items; future days hold `upcoming` items, with `projected: true` beyond the next due date; past days hold only `completed` items, excluding voided events; next week → only projected `upcoming`, with `overdue` empty; previous week → only `completed`, with `overdue` empty; `memberId` filter restricts `completed` items to that performer while due and overdue items stay (FR-029, FR-030); archived plants appear only through their past completed events

### Implementation for User Story 4

- [ ] T079 [US4] Implement `backend/src/domain/week.ts` (`weekBounds`, `projectDueDates`) until T076 passes
- [ ] T080 [US4] Implement dashboard assembly in `backend/src/modules/dashboard/service.ts` per research R-10: resolve the week (default = the week containing household-local today; reject non-Monday `weekStart` with `422`); query non-voided events in `[weekStart 00:00, weekEnd 24:00)` household-local, converted to UTC bounds via `calendar`; compute statuses via `plants/status.ts`; place `completed`, `due_today`, `upcoming` (with `projected`) items per day using `projectDueDates`; fill `overdue[]` only if the week contains today; apply the `memberId` filter to `completed` only; include `members` (active and departed members with events that week) and `categories`
- [ ] T081 [US4] Implement `GET /dashboard` in `backend/src/modules/dashboard/routes.ts`, register it in `backend/src/app.ts`, and confirm T077 and T078 pass
- [ ] T082 [P] [US4] Build `frontend/src/components/CategoryLabel.tsx` (icon + text label from `category.icon`/`category.label`, e.g., droplet + "Watering") and `frontend/src/components/DashboardItem.tsx` (plant name and location, `CategoryLabel`, `statusLabel` text, performer and time for completed items, `LogWateringButton` for overdue and due-today items using `latestEventId`)
- [ ] T083 [P] [US4] Build `frontend/src/components/WeekNav.tsx` (previous/this/next week; shows "9–15 Nov 2026"; keeps `weekStart` in the URL query) and `frontend/src/components/MemberFilter.tsx` (All + each member; a category filter is rendered only when `categories.length > 1`, per FR-029)
- [ ] T084 [US4] Replace the interim dashboard in `frontend/src/pages/Dashboard.tsx` with the weekly view: an Overdue section first (prominent, text-labelled), then seven day groups Monday → Sunday with today highlighted (by label as well as color); empty days show "Nothing scheduled"; works at 360 px with no horizontal scroll; refetches on `useHouseholdStream` invalidations and at local midnight
- [ ] T085 [US4] E2E test in `frontend/tests/e2e/us4-dashboard.spec.ts`: quickstart E-7 (360 px viewport, Mon–Sun groups, overdue first, Watering icon + label, no horizontal scroll by asserting `document.documentElement.scrollWidth <= 360`), E-8 (next week shows projected items; previous week shows completed only), E-9 (filter by member B: only B's completed items, due items remain)

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Hardening, accessibility, metrics, and final validation

- [ ] T086 [P] Add accessibility checks with `@axe-core/playwright` to every E2E spec through the shared fixture `frontend/tests/e2e/fixtures.ts`; fail on any serious or critical violation (WCAG 2.2 AA, FR-027, FR-037)
- [ ] T087 [P] Add component tests in `frontend/tests/unit/` for `StatusBadge`, `CategoryLabel`, `DuplicateWarningDialog`, and `LogWateringButton` (pending, success, and offline-error states; retry reuses `clientRequestId`)
- [ ] T088 [P] Add pilot metric instrumentation in `backend/src/modules/metrics/service.ts` with a privacy-safe structured log line per event (no emails, no notes): `care_event.logged` (`isBackdated`, minutes between `performedAt` and `recordedAt`), `care_event.flagged` (`possible_duplicate | intentional_extra`), `daily_summary.dispatched` (`status`, seconds after `deliveryTime`), and a nightly count of plants overdue at local day end per household. These support measuring SC-005, SC-006, SC-007, SC-009
- [ ] T089 [P] Security hardening in `backend/src/app.ts`: `@fastify/helmet` with a CSP suitable for the PWA, CORS restricted to `APP_ORIGIN`, CSRF protection for cookie-authenticated mutations (require `Origin` = `APP_ORIGIN` on non-GET requests), and general rate limiting with `@fastify/rate-limit`; confirm logs never include tokens, cookies, or emails
- [ ] T090 [P] Performance check script `backend/scripts/seed-load.ts` that seeds 1,000 households × 6 members × 50 plants with one year of events, plus a short report verifying `GET /dashboard` and `POST care-events` p95 < 300 ms locally; add missing indexes if not
- [ ] T091 [P] Write `README.md` at repo root: what the app does, prerequisites, setup and run steps (link to `specs/001-plant-care-tracker/quickstart.md`), test commands, and the iOS "Add to Home Screen" requirement for notifications
- [ ] T092 Run the full quickstart.md validation (§2 setup, §3 domain, §4 contract and integration, §5 E2E) on a clean checkout and fix any failures
- [ ] T093 Re-run the Constitution Check in `specs/001-plant-care-tracker/plan.md` against the implemented code (domain purity lint rule, no-delete triggers, no writable status, test-first order honored, every dependency listed in Complexity Tracking) and record the result there

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; start immediately
- **Foundational (Phase 2)**: Depends on Setup; BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational
- **US2 (Phase 4)**: Depends on Foundational and on US1's plant and care-event tables and services (T034, T038, T039), because status is computed from recorded events
- **US3 (Phase 5)**: Depends on US1's care-event write path (T039 `duplicateCheck` hook). Independent of US2
- **US4 (Phase 6)**: Depends on US1 (events) and US2 (status assembly in T059). Independent of US3
- **Polish (Phase 7)**: Depends on all desired stories being complete

### User Story Dependency Graph

```text
Setup → Foundational → US1 (P1, MVP) ─┬─→ US2 (P2) ──→ US4 (P4)
                                       └─→ US3 (P3)
```

### Within Each User Story

- Test tasks MUST be written and seen FAILING before the matching implementation task
  (Constitution Principle IV); domain tests before domain code is non-negotiable
- Schema/migrations → domain functions → services → routes → frontend → E2E
- A story is complete when its contract, integration, and E2E tests pass

### Key Task-Level Dependencies

- T020 → T021 (calendar tests before calendar code)
- T017 → T018 (auth contract tests before auth)
- T028–T032 → T034–T043 (US1 tests before US1 backend)
- T034 → T035 → T039 → T040 → T041 (schema → triggers → write path → edits → routes)
- T042 depends on T036, T038, T039 (services emit events)
- T051, T052 → T057; T053 → T058; T057 → T059; T060 → T061 → T062 → T063
- T068 → T071 → T072 → T073
- T076 → T079 → T080 → T081 → T084

### Parallel Opportunities

- Phase 1: T004–T009 in parallel after T001–T003
- Phase 2: T016, T017, T020, T022, T023, T024, T025, T026 in parallel
- After US1 completes, US2 and US3 can proceed in parallel (different files, except `care-events/service.ts`, so coordinate T059 and T072)
- Within each story, all test tasks marked [P] run in parallel, and the frontend tasks marked [P] run in parallel with each other

---

## Parallel Example: User Story 1

```bash
# Write all US1 tests together (they must FAIL first):
Task: "Contract tests for households in backend/tests/contract/households.test.ts"
Task: "Contract tests for plants in backend/tests/contract/plants.test.ts"
Task: "Contract tests for care events in backend/tests/contract/care-events.test.ts"
Task: "Integration tests in backend/tests/integration/care-history.test.ts"
Task: "Integration test for live updates in backend/tests/integration/realtime.test.ts"
Task: "E2E test in frontend/tests/e2e/us1-shared-logging.spec.ts"

# After T034–T035, build household services in parallel:
Task: "Household service and routes in backend/src/modules/households/"
Task: "Invitations in backend/src/modules/households/invitations.ts"

# Frontend pages in parallel:
Task: "Realtime client in frontend/src/realtime/useHouseholdStream.ts"
Task: "Household and Join pages in frontend/src/pages/"
Task: "Plant pages in frontend/src/pages/Plants.tsx and PlantForm.tsx"
```

## Parallel Example: User Story 2

```bash
Task: "Domain tests in backend/tests/unit/domain/due-status.test.ts"
Task: "Property tests in backend/tests/unit/domain/due-status.property.test.ts"
Task: "Domain tests in backend/tests/unit/domain/daily-summary.test.ts"
Task: "Contract tests in backend/tests/contract/due-status.test.ts and notifications.test.ts"
# later:
Task: "StatusBadge and StatusBasis in frontend/src/components/"
Task: "PWA config and service worker in frontend/src/sw/service-worker.ts"
```

## Parallel Example: User Story 3

```bash
Task: "Domain tests in backend/tests/unit/domain/duplicates.test.ts"
Task: "Contract tests in backend/tests/contract/duplicates.test.ts"
Task: "Concurrency tests in backend/tests/integration/concurrency.test.ts"
# later:
Task: "DuplicateWarningDialog in frontend/src/components/DuplicateWarningDialog.tsx"
Task: "PossibleDuplicateNotice in frontend/src/components/PossibleDuplicateNotice.tsx"
```

## Parallel Example: User Story 4

```bash
Task: "Domain tests in backend/tests/unit/domain/week.test.ts"
Task: "Contract tests in backend/tests/contract/dashboard.test.ts"
Task: "Integration tests in backend/tests/integration/dashboard.test.ts"
# later:
Task: "CategoryLabel and DashboardItem in frontend/src/components/"
Task: "WeekNav and MemberFilter in frontend/src/components/"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational)
2. Complete Phase 3 (US1): shared household, plants, attributed logging, audit, live updates
3. **STOP and VALIDATE**: run T050 (quickstart E-1, E-3, E-5, E-6, E-11, E-12)
4. Demo to roommates. This alone answers "did anyone water the fern?"

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → validate → demo (MVP)
3. US2 → due/overdue status + daily summary → validate → demo
4. US3 → duplicate warnings → validate → demo (can run in parallel with US2)
5. US4 → weekly dashboard → validate → demo
6. Polish → full quickstart validation → pilot (measure SC-004 to SC-010)

### Parallel Team Strategy

1. The team completes Setup + Foundational together
2. One developer does US1 (it unblocks everything else)
3. Then Developer A takes US2 → US4 while Developer B takes US3 → Polish (T086–T087)

---

## Notes

- [P] tasks = different files with no dependencies on incomplete tasks
- The [Story] label maps each task to a spec user story for traceability
- Verify that tests fail before implementing (Principle IV); note the failing run in the PR description
- Never compute due status in the frontend (FR-019); never accept performer or `recordedAt` from the client (FR-010)
- Commit after each task or logical group; stop at any checkpoint to validate a story on its own
