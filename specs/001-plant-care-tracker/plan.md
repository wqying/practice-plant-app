# Implementation Plan: PlantsVSHumans — Shared Plant Care Tracker

**Branch**: `001-plant-care-tracker` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-plant-care-tracker/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

PlantsVSHumans gives a household of roommates one shared, trustworthy record of plant
watering. It computes upcoming, due-today, and overdue status for each plant, warns before
duplicate watering, and shows a Monday–Sunday dashboard of all care activity. Opted-in
members also get a once-a-day summary of due and overdue plants.

**Technical approach** (see [research.md](./research.md)):

- The app is an installable, mobile-first Progressive Web App (React + Vite) backed by a
  single TypeScript API service (Fastify) and PostgreSQL.
- All scheduling, due-status, duplicate-window, and week-projection rules live in a pure,
  I/O-free domain module. That module is written test-first (Principle IV) and evaluated
  only on the server, so every member sees the same answer (Principle III, FR-019).
- Care events are stored once, changed only through audited revisions, and never deleted
  (Principle I).
- Changes reach other members' open sessions over Server-Sent Events (SC-002).
- Daily summaries are delivered through standard Web Push by an idempotent per-minute
  scheduler (FR-031–FR-034).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS (backend). TypeScript 5.x in
evergreen browsers (frontend).

**Primary Dependencies**:

- Backend: Fastify 5 (HTTP API + SSE), Drizzle ORM (schema and migrations), Zod (request
  validation), Luxon (time-zone-aware calendar math), `web-push` (VAPID Web Push).
- Frontend: React 19, Vite, `vite-plugin-pwa` (service worker + manifest), TanStack Query
  (server state).

**Storage**: PostgreSQL 17 (single shared source of truth). All timestamps are stored as
`timestamptz` in UTC.

**Testing**:

- Vitest for domain unit tests, with fast-check for property-based tests of schedule
  rules.
- Vitest + Fastify `inject` for API contract tests.
- Testcontainers (real PostgreSQL) for integration and concurrency tests.
- Playwright for end-to-end flows across two simulated members.

**Target Platform**:

- A Linux container for the API (one Node process plus PostgreSQL).
- Clients: current Chrome, Edge, Firefox, and Safari on desktop and mobile, including iOS
  16.4+ home-screen PWAs (needed for Web Push).

**Project Type**: Web application (frontend PWA + backend API).

**Performance Goals**:

- An event logged by one member appears for others within 5 seconds (SC-002).
- Logging takes at most 10 seconds end to end and at most 2 interactions (SC-001,
  FR-009).
- The dashboard reaches first meaningful render within 2 seconds on a mid-range phone
  over 4G.
- API p95 latency is under 300 ms.
- 95% of daily summaries are delivered within 5 minutes of the chosen time (SC-009).

**Constraints**:

- The app needs to be online to log events. Offline queuing is out of scope, and a failed
  save must be reported (FR-015).
- Calendar math is per household time zone and must be correct across DST changes.
- Only an email address and a display name are stored as personal data (FR-036).
- No color-only meaning in the UI (FR-027).
- The UI must be usable from a 360 px viewport without horizontal scrolling (FR-037).

**Scale/Scope**:

- Pilot: up to about 1,000 households.
- Per household: 2–6 members and up to about 50 plants.
- Event volume is roughly a few thousand care events per household per year.
- A single API instance is enough for this scale (see research R-6).
- About 8 screens: Sign-in, Join, Dashboard, Plants, Plant detail/history, Add/Edit plant,
  Household, Settings.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.0.0 (`.specify/memory/constitution.md`).

| # | Gate (from constitution) | Pre-research | Post-design | Evidence |
|---|--------------------------|:---:|:---:|---|
| I | One shared record; duplicate warning; append-only with audit; concurrent writes never lost | PASS | PASS | One PostgreSQL DB. `care_events` cannot be deleted (DB trigger). Every edit, void, or restore writes a `care_event_revisions` row in the same transaction. Duplicate check runs server-side under a per-plant row lock. In a race, the later event is saved and flagged `is_possible_duplicate` instead of being rejected ([data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml) `POST /plants/{plantId}/care-events`). |
| II | Log in ≤ 2 interactions; automatic who/when; explicit, marked backdating | PASS | PASS | Dashboard "Water" button = 1 tap, plus 1 tap only when a duplicate warning appears. `performedByMemberId` and `recordedAt` are set by the server from the session and clock and are never accepted from the client. `performedAt` is optional. When it is supplied, `is_backdated=true`, and future times are rejected. |
| III | Status computed, never hand-entered; deterministic; UTC storage, local display; traceable | PASS | PASS | Pure `computeDueStatus(schedule, latestEvent, today, tz)` in `backend/src/domain`. Due dates use local calendar days (R-3), so DST cannot shift them. Every plant status response includes `basis { eventId, performedAt, intervalDays }`. There is no writable status field anywhere. |
| IV | Test-first domain logic; boundary coverage; no merge on red | PASS | PASS | Domain module has zero I/O and is covered by Vitest + fast-check. The required cases (interval edges, DST, concurrency, no-history) are listed in [quickstart.md](./quickstart.md) §3. CI blocks merge on failure. Task ordering in `/speckit-tasks` MUST put each domain test task before its implementation task. |
| V | Traceable to brief; v1 scope; justified complexity | PASS | PASS | Every endpoint maps to an FR (see contracts). Only the `watering` category is seeded. There is no assignment, rotation, or instant-alert code. Each added dependency or layer is justified in Complexity Tracking below. |
| PC | Product & Data Constraints (multi-member, weekly dashboard, single category per activity, phone-usable, data minimization, UTC) | PASS | PASS | Covered by FR mapping in data model and contracts. Household-scoped authorization is enforced in one request hook. |
| WF | Workflow (spec consistent with brief; plan has Constitution Check) | PASS | PASS | The spec was derived from `initial-spec.md`. This section is the check. |

**Result**: All gates pass. There are no unjustified violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-plant-care-tracker/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── openapi.yaml             # REST API contract
│   └── realtime-and-push.md     # SSE stream events + Web Push payload contract
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
package.json                     # npm workspaces: backend, frontend
docker-compose.yml               # local PostgreSQL 17

backend/
├── src/
│   ├── domain/                  # PURE logic, no I/O (Principles III & IV)
│   │   ├── calendar.ts          # local-date helpers per household time zone
│   │   ├── due-status.ts        # next due date + Overdue/Due today/Upcoming
│   │   ├── duplicates.ts        # duplicate window + race classification
│   │   ├── week.ts              # Monday–Sunday week bounds + projected due dates
│   │   └── daily-summary.ts     # who gets a summary, what it contains
│   ├── db/
│   │   ├── schema.ts            # Drizzle schema (mirrors data-model.md)
│   │   └── migrations/          # incl. no-delete trigger on care_events
│   ├── modules/                 # HTTP routes + persistence per area
│   │   ├── auth/                # magic-link sign-in, sessions
│   │   ├── households/          # household, members, invitations
│   │   ├── plants/              # plants + schedules
│   │   ├── care-events/         # log, edit, void, restore, revisions
│   │   ├── dashboard/           # weekly view assembly
│   │   └── notifications/       # preferences, push subscriptions
│   ├── realtime/                # in-process event bus + SSE endpoint
│   ├── jobs/
│   │   └── daily-summary.ts     # per-minute idempotent dispatcher
│   ├── app.ts                   # Fastify app factory (used by tests)
│   └── server.ts                # process entry: app + scheduler
└── tests/
    ├── unit/domain/             # test-first domain tests (Vitest + fast-check)
    ├── contract/                # one file per contract area, against openapi.yaml
    └── integration/             # real PostgreSQL: concurrency, audit, scheduler

frontend/
├── src/
│   ├── api/                     # typed client generated from contracts/openapi.yaml
│   ├── pages/                   # SignIn, Join, Dashboard, Plants, PlantDetail,
│   │                            # PlantForm, Household, Settings
│   ├── components/              # PlantCareItem, StatusBadge, CategoryLabel,
│   │                            # DuplicateWarningDialog, WeekNav, MemberFilter
│   ├── realtime/                # SSE subscription → query invalidation
│   ├── sw/                      # service worker: push display + notification click
│   └── main.tsx
└── tests/
    ├── unit/                    # component tests (Vitest + Testing Library)
    └── e2e/                     # Playwright: two-member household scenarios
```

**Structure Decision**: The project is a web application with two npm workspaces,
`backend/` and `frontend/`.

- Domain rules live only in `backend/src/domain/`. The frontend renders server-computed
  statuses and never recalculates them, so every member sees the same status (FR-019).
- The frontend's API types are generated from `contracts/openapi.yaml`. This keeps the
  contract as the single interface definition, without a third shared package.

## Complexity Tracking

> Principle V requires a justification for every added dependency, service, or
> abstraction layer. There are no constitution violations; this table records those
> justifications.

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| Two projects (frontend + backend) | Notifications while the app is closed (FR-031) and shared, consistent state (FR-014, FR-019) need a server. Phone usability needs a client UI. | A server-rendered-only app cannot receive push notifications or show live updates without client code. A third shared package is unnecessary because types come from the OpenAPI contract. |
| PostgreSQL | Needs transactional row locks for the concurrent-logging rule (FR-022) and a trigger that blocks deletes (Principle I). It also supports multiple households. | SQLite has no `SELECT … FOR UPDATE` and is awkward for multi-process deployment. A document store makes transactional audit trails harder. |
| Drizzle ORM | Typed schema and migrations in one place, with SQL kept close to the metal. | Raw SQL migrations plus hand-written types would drift from the schema. Heavier ORMs (Prisma) add a separate engine and codegen step. |
| Zod | Validates every request body against the contract (e.g., interval 1–60, no future `performedAt`). | Hand-written validation is error-prone and untested. Fastify JSON-schema alone gives weaker TypeScript inference. |
| Luxon | IANA time-zone and DST-correct calendar math (Principle III). | Native `Date` has no zone arithmetic. `Temporal` is not available unflagged in all target runtimes yet (R-3). |
| `web-push` + service worker | The standard, vendor-neutral way to reach a closed app on the web (FR-031). | A native mobile app would mean multiple codebases. Email digests were not the chosen option (spec Q3: B is a device notification). Third-party push SaaS adds a vendor and more personal data. |
| Server-Sent Events + in-process event bus | Pushes changes to other members within 5 seconds (SC-002) over plain HTTP. | Polling every few seconds wastes battery and server load. WebSockets are bidirectional, which isn't needed. A message broker isn't needed for a single instance (R-6). |
| TanStack Query | Caching, refetch on SSE invalidation, and explicit error states for failed saves (FR-015). | Hand-rolled fetch state would duplicate the same logic and makes unreported failures more likely. |
| `vite-plugin-pwa` | Generates the manifest and service worker needed for installability and iOS Web Push. | Hand-written service worker build config is fragile. |
