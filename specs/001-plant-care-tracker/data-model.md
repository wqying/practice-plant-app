# Phase 1 Data Model: PlantsVSHumans — Shared Plant Care Tracker

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

## Conventions

- **IDs**: UUID v7 (time-ordered).
- **Timestamps**: `timestamptz`, stored in UTC. Local dates use `date` and are computed in
  the household time zone.
- No row in `care_events` or `care_event_revisions` is ever deleted. Rows in other tables
  are soft-ended (`left_at`, `archived_at`, `revoked_at`) unless noted.
- **Derived, never stored**: next due date, status (Overdue / Due today / Upcoming), days
  overdue or until due, and the weekly dashboard (Principle III).

## Entity Relationship Overview

```text
User 1───0..1 Membership(active) *───1 Household
                     │                    │
                     │ 1                  │ 1
                     ├──0..1 NotificationPreference
                     ├──* PushSubscription
                     ├──* DailySummaryDispatch
                     │                    │ *
                     │                  Plant 1───* CareSchedule *───1 CareCategory
                     │                    │ 1
                     └──* CareEvent *─────┘          (CareEvent *───1 CareCategory)
                              │ 1
                              └──* CareEventRevision
Household 1───* Invitation
User 1───* Session ; LoginToken (by email)
```

## Entities

### User

The person's account. It holds the only personal data stored (FR-036).

| Field | Type | Rules |
|---|---|---|
| id | uuid | PK |
| email | citext | required, unique, valid email |
| display_name | varchar(40) | required, 1–40 chars after trim |
| created_at | timestamptz | default now() |

### Household (Key Entity: Household)

| Field | Type | Rules |
|---|---|---|
| id | uuid | PK |
| name | varchar(60) | required, 1–60 chars |
| time_zone | varchar(64) | required, valid IANA zone (e.g., `Europe/London`) (FR-005) |
| week_start | smallint | fixed `1` (Monday) in v1 (FR-023) |
| created_at | timestamptz | default now() |

### Membership (Key Entity: Member)

Links a User to a Household.

| Field | Type | Rules |
|---|---|---|
| id | uuid | PK, the `memberId` used throughout the API |
| household_id | uuid | FK → Household, required |
| user_id | uuid | FK → User, required |
| joined_at | timestamptz | default now() |
| left_at | timestamptz | null while active |
| ended_by_membership_id | uuid | null if they left themselves, else the remover (FR-004) |

- **Constraint**: partial unique index on `user_id WHERE left_at IS NULL`, so a user has at
  most one active household (spec assumption).
- **Authorization**: every household-scoped request requires an active membership in that
  household (FR-035). All members have equal permissions (FR-003).
- **State**: `active → departed` (left or removed). Rejoining creates a new Membership row.
  Departed memberships keep their events, which still show the user's display name.

### Invitation

| Field | Type | Rules |
|---|---|---|
| id | uuid | PK |
| household_id | uuid | FK → Household |
| token_hash | bytea | SHA-256 of a random 128-bit token, unique |
| created_by_membership_id | uuid | FK → Membership |
| expires_at | timestamptz | created_at + 7 days |
| revoked_at | timestamptz | nullable |
| created_at | timestamptz | default now() |

- **States**: `valid` (not expired, not revoked) → `expired` | `revoked`. The invitation can
  be used many times while valid. Each acceptance creates a Membership.

### Plant (Key Entity: Plant)

| Field | Type | Rules |
|---|---|---|
| id | uuid | PK |
| household_id | uuid | FK → Household |
| name | varchar(60) | required, 1–60 chars (FR-006) |
| location | varchar(60) | optional |
| created_on | date | household-local date of creation (used as the due date when there is no history) |
| created_by_membership_id | uuid | FK → Membership |
| archived_at | timestamptz | null = active (FR-008) |
| created_at | timestamptz | default now() |

- **States**: `active ⇄ archived`. Archived plants are excluded from due status, the
  dashboard's due and overdue lists, and daily summaries. Their history stays readable.

### CareCategory (Key Entity: Care Category)

Reference data that is seeded, not user-editable, in v1.

| Field | Type | Rules |
|---|---|---|
| code | varchar(32) | PK. v1 seed: `watering` (FR-028) |
| label | varchar(40) | e.g., "Watering" |
| icon | varchar(40) | icon identifier, e.g., `droplet` (FR-027) |

### CareSchedule (Key Entity: Care Schedule)

| Field | Type | Rules |
|---|---|---|
| id | uuid | PK |
| plant_id | uuid | FK → Plant |
| category_code | varchar(32) | FK → CareCategory |
| interval_days | smallint | required, 1–60 (FR-006) |
| initial_last_cared_on | date | optional household-local date from "last watered" at creation (FR-007). Must not be after `created_on`. |
| updated_at | timestamptz | |

- **Constraint**: unique `(plant_id, category_code)`. In v1, every plant has exactly one
  schedule (`watering`).
- **Lock target**: the care-event write path selects this row `FOR UPDATE` (research R-4).
- **Derived values** (domain `computeDueStatus`; see research R-3):
  - `lastCareDate` = local date of the latest non-voided event's `performed_at`, if one
    exists.
  - `dueDate` = `lastCareDate + interval_days`; otherwise
    `initial_last_cared_on + interval_days`; otherwise `created_on`.
  - `status`, `daysOverdue`, `daysUntilDue` are computed relative to `today` in the
    household time zone.
  - `duplicateWindow` = `max(12h, interval_days × 12h)`.
  - When the interval changes, all of these values change immediately (edge case
    "Interval changes").

### CareEvent (Key Entity: Care Event)

| Field | Type | Rules |
|---|---|---|
| id | uuid | PK |
| household_id | uuid | FK → Household (denormalized for scoped queries) |
| plant_id | uuid | FK → Plant |
| category_code | varchar(32) | FK → CareCategory, must match one of the plant's schedules (FR-027) |
| performed_by_membership_id | uuid | FK → Membership. **Set from the session, never from the client** (FR-010, FR-030) |
| performed_at | timestamptz | defaults to `recorded_at`. Must be ≤ `recorded_at` (no future, FR-012) |
| recorded_at | timestamptz | server clock, default now(). Immutable (FR-010) |
| is_backdated | boolean | true iff the client explicitly supplied `performedAt` (FR-012) |
| is_intentional_extra | boolean | true iff saved via `confirmDuplicate=true` (FR-021) |
| is_possible_duplicate | boolean | true iff saved as a race within the duplicate window (FR-022) |
| duplicate_of_event_id | uuid | FK → CareEvent. Set when either flag above is true |
| note | varchar(280) | optional (FR-011) |
| client_request_id | uuid | required. Unique `(performed_by_membership_id, client_request_id)` for idempotent retries |
| voided_at | timestamptz | null = in effect. Set by undo |
| voided_by_membership_id | uuid | nullable |
| revision | integer | starts at 1, incremented on each change (optimistic concurrency for edits) |

- **Indexes**: `(plant_id, category_code, performed_at DESC) WHERE voided_at IS NULL` for
  the latest-event lookup; `(household_id, performed_at)` for week queries.
- **Trigger**: `BEFORE DELETE` raises an exception (Principle I). `recorded_at`,
  `performed_by_membership_id`, `plant_id`, and `category_code` are immutable after insert
  (also enforced by a trigger).
- **States**: `in_effect ⇄ voided` (undo / restore). Only `in_effect` events count toward
  due status, duplicate windows, and completed dashboard items. Voided events appear in
  history, marked as undone.
- **Edits**: only `performed_at` (still ≤ `recorded_at`) and `note` may change. Editing
  `performed_at` sets `is_backdated = true`. The client sends `expectedRevision`, and a
  mismatch returns 409 `revision_conflict`. The request is rejected, never overwritten.

### CareEventRevision (Key Entity: Event Revision)

| Field | Type | Rules |
|---|---|---|
| id | uuid | PK |
| care_event_id | uuid | FK → CareEvent |
| revision | integer | the event's revision number *after* this change. Unique `(care_event_id, revision)` |
| action | enum | `edit` \| `void` \| `restore` |
| changed_by_membership_id | uuid | FK → Membership |
| changed_at | timestamptz | default now() |
| before | jsonb | the changed fields' prior values |
| after | jsonb | the changed fields' new values |

- Written in the **same transaction** as the CareEvent update (FR-013). The table is
  insert-only and a trigger blocks `UPDATE` and `DELETE`.

### NotificationPreference (Key Entity: Notification Preference)

| Field | Type | Rules |
|---|---|---|
| membership_id | uuid | PK, FK → Membership |
| daily_summary_enabled | boolean | default false (opt-in, FR-031) |
| delivery_time | time | default `08:00`, interpreted in the household time zone (FR-032). Minute precision |
| updated_at | timestamptz | |

### PushSubscription

| Field | Type | Rules |
|---|---|---|
| id | uuid | PK |
| membership_id | uuid | FK → Membership |
| endpoint | text | unique, https URL |
| p256dh | text | required |
| auth | text | required |
| created_at | timestamptz | |
| last_success_at | timestamptz | nullable |

- Deleted when the push service answers 404/410, when the member leaves, or when the
  member unsubscribes. It is not personal data beyond a device endpoint.

### DailySummaryDispatch

| Field | Type | Rules |
|---|---|---|
| id | uuid | PK |
| membership_id | uuid | FK → Membership |
| local_date | date | household-local date the summary is for |
| status | enum | `sent` \| `skipped_empty` \| `failed` |
| item_count | smallint | number of due-today and overdue plants included |
| dispatched_at | timestamptz | |

- **Constraint**: unique `(membership_id, local_date)`. This guarantees at most one summary
  per member per day (FR-031) and makes the scheduler idempotent (research R-7).

### Session and LoginToken (auth support)

| Entity | Fields | Rules |
|---|---|---|
| LoginToken | id, email, token_hash (unique), expires_at (+15 min), used_at | Single use |
| Session | id, user_id, token_hash (unique), expires_at (+30 days, rolling), created_at | Cookie holds the raw token. The database stores only its hash |

## Validation Rules → Requirement Map

| Rule | Requirement |
|---|---|
| `interval_days` ∈ [1, 60] | FR-006 |
| `performed_at ≤ recorded_at`. When editing, `performed_at ≤` the original `recorded_at` | FR-012, edge case "future" |
| `initial_last_cared_on ≤ created_on` | FR-007 |
| `category_code = 'watering'` only (seed) | FR-028 |
| One active membership per user | Assumption "one household" |
| `note` ≤ 280 chars, display name ≤ 40, names ≤ 60 | FR-011, input hygiene |
| No DELETE on care events or revisions | FR-013, Principle I |
| Duplicate window `max(12h, interval × 12h)` | FR-020 |
| Unique `(membership_id, local_date)` dispatch | FR-031, FR-033 |

## Domain Functions (pure, in `backend/src/domain`)

These are the inputs and outputs that the tests in [quickstart.md](./quickstart.md) §3
target. Implementation details are left to tasks.

| Function | Input | Output |
|---|---|---|
| `computeDueStatus` | intervalDays, latestEventLocalDate?, initialLastCaredOn?, createdOn, today | `{ dueDate, status, daysOverdue?, daysUntilDue?, basis }` |
| `classifyDuplicate` | candidate events in window, knownLatestEventId?, confirmDuplicate | `save_normal` \| `warn` \| `save_intentional_extra` \| `save_possible_duplicate` |
| `duplicateWindow` | intervalDays | duration |
| `weekBounds` | anyDate, tz | `{ weekStart (Mon), weekEnd (Sun) }` |
| `projectDueDates` | dueDate, intervalDays, range | list of local dates |
| `summaryDue` | localNow, deliveryTime, existingDispatch? | boolean |
| `buildSummary` | statuses[] | `{ items (Overdue first, then Due today), isEmpty }` |
