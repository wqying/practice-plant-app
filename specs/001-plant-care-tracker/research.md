# Phase 0 Research: PlantsVSHumans — Shared Plant Care Tracker

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-12

The Technical Context had no unresolved `NEEDS CLARIFICATION` items after the spec's Q1–Q3
were answered (watering only, shared pool, daily summary). This document records each
technology and design decision as Decision / Rationale / Alternatives.

---

## R-1: Application form factor

- **Decision**: An installable, mobile-first Progressive Web App backed by an HTTP API.
- **Rationale**:
  - One codebase covers phones and desktops (FR-037, brief assumption #1).
  - Web Push reaches closed apps on Android, desktop, and iOS 16.4+ home-screen web apps
    (FR-031).
  - There is no app-store gate for a household utility.
- **Alternatives considered**:
  - Native iOS + Android apps: two codebases, which is too much for v1 scope
    (Principle V).
  - Cross-platform native (React Native or Flutter): better push reach on iOS without
    installing to the home screen, but it adds store distribution and a mobile build
    toolchain. Revisit only if pilot data shows iOS install friction hurting SC-009.

## R-2: Language and runtime

- **Decision**: TypeScript end to end, on Node.js 24 LTS for the API.
- **Rationale**:
  - One language across client and server.
  - Request and response types are generated from the OpenAPI contract.
  - The team needs only one toolchain.
- **Alternatives considered**: Python/FastAPI or Go backends. Both are viable, but they add
  a second language with no benefit at this scale.

## R-3: Deterministic, DST-safe due-date math (Principle III)

- **Decision**: Compute due status on **local calendar dates** in the household's IANA time
  zone, never on raw 24-hour multiples:
  - `lastCareDate = localDate(latestEvent.performedAt, household.tz)`
  - `dueDate = lastCareDate + intervalDays` (calendar days)
  - `today = localDate(now, household.tz)`
  - Status:
    - **Overdue** if `dueDate < today` (`daysOverdue = today − dueDate`)
    - **Due today** if `dueDate = today`
    - **Upcoming** if `dueDate > today` (`daysUntilDue = dueDate − today`)
  - "Latest event" means the non-voided event with the greatest `performedAt`. A backdated
    event older than the latest one therefore cannot move the due date backward.
  - With no events, the plant is due on `initialLastWateredOn + intervalDays` if that date
    was given, otherwise on `createdOn` (due today on creation).
  - The calculation lives in a pure function `computeDueStatus(input, today)`. Time zone
    conversion happens once, at the edges.
  - Implemented with Luxon `DateTime.setZone(tz).toISODate()`.
- **Rationale**:
  - Watering is a daily-granularity chore.
  - Calendar-day math means a 23- or 25-hour DST day cannot shift a due date.
  - The result is a pure function of (dates, interval), which makes property-based tests
    straightforward.
- **Alternatives considered**:
  - Instant-based `performedAt + interval × 24h`: breaks across DST, and makes
    "due today" depend on time of day.
  - Native `Temporal`: the ideal API, but not unflagged in every target runtime yet.
    Luxon can be swapped for `Temporal` later behind `calendar.ts`.

## R-4: Duplicate detection and concurrent logging (Principle I, FR-020–FR-022)

- **Decision**: A two-stage check, both run server-side inside one transaction that holds a
  `SELECT … FOR UPDATE` lock on the plant's `care_schedules` row:
  1. **Window**: `duplicateWindow = max(12h, intervalDays × 24h / 2)`. An existing
     non-voided event of the same category whose `performedAt` is within the window of
     the new event's `performedAt` is a duplicate candidate.
  2. **Classification** uses `knownLatestEventId`, the latest event the client was showing
     when the member tapped:
     - **Candidate already known to the client** and `confirmDuplicate` is not true:
       respond **409 `duplicate_warning`** with who and when. Nothing is saved.
     - **Candidate unknown to the client**: this is a true race, because another member
       logged in the meantime. **Save** the event with `is_possible_duplicate = true` and
       `duplicate_of_event_id` set. Never reject or lose it.
     - **`confirmDuplicate = true`**: save with `is_intentional_extra = true`.
  - Double-tap and retry safety: a client-generated `clientRequestId` has a unique
    constraint per member. A replayed request returns the original 201 without creating a
    second event.
- **Rationale**:
  - The warning happens before saving, so cancel saves nothing (FR-021).
  - Racing submissions are both kept and flagged (FR-022, constitution "MUST NOT lose
    either write").
  - The row lock makes the check-then-insert atomic without needing serializable
    isolation for the whole database.
- **Alternatives considered**:
  - Client-side-only warning: not authoritative, and misses races.
  - Unique constraint per plant and day: would reject legitimate intentional extra
    watering, and drops writes.
  - Serializable isolation with retries: correct but heavier. A per-plant lock is enough
    because contention is limited to a single plant.

## R-5: Append-only care history with audit (FR-013, Principle I)

- **Decision**:
  - `care_events` rows are never deleted. A database trigger raises an error on `DELETE`.
  - Edits (`performedAt`, `note`), voids (undo), and restores update the event's current
    state **and** insert a `care_event_revisions` row with `before`/`after` JSON, the
    acting member, and a timestamp, in the same transaction.
  - Voided events are excluded from status calculation but still shown in history.
- **Rationale**:
  - Current-state reads (for due status) stay simple and indexed.
  - The full audit trail stays viewable, and nothing is silently overwritten.
- **Alternatives considered**:
  - Pure event sourcing (immutable events + projections): overkill for one aggregate and
    adds projection rebuild complexity (Principle V).
  - Soft-delete without revisions: loses who changed what.

## R-6: Real-time propagation (FR-014, SC-002)

- **Decision**:
  - Use Server-Sent Events at `GET /api/v1/households/current/stream`.
  - After each committed write, the API publishes a small domain event (e.g.,
    `care_event.created`) to an in-process event bus keyed by household. SSE connections
    for that household receive it.
  - The client invalidates the affected TanStack Query caches and refetches
    server-computed data.
  - The server sends a heartbeat every 25 seconds. On reconnect, the client refetches the
    dashboard.
- **Rationale**:
  - One-directional server→client updates are all that's needed.
  - SSE works over plain HTTP/2, reconnects automatically, and is simple to test.
  - Refetching (instead of patching client state) keeps status computation server-only
    (FR-019).
- **Scale note**: A single API instance is sufficient for the pilot (about 1,000 households,
  well under 10k concurrent connections).
  - If horizontal scaling becomes necessary, swap the in-process bus for PostgreSQL
    `LISTEN/NOTIFY` behind the same `EventBus` interface. No contract change is needed.
- **Alternatives considered**:
  - WebSockets: bidirectional, which isn't needed, and adds more infrastructure.
  - Short polling: misses the 5-second target, or burns battery.
  - Hosted realtime services: an extra vendor, and more data shared externally.

## R-7: Daily summary delivery (FR-031–FR-034, SC-009)

- **Decision**: Use **Web Push (VAPID)** via the `web-push` library, driven by an
  **in-process scheduler that ticks every minute**:
  1. For each enabled `notification_preferences` row, compute the member's local now in
     the household time zone.
  2. If `localNow.time ≥ deliveryTime` and no `daily_summary_dispatches` row exists for
     (member, localDate):
     - Compute current statuses with the same domain functions as the dashboard.
     - If anything is Due today or Overdue, send one push to each of the member's
       subscriptions, then record `status = sent`.
     - Otherwise record `status = skipped_empty` (FR-033).
  3. Recording the dispatch uses `INSERT … ON CONFLICT DO NOTHING` on
     `(membership_id, local_date)`. This makes every tick idempotent and safe across
     restarts.
  - Subscriptions that return 404/410 from the push service are deleted.
  - The push payload carries a deep link to `/dashboard`, and the service worker opens it
    on click (FR-034).
- **Rationale**:
  - Content is computed at send time, so a plant watered before 08:00 is not listed
    (FR-033).
  - The per-minute tick plus catch-up (`≥` instead of `=`) meets the 5-minute target even
    after a brief restart.
- **Alternatives considered**:
  - External cron or queue (e.g., a separate worker plus a job queue): an extra moving
    part that isn't needed at pilot scale.
  - Firebase Cloud Messaging directly: vendor lock-in, and the standard Web Push
    protocol already covers browsers.
  - Email digest: not the option chosen in Q3.

## R-8: Authentication and data minimization (FR-035, FR-036)

- **Decision**:
  - **Passwordless email magic links**: a single-use token, valid for 15 minutes and
    stored only as a hash.
  - A successful sign-in creates an opaque session (30 days, rolling), sent as an
    `HttpOnly; Secure; SameSite=Lax` cookie.
  - The only personal data stored is email and display name.
  - Every household-scoped route resolves the caller's active membership in one request
    hook and scopes all queries by `household_id`.
- **Rationale**:
  - No passwords to store or reset, and the least personal data possible.
  - Works for every member on any device (brief assumption #1).
  - A new member can join and log within 3 minutes (SC-003) using an invite link plus an
    emailed sign-in link.
- **Alternatives considered**:
  - Email and password: adds password storage and recovery flows.
  - Social OAuth only: shares data with third parties and excludes people without those
    accounts. It could be added later as an extra sign-in option.

## R-9: Household invitations (FR-002)

- **Decision**:
  - Any member can generate a shareable invite link with a random 128-bit token (stored
    hashed) that expires after 7 days. It is multi-use until it expires or is revoked.
  - Accepting requires sign-in. A user who already belongs to a household is blocked,
    because v1 supports one household per user.
- **Rationale**:
  - Roommates typically share links in group chats.
  - Multi-use avoids generating a link per person.
  - Expiry limits exposure if a link leaks.
- **Alternatives considered**:
  - Per-email invitations: more friction, and requires collecting roommates' emails up
    front.
  - Join codes: similar, but less convenient than a tappable link.

## R-10: Weekly dashboard assembly (FR-023–FR-026, FR-029)

- **Decision**: `GET /dashboard?weekStart=YYYY-MM-DD` returns server-computed data for the
  Monday–Sunday week in the household time zone:
  - **`overdue[]`**: listed first (FR-024). Shown only when the requested week contains
    today.
  - **`days[]`**: seven days. Each holds `completed` items (non-voided events performed
    that day) and `due` items:
    - today: Due today
    - future days: Upcoming. Projected due dates continue every `intervalDays` from the
      next due date, assuming on-time care (FR-026).
    - past days: only completed events (history).
  - An optional `memberId` filter applies to completed items. Due items are shared-pool
    items and stay visible (FR-029, FR-030).
  - Each item carries `category { code, label, icon }` and a `status` label so the client
    never relies on color alone (FR-027).
- **Rationale**: One request renders the whole screen, which meets the 2-second first
  meaningful render target. All logic stays server-side.
- **Alternatives considered**: Client-side assembly from raw plants and events. It
  duplicates domain logic on the client and risks status disagreement (FR-019).

## R-11: Testing strategy (Principle IV)

- **Decision**:
  - **Domain unit tests (written first)**:
    - Vitest example tables for every acceptance scenario in Story 2 and Story 3.
    - fast-check properties:
      - Status is a pure function of its inputs.
      - Backdating older than the latest event never changes `dueDate`.
      - `daysOverdue + intervalDays = days since last care`.
      - DST transition dates for `America/New_York`, `Europe/London`, and
        `Australia/Sydney` give the same due date as non-DST dates.
  - **Contract tests**: each `openapi.yaml` operation is exercised through
    `fastify.inject`, and responses are validated against the schema.
  - **Integration tests** on real PostgreSQL via Testcontainers:
    - Two concurrent `POST care-events` → both saved, the later one flagged.
    - The delete trigger blocks deletes.
    - Revisions are written atomically.
    - Daily-summary idempotency across repeated ticks.
  - **E2E (Playwright)**: two browser contexts as two members of the same household cover
    log → live update, duplicate warning, and the week dashboard.
- **Rationale**: The constitution's mandated boundaries (interval edges, timezone/DST,
  concurrency, no-history) each map to a concrete test layer.
- **Alternatives considered**: E2E-only testing is too slow and too coarse to pin down
  calendar edge cases.

## R-12: Accessibility and categorization display (FR-027, FR-037)

- **Decision**:
  - Every status and category is rendered as icon + text label, with color only as
    reinforcement.
  - The layout targets a 360 px minimum width.
  - The "Water" action is a large tap target (at least 44×44 px) on each dashboard item.
  - Aim for WCAG 2.2 AA contrast.
- **Rationale**: Meets the constitution's "without relying on color alone" rule and the
  logging-next-to-the-plant use case.
- **Alternatives considered**: Color-coded tiles only, which conflicts with FR-027.
