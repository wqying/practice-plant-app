<!--
Sync Impact Report
==================
Version change: (unversioned template) → 1.0.0
Bump rationale: Initial ratification. All template placeholders replaced with
project-specific governance for PlantsVSHumans, derived from initial-spec.md.

Modified principles (template slot → new title):
  - [PRINCIPLE_1_NAME] → I. Shared Source of Truth for Care Records
  - [PRINCIPLE_2_NAME] → II. Frictionless, Attributed Logging
  - [PRINCIPLE_3_NAME] → III. Deterministic Care Schedules
  - [PRINCIPLE_4_NAME] → IV. Test-First Domain Logic
  - [PRINCIPLE_5_NAME] → V. Scope Discipline & Simplicity

Added sections:
  - Product & Data Constraints (was [SECTION_2_NAME])
  - Development Workflow & Quality Gates (was [SECTION_3_NAME])
  - Governance (filled)

Removed sections: none

Dependent templates: not modified by this command; they read the
constitution at runtime.

Deferred TODOs: none.
-->

# PlantsVSHumans Constitution

## Core Principles

### I. Shared Source of Truth for Care Records

Every care activity (e.g., a watering event) MUST be stored in a single shared record that
all household members read from and write to. The rules:

- A care event recorded by one member MUST become visible to every other member without
  manual re-entry or synchronization steps.
- The system MUST detect a likely duplicate (same plant, same activity type, inside the
  activity's duplicate window) and MUST warn the user before saving it.
- Care history is append-only. Corrections MUST happen through explicit edit or undo
  actions that keep an audit trail; records MUST NOT be silently overwritten.
- When concurrent writes conflict, the system MUST resolve them deterministically and
  MUST NOT lose either write.

Rationale: The core problem is duplicate and missed care between roommates (Goal 2). A
single, trustworthy shared record is the precondition for solving it.

### II. Frictionless, Attributed Logging

Recording a completed care activity MUST be the fastest action in the product:

- From the dashboard, logging a care activity for a plant MUST take no more than two user
  interactions.
- Each event MUST automatically capture who performed it and when (server-recorded
  timestamp). Users MUST NOT be required to type either value.
- Backdating an event is allowed, but MUST be explicit and visibly marked as backdated.

Rationale: The spec states that people do not update their completed work accurately.
Lowering the cost of logging, and attributing events automatically, directly attacks that
root cause (Goal 1).

### III. Deterministic Care Schedules

The "upcoming" and "overdue" status of each plant MUST be computed, never entered by hand:

- Due dates MUST be derived only from the plant's configured care interval and its most
  recent recorded care event of that type.
- The same inputs MUST always produce the same status. Computation MUST be timezone-aware:
  timestamps are stored in UTC and shown in the household's configured local time.
- Every status shown to users (upcoming, due today, overdue) MUST be traceable to the event
  and interval that produced it.

Rationale: Identifying upcoming and overdue watering (Goal 1) is only useful if every
roommate can trust the status. Ambiguous or hand-maintained schedules recreate the
original problem.

### IV. Test-First Domain Logic (NON-NEGOTIABLE)

Scheduling, due-date and overdue calculation, duplicate detection, and conflict resolution
are core domain logic:

- Automated tests for this logic MUST be written and seen failing before the
  implementation is written (Red → Green → Refactor).
- Tests MUST cover boundary cases: interval edges, timezone and DST transitions, concurrent
  logging by two members, and plants with no care history.
- A change to core domain logic MUST NOT be merged while any of these tests fail.

Rationale: Errors in this logic cause real-world harm (dead or overwatered plants) and
silently erode trust in the shared schedule.

### V. Scope Discipline & Simplicity

`initial-spec.md` defines the product scope:

- Work MUST trace to a stated goal or functional requirement: tracking watering
  activities, avoiding duplicate or missed care, the weekly activity dashboard, or clear
  activity categorization.
- Capabilities beyond that scope (for example, sunlight tracking, which the problem
  statement mentions but no goal requires) MUST first be added to the specification
  before they are planned or built.
- Prefer the simplest design that meets the requirement. Each added dependency, service,
  or abstraction layer MUST be justified in the plan's Complexity Tracking section.

Rationale: A small household tool succeeds by doing its few jobs reliably. Scope creep and
speculative architecture delay the core value and add maintenance cost.

## Product & Data Constraints

- **Multi-member households**: The system MUST support several members caring for the
  same set of plants, with every member seeing the same data.
- **Weekly dashboard**: A dashboard MUST show all care activities for the current week
  (completed, upcoming, and overdue) in one view.
- **Clear categorization**: Every activity MUST belong to exactly one activity category
  (e.g., watering). The dashboard MUST distinguish categories visually without relying on
  color alone.
- **Device assumption**: Per the spec, all members are assumed to have a device and
  software capable of using the application. The interface MUST still be usable on
  common phone screen sizes, since care is often logged next to the plant.
- **Data minimization**: The system MUST store only the personal data needed for
  attribution (a display name and an authentication identity). Household data MUST be
  accessible only to members of that household.
- **Time handling**: All timestamps MUST be stored in UTC. Display conversion is a
  presentation concern only.

## Development Workflow & Quality Gates

- **Source of truth**: `initial-spec.md` is the authoritative product brief. Feature specs
  produced by `/speckit-specify` MUST be consistent with it. Any divergence MUST be
  resolved by amending the brief or the spec explicitly, never by implementation drift.
- **Spec Kit flow**: Features MUST progress through specify → (clarify) → plan → tasks →
  implement. Implementation MUST NOT begin without an approved plan and task list.
- **Constitution Check gate**: Each plan MUST include a Constitution Check that evaluates
  the design against Principles I–V before research and again after design. Violations
  MUST be either fixed or recorded with justification in Complexity Tracking.
- **Review**: Every change MUST be reviewed for compliance with this constitution before it
  is merged. Reviewers MUST confirm that tests exist and pass for any touched domain logic
  (Principle IV).
- **Definition of done**: A user story is done only when its acceptance scenarios pass,
  its domain-logic tests pass, and its behavior is reachable from the dashboard.

## Governance

- This constitution supersedes all other development practices for PlantsVSHumans. Where
  guidance conflicts, this document wins.
- **Amendments**: Changes MUST be proposed via `/speckit-constitution` and include a Sync
  Impact Report. Any amendment that changes a principle MUST also describe how existing
  specs and plans are affected and how they will be brought into compliance.
- **Versioning**: The constitution follows semantic versioning:
  - MAJOR: removal or backward-incompatible redefinition of a principle or governance rule.
  - MINOR: a new principle or section, or materially expanded guidance.
  - PATCH: clarifications, wording, or typo fixes with no semantic change.
- **Compliance review**: Plans (Constitution Check) and code reviews MUST verify
  compliance. Unjustified complexity or out-of-scope work is grounds to reject a change.
- **Runtime guidance**: Agent-specific runtime guidance (e.g., `CLAUDE.md`) MUST NOT
  contradict this constitution.

**Version**: 1.0.0 | **Ratified**: 2026-11-12 | **Last Amended**: 2026-11-12
