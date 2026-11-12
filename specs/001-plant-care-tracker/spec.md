# Feature Specification: PlantsVSHumans — Shared Plant Care Tracker

**Feature Branch**: `001-plant-care-tracker`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "I have a loosely written spec file @initial-spec.md that doesn't adhere to
industry standards. Use this skill to improve it." Source brief: `initial-spec.md` (PlantsVSHumans).

## Overview

Roommates who look after the same plants struggle to know who has done what. Waterings get
missed or doubled up, and schedules fall apart because people don't record completed care
accurately. PlantsVSHumans gives a household one shared, trustworthy record of plant care.
It shows which plants are upcoming or overdue, warns before duplicate care, and gives a
clear weekly view of all care activities.

**Goals (from source brief)**:

- **G1 – Track watering activities**: record watering events; identify upcoming and overdue
  watering.
- **G2 – Avoid duplicate or missed care activities.**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Log a watering that the whole household can see (Priority: P1)

A household member waters a plant, opens the app, and marks that plant as watered. The app
records who watered it and when. Every other member immediately sees that the plant has
been watered and by whom.

**Why this priority**: This is the core value of the product (G1). Without a shared,
accurate record of watering, nothing else (schedules, duplicate prevention, dashboard) is
possible. Delivered alone, it already stops roommates from asking "did anyone water the
fern?".

**Independent Test**: Two members join the same household and one adds a plant. Member A
logs a watering. Member B sees the plant's last watering time and Member A's name without
re-entering anything.

**Acceptance Scenarios**:

1. **Given** a household with members A and B and a plant "Monstera", **When** A marks
   Monstera as watered, **Then** the event is saved with A as the performer and the
   current time, and B sees "Last watered by A, just now" for Monstera.
2. **Given** a member is on the dashboard, **When** they log a watering for a listed plant,
   **Then** they complete it in no more than two interactions and are never asked to type
   their name or the time.
3. **Given** a member forgot to log a watering yesterday, **When** they log it and choose
   an earlier date and time, **Then** the event is saved with that time and visibly marked
   as backdated.
4. **Given** a member logged a watering by mistake, **When** they undo or edit it, **Then**
   the correction is applied, the original entry stays in the plant's history as revised,
   and other members see the corrected state.
5. **Given** a member creates a household, **When** they invite a roommate, **Then** the
   roommate can join and see the household's plants and care history.

---

### User Story 2 - See which plants are upcoming, due, or overdue (Priority: P2)

A member opens the app to find out which plants need water today, which are overdue, and
which are coming up soon. The app works this out from each plant's watering interval and
its most recent recorded watering, so every roommate sees the same answer.

**Why this priority**: Knowing what is due is the second half of G1 and the main way to
prevent missed care (G2). It depends on Story 1's event record.

**Independent Test**: Create a plant with a 3-day interval and a last watering 4 days
ago. Confirm the plant shows as overdue by 1 day for every member. Log a watering and
confirm it changes to upcoming, due in 3 days.

**Acceptance Scenarios**:

1. **Given** a plant with a 7-day interval last watered 7 days ago, **When** any member
   views it, **Then** it shows as "Due today".
2. **Given** a plant with a 3-day interval last watered 5 days ago, **When** any member
   views it, **Then** it shows as "Overdue by 2 days" and the status traces to that
   watering and interval.
3. **Given** a plant with a 5-day interval last watered 1 day ago, **When** any member
   views it, **Then** it shows as "Upcoming — due in 4 days".
4. **Given** a newly added plant with no watering history, **When** the member adding it
   does not supply a last-watered date, **Then** the plant shows as "Due today".
5. **Given** members viewing at the same moment, **When** they compare a plant's status,
   **Then** all of them see the same status.
6. **Given** a member has the daily summary turned on for 08:00, two plants are due today
   and one is overdue, **When** 08:00 arrives, **Then** they receive one summary listing
   those three plants, even if the app is closed.
7. **Given** a member has the daily summary turned on, **When** nothing is due or overdue
   at the delivery time, **Then** no summary is sent.

---

### User Story 3 - Get warned before duplicating care (Priority: P3)

A member is about to log a watering for a plant that someone else watered a few hours
ago. Before saving, the app warns them, showing who watered it and when. The member can
cancel (and skip watering) or confirm that it is an intentional extra watering.

**Why this priority**: This directly addresses the duplicate-care half of G2. It builds on
Stories 1 and 2 but is a separate, testable safeguard.

**Independent Test**: Member A logs a watering for a plant. Member B immediately tries to
log a watering for the same plant and sees a warning naming A and the time. Cancelling
saves nothing. Confirming saves an event that is flagged as an intentional extra.

**Acceptance Scenarios**:

1. **Given** A watered "Fern" (2-day interval) 3 hours ago, **When** B attempts to log a
   watering for Fern, **Then** B sees "A watered Fern 3 hours ago — log anyway?" before
   anything is saved.
2. **Given** that warning, **When** B cancels, **Then** no event is recorded.
3. **Given** that warning, **When** B confirms, **Then** the event is recorded and marked
   as an intentional additional watering.
4. **Given** A and B both log a watering for the same plant within seconds of each other,
   **When** both submissions arrive, **Then** both events are preserved (neither is lost),
   and the later one is flagged as a possible duplicate for the household to review.

---

### User Story 4 - Weekly dashboard of all care activities (Priority: P4)

A member opens the dashboard and sees the current week at a glance: what was done, what
is due, and what is overdue. Activities are grouped by day and clearly categorized, and
overdue items are surfaced first.

**Why this priority**: This is the source brief's key functional requirement and makes
Stories 1–3 easy to use day to day. It is a presentation layer over capabilities that
already deliver value on their own.

**Independent Test**: Seed a household with several plants and a week of completed,
due, and overdue activities. Confirm the dashboard shows every activity for the week in
the correct day and category, with overdue items highlighted. Confirm each item shows
its plant, category, status, and (for completed items) the member who did it.

**Acceptance Scenarios**:

1. **Given** a household with completed, due, and overdue activities this week, **When**
   a member opens the dashboard, **Then** they see every activity for the current week
   grouped by day, with overdue items listed prominently at the top.
2. **Given** activities on the dashboard, **When** a member views them, **Then** each shows
   a text label and an icon for its category (Watering in v1) and a status label (Done,
   Due today, Overdue, Upcoming), so status can be read without relying on color.
3. **Given** the dashboard, **When** a member moves to the previous or next week, **Then**
   they see that week's completed activities (past) or projected due activities (future).
4. **Given** the dashboard on a phone-sized screen, **When** a member uses it, **Then**
   all information and the log action remain usable without horizontal scrolling.

---

### Edge Cases

- **No history**: A plant with no recorded watering is treated as due today, unless the
  member supplies a last-watered date when adding it.
- **Time zones and DST**: Due dates and "today" are calculated in the household's local
  time zone. Daylight-saving changes MUST NOT make a plant appear due a day early or late.
- **Concurrent logging**: Two members log the same plant at almost the same time. Both
  events are kept and the later one is flagged (Story 3, scenario 4).
- **Backdating into the future**: A member MUST NOT be able to log an event with a future
  time.
- **Backdating before a later event**: A backdated event older than the latest recorded
  event MUST NOT move the plant's due date backward. The due date is always based on the
  most recent event.
- **Interval changes**: When a plant's watering interval changes, its next due date is
  recalculated from the most recent watering and the new interval.
- **Archived plants**: An archived plant drops off upcoming and overdue lists, but its
  history stays viewable.
- **Departing members**: When a member leaves or is removed, their past events stay in
  history, attributed to their display name.
- **Long absence**: A plant overdue for many intervals shows the true overdue duration
  (e.g., "Overdue by 12 days"), not a reset or repeated item per missed interval.
- **Connectivity loss**: If a member tries to log while offline, they are told clearly
  that the event was not saved. A failed save MUST NOT look like a success.

## Requirements *(mandatory)*

### Functional Requirements

**Household & membership**

- **FR-001**: Users MUST be able to create a household and become its first member.
- **FR-002**: Members MUST be able to invite others to join their household. Invitees MUST
  be able to accept and join.
- **FR-003**: All members of a household MUST have equal permissions to manage plants and
  log, edit, or undo care events.
- **FR-004**: Members MUST be able to leave a household, and any member MUST be able to
  remove another member. Past events by departed members MUST remain in history.
- **FR-005**: Each household MUST have a single configured time zone, used for all
  "today", due-date, and weekly calculations.

**Plants & schedules**

- **FR-006**: Members MUST be able to add a plant with a name, an optional location
  (e.g., "Living room"), and a watering interval in whole days (1–60).
- **FR-007**: When adding a plant, members MUST be able to optionally enter when it was
  last watered.
- **FR-008**: Members MUST be able to edit a plant's name, location, and interval, and to
  archive or restore a plant.

**Care activity logging**

- **FR-009**: Members MUST be able to log a completed care activity for a plant in no more
  than two interactions from the dashboard.
- **FR-010**: The system MUST automatically record, for every care event, the member who
  logged it and the time it was recorded. Members MUST NOT have to enter either value.
- **FR-011**: Members MUST be able to attach an optional short note to a care event (e.g.,
  "added fertilizer to water").
- **FR-012**: Members MUST be able to backdate a care event to an earlier time (not in the
  future). Backdated events MUST be visibly marked as backdated.
- **FR-013**: Members MUST be able to undo or edit a care event. Care history MUST be
  append-only: corrections are recorded as revisions, and the original entry and who
  changed it MUST stay viewable.
- **FR-014**: A care event saved by one member MUST become visible to all other members of
  the household without any manual refresh or re-entry.
- **FR-015**: If a care event cannot be saved (e.g., no connectivity), the system MUST
  clearly tell the member it was not saved.

**Due status**

- **FR-016**: The system MUST calculate each active plant's next due date as the time of
  its most recent watering plus its watering interval. Status MUST NOT be set by hand.
- **FR-017**: The system MUST classify each active plant into exactly one status:
  **Overdue** (the due date was before today), **Due today**, or **Upcoming** (due on a
  later day). Overdue and upcoming statuses MUST show the number of days.
- **FR-018**: For any plant, members MUST be able to see the most recent event and the
  interval that produced its current status.
- **FR-019**: All members MUST see the same status for the same plant at the same moment.

**Duplicate prevention**

- **FR-020**: Before saving a care event, the system MUST warn the member if the same
  activity was already logged for that plant within its duplicate window. The duplicate
  window is half the plant's interval, with a minimum of 12 hours. The warning MUST name
  who performed the earlier event and when.
- **FR-021**: From the duplicate warning, members MUST be able to either cancel (nothing
  saved) or confirm (event saved and marked as an intentional additional activity).
- **FR-022**: When two events for the same plant and activity arrive close enough to
  overlap, the system MUST keep both and flag the later one as a possible duplicate.

**Dashboard & categorization**

- **FR-023**: The system MUST provide a dashboard showing all care activities for the
  current week (completed, due, and overdue), grouped by day. The week runs Monday to
  Sunday in the household's time zone.
- **FR-024**: The dashboard MUST list overdue items prominently above other items.
- **FR-025**: Each dashboard item MUST show the plant, the activity category, its status,
  and, for completed items, the member who performed it and when.
- **FR-026**: Members MUST be able to view the previous and next weeks. Past weeks show
  recorded activities, and future weeks show projected due activities.
- **FR-027**: Every care activity MUST belong to exactly one category. Categories MUST be
  distinguishable by a text label and an icon, not by color alone.
- **FR-028**: Watering MUST be the only activity category in this release. Adding a
  category later (e.g., fertilizing) MUST NOT change how existing watering events,
  schedules, or statuses behave.
- **FR-029**: Members MUST be able to filter the dashboard by member. A category filter
  MUST be offered once more than one category exists.

**Responsibility & reminders**

- **FR-030**: Due care activities MUST form a shared household pool. Any member can
  complete any due activity, and activities are not assigned to specific members.
  Attribution comes only from who logged the event (FR-010).
- **FR-031**: The system MUST send each member who opts in one daily summary of the
  household's due-today and overdue activities. The summary MUST reach the member when
  the app is closed.
- **FR-032**: Each member MUST be able to turn the daily summary on or off and choose its
  delivery time (default 08:00 in the household's time zone).
- **FR-033**: The daily summary MUST NOT be sent on a day when nothing is due or overdue.
  Each summary MUST reflect statuses at the moment it is sent, so a plant watered before
  then is not listed.
- **FR-034**: Opening the daily summary MUST take the member to the dashboard, where they
  can log activities directly.

**Access & privacy**

- **FR-035**: Household data (plants, events, members) MUST be accessible only to members
  of that household.
- **FR-036**: The system MUST store only the personal data needed for sign-in and
  attribution: a sign-in identity and a display name.
- **FR-037**: All features MUST be usable on common phone screen sizes as well as larger
  screens.

### Key Entities

- **Household**: A group of people who share care of a set of plants. Attributes: name,
  time zone, week start (Monday). Has many Members and Plants.
- **Member**: A person belonging to a household. Attributes: display name, joined date,
  active/departed state. Performs Care Events.
- **Plant**: A plant cared for by the household. Attributes: name, optional location,
  active/archived state. Has one Care Schedule per applicable category, and many Care
  Events.
- **Care Category**: A type of care activity. Watering is the only category in v1.
  Attributes: label, icon.
- **Care Schedule**: How often a category of care is due for a plant. Attributes: plant,
  category, interval in days. Next due date and status are derived from it and never
  stored as entered values.
- **Care Event**: A record that a care activity was performed. Attributes: plant,
  category, performing member, performed-at time, recorded-at time, backdated flag,
  intentional-extra flag, possible-duplicate flag, optional note.
- **Notification Preference**: A member's daily-summary settings. Attributes: member,
  enabled/disabled, delivery time.
- **Event Revision**: An audit record of an edit or undo applied to a Care Event.
  Attributes: event, changing member, time of change, before/after values.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Members can log a watering within 10 seconds of opening the dashboard.
- **SC-002**: A care event logged by one member appears for other members of the household
  within 5 seconds while both are online.
- **SC-003**: A new member can accept an invitation and log their first watering in under
  3 minutes.
- **SC-004**: In usability testing, 90% of members correctly identify which plants need
  watering today within 5 seconds of opening the dashboard.
- **SC-005**: Over a 4-week pilot, fewer than 5% of watering events are confirmed
  duplicates (two waterings of the same plant within its duplicate window that were not
  intentional).
- **SC-006**: Over a 4-week pilot, at least 90% of due waterings are logged by the end of
  their due day, and no plant stays overdue for more than 1 day in 90% of weeks.
- **SC-007**: Over a 4-week pilot, at least 85% of care events are logged within 1 hour of
  being performed. In other words, fewer than 15% need backdating, which shows that
  logging is easy enough to keep the record accurate.
- **SC-008**: 100% of plant statuses shown to different members at the same moment are
  identical. Spot checks across devices show no disagreement.
- **SC-009**: At least 95% of daily summaries reach opted-in members within 5 minutes of
  their chosen delivery time.
- **SC-010**: At least 80% of pilot members say the app reduced confusion about who cared
  for which plant, in a post-pilot survey.

## Assumptions

- **Devices** (from the source brief): All members have a device and software capable of
  using the application.
- **Household size**: A typical household has 2–6 members and up to about 50 plants. A
  member belongs to one household at a time in v1.
- **Connectivity**: The app needs a network connection to log or view current data in v1.
  Full offline logging with later sync is out of scope. Failed saves are clearly reported
  (FR-015).
- **Sign-in**: Members sign in with a standard account (e.g., email-based or common social
  sign-in). The exact method is a planning decision.
- **Schedules**: Watering intervals are fixed whole numbers of days. Seasonal or
  weather-based adjustment is out of scope.
- **Week definition**: The weekly dashboard runs Monday to Sunday in the household's time
  zone.
- **Duplicate window**: Defaults to half the plant's interval with a minimum of 12 hours.
  This is a reasonable default for watering and can be tuned during planning.
- **Notifications**: Members' devices can receive notifications when the app is closed,
  and members grant permission when they turn the daily summary on. Members who don't
  opt in still see all statuses in the app.
- **Out of scope for v1**: Care categories other than watering (including sunlight
  tasks), duty assignment or rotation, instant overdue alerts, plant identification, care recommendations or encyclopedias,
  sensor or smart-device integration, photo journaling, and multi-household membership.
- **Source brief gap**: Assumption #2 in `initial-spec.md` is blank. Nothing is inferred
  from it.
