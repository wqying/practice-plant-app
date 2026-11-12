# Quickstart & Validation Guide: PlantsVSHumans — Shared Plant Care Tracker

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) |
**Contracts**: [contracts/openapi.yaml](./contracts/openapi.yaml),
[contracts/realtime-and-push.md](./contracts/realtime-and-push.md) |
**Data model**: [data-model.md](./data-model.md)

This guide shows how to run the app locally and prove that the feature works end to end.
It is a validation guide, not an implementation guide. The code layout is in
[plan.md](./plan.md#project-structure).

## 1. Prerequisites

- Node.js 24 LTS and npm 10+
- Docker (for local PostgreSQL 17 and Testcontainers)
- A Chromium-based browser for Web Push testing (Playwright installs its own)
- Generate a VAPID key pair once with `npx web-push generate-vapid-keys`

## 2. Setup and run

```bash
npm install                       # installs both workspaces
docker compose up -d db           # PostgreSQL 17 on localhost:5432
cp backend/.env.example backend/.env
#   set DATABASE_URL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
#   APP_ORIGIN=http://localhost:5173, MAIL_TRANSPORT=console (magic links print to the log)
npm run db:migrate -w backend     # creates schema, triggers, seeds the 'watering' category
npm run dev                       # API on :3000, PWA on :5173 (proxying /api)
```

**Expected**:

- `GET http://localhost:3000/api/v1/push/vapid-public-key` returns `200` with a
  `publicKey`.
- Opening `http://localhost:5173` shows the sign-in screen.

## 3. Domain test suite (Principle IV gate)

```bash
npm run test:domain -w backend
```

**Expected**: all pass. The suite MUST include at least these cases, and they MUST exist
and fail before the domain code is written.

### Due status (`computeDueStatus`)

| Case | Expected |
|---|---|
| Interval 7, last watered 7 days ago | Due today |
| Interval 3, last watered 5 days ago | Overdue by 2 days |
| Interval 5, last watered 1 day ago | Upcoming, due in 4 days |
| No history and no last-watered date | Due today on the creation date |
| No history, last watered entered | Due on the last-watered date + interval |
| Overdue for many intervals (interval 2, last watered 14 days ago) | Overdue by 12 days, shown once (not repeated) |
| Interval changed from 7 to 3 | Due date recomputed from the latest event |
| Backdated event older than the latest event | Due date unchanged (fast-check property) |
| Voided latest event | Falls back to the previous event |
| DST forward and back dates in `America/New_York`, `Europe/London`, `Australia/Sydney` | Same due date as non-DST math |
| An event logged at 23:30 local time vs 00:30 UTC on the next day | Counted on the household's local date |

### Duplicates (`classifyDuplicate`)

| Case | Expected |
|---|---|
| Window for interval 1 | 12 hours |
| Window for interval 7 | 3.5 days |
| Known event inside the window, not confirmed | Warn |
| Confirmed | Saved as intentional extra |
| Unknown newer event inside the window (race) | Saved as possible duplicate |
| Event outside the window | Saved normally |

### Week and summary

| Case | Expected |
|---|---|
| Week bounds | A Sunday maps to the preceding Monday through that Sunday |
| Projected due dates | Repeat every interval inside the requested range |
| `summaryDue` | False when a dispatch already exists for today, and false before the delivery time |
| `buildSummary` | Overdue items first; empty when nothing is due |

## 4. Contract and integration tests

```bash
npm run test:contract -w backend      # every openapi.yaml operation, validated against the schema
npm run test:integration -w backend   # real PostgreSQL via Testcontainers
```

The integration suite is expected to show the following.

| # | Scenario | Expected outcome | Traces to |
|---|---|---|---|
| I-1 | Two members `POST /plants/{id}/care-events` concurrently, both with the same stale `knownLatestEventId` | Both return 201. Exactly one event has `isPossibleDuplicate=true`, and the event count is 2 | FR-022, Story 3 #4 |
| I-2 | `POST` with `knownLatestEventId` = an event 3 hours old (interval 2), no confirm | 409 `duplicate_warning` that names the earlier performer. The event count is unchanged | FR-020, FR-021 |
| I-3 | Same request with `confirmDuplicate=true` | 201, `isIntentionalExtra=true` | FR-021 |
| I-4 | The same `clientRequestId` sent twice | First 201, second 200 with the same event id. One row | FR-015 retries |
| I-5 | `DELETE FROM care_events` executed directly in SQL | Raises an error | Principle I |
| I-6 | `PATCH` then `void` then `restore` an event | 3 revision rows with correct before/after values. The event's `revision` = 4 | FR-013 |
| I-7 | `PATCH` with a stale `expectedRevision` | 409 `revision_conflict`. Nothing changes | Principle I |
| I-8 | `POST` with `performedAt` in the future | 422 | FR-012 |
| I-9 | Member of household A requests a plant in household B | 404 | FR-035 |
| I-10 | Daily-summary tick run 3 times at 08:00 and 08:01 for one opted-in member with 2 due plants | One push sent, one `sent` dispatch row | FR-031 |
| I-11 | Same, but the plant was watered at 07:55 | That plant is not in the payload. If nothing remains, the dispatch is `skipped_empty` and no push is sent | FR-033 |
| I-12 | Push service returns 410 | The subscription is deleted | R-7 |

## 5. End-to-end validation (two members)

```bash
npm run test:e2e -w frontend          # Playwright, two browser contexts
```

Each scenario can also be run manually with two browser profiles (A and B). Magic links
appear in the API console log (`MAIL_TRANSPORT=console`).

| # | Steps | Expected | Traces to |
|---|---|---|---|
| E-1 | A signs in, creates household "Flat 4" (Europe/London), copies the invite link. B opens it, signs in, and joins | B sees "Flat 4" with A and B as members within 3 minutes of opening the link | FR-001, FR-002, SC-003 |
| E-2 | A adds "Monstera" with a 7-day interval and no last-watered date | Both see Monstera "Due today" | Story 2 #4 |
| E-3 | A taps **Water** on Monstera on the dashboard | Saved in 1 tap. B's dashboard shows "Done · A · just now" within 5 seconds without a refresh. Monstera shows "Upcoming — due in 7 days" | Story 1 #1–2, FR-009, SC-001, SC-002 |
| E-4 | B taps **Water** on Monstera | A warning dialog says "A watered Monstera … log anyway?". Cancel saves nothing. Confirm saves it, marked as an extra | Story 3 #1–3 |
| E-5 | A logs "Fern" with a backdate of yesterday 18:00 | History shows a "Backdated" marker | Story 1 #3 |
| E-6 | A undoes the Fern event | Fern's status reverts. History shows the event as undone, with the revision by A | Story 1 #4 |
| E-7 | Open the dashboard at a 360 px width | Week grouped Mon–Sun, overdue items listed first, each item with a text status label and the Watering icon and label. No horizontal scrolling | Story 4 #1, #2, #4 |
| E-8 | Navigate to the next week and then the previous week | The next week shows projected due items. The previous week shows completed items only | Story 4 #3 |
| E-9 | Filter the dashboard by member B | Only B's completed items show. Due items stay visible | FR-029, FR-030 |
| E-10 | A enables the daily summary for a time 2 minutes ahead and grants notification permission, then closes the app | One notification arrives, listing the overdue and due-today plants. Clicking it opens `/dashboard` | Story 2 #6, FR-031–FR-034 |
| E-11 | Take the browser offline and tap **Water** | A clear "Not saved — you're offline" error appears. No success state | FR-015 |
| E-12 | B removes A from the household | A loses access. A's past events still show "A" in history | FR-004 |

## 6. Done criteria for this feature

- Sections 3–5 all pass in CI.
- The Constitution Check in [plan.md](./plan.md) is still PASS. Re-run the check if the
  design changes during implementation.
- Pilot metrics SC-004 to SC-010 are measured after release and are not part of this
  checklist. They need instrumentation of these counts:
  - backdated events
  - possible duplicates and intentional extras
  - plants overdue at the end of each day
  - daily-summary dispatch latency
