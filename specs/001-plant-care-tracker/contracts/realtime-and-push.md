# Contract: Realtime Stream and Daily Summary Push

**Feature**: [../spec.md](../spec.md) | **REST contract**: [openapi.yaml](./openapi.yaml)

## 1. Household event stream (Server-Sent Events)

**Endpoint**: `GET /api/v1/households/current/stream` (session cookie required)

- **Content type**: `text/event-stream`.
- **Heartbeat**: an SSE comment (`: ping`) every 25 seconds.
- **Scope**: only events for the caller's active household are delivered (FR-035).
- **Timing**: events are emitted **after** the database transaction commits.
- Events carry **identifiers only**, never computed status. Clients MUST refetch affected
  queries (`/dashboard`, `/plants`, `/plants/{id}`, `/plants/{id}/care-events`) to get
  server-computed state. This keeps status calculation server-only (FR-019, Principle III).
- **Delivery target**: a client is notified within 5 seconds of the commit while
  connected (SC-002).
- **Reconnect**: the client relies on native `EventSource` reconnection. After any
  reconnect, the client MUST refetch the dashboard, because events missed while
  disconnected are not replayed.

### Event envelope

```text
event: <name>
id: <uuid v7>
data: {"householdId":"…","actorMemberId":"…","occurredAt":"2026-11-12T08:01:02Z", …fields}
```

### Event names

| Event | Extra fields | Emitted when | Client should refetch |
|---|---|---|---|
| `care_event.created` | `plantId`, `eventId`, `isPossibleDuplicate` | Event saved (any 201) | dashboard, plants, plant detail/history |
| `care_event.updated` | `plantId`, `eventId`, `action` (`edit`\|`void`\|`restore`) | Edit, undo, restore | same as above |
| `plant.created` / `plant.updated` / `plant.archived` / `plant.restored` | `plantId` | Plant changes | dashboard, plants, plant detail |
| `member.joined` / `member.left` | `memberId` | Membership changes | household, dashboard (member filter) |
| `household.updated` | — | Name or time zone change | everything (time zone changes "today") |

- When `actorMemberId` is the caller, the client MAY skip refetching because it already
  has the mutation response.
- When `isPossibleDuplicate` is true, the client SHOULD show a non-blocking notice ("Alex
  and you both logged Fern — review?") that links to the plant's history (FR-022).

## 2. Daily summary Web Push (FR-031–FR-034)

**Transport**: standard Web Push with VAPID (`web-push`). TTL is 4 hours, urgency
`normal`, and the `Topic` is `daily-summary` so a newer summary replaces an undelivered
older one.

### When a push is sent

- For each opted-in membership, the scheduler sends at most one summary per household-local
  date. It runs when local time first reaches or passes `deliveryTime`.
- Contents are computed at send time.
- No push is sent if there are zero Due-today or Overdue plants (FR-033).

### Payload (JSON, encrypted per Web Push)

```json
{
  "type": "daily_summary",
  "localDate": "2026-11-12",
  "title": "3 plants need water",
  "body": "Overdue: Fern (2 days). Due today: Monstera, Pothos.",
  "counts": { "overdue": 1, "dueToday": 2 },
  "url": "/dashboard"
}
```

| Field | Rules |
|---|---|
| `title` | `"{n} plant(s) need water"`, where n = overdue + dueToday |
| `body` | Overdue plants first (with days overdue), then Due today. Truncated to about 120 chars with "+N more" |
| `url` | Always `/dashboard` (FR-034) |
| Personal data | Plant names only. No member emails |

### Service worker behavior

- **`push`**: show a notification with `title` and `body`, a `tag` of
  `daily-summary-{localDate}`, and the app icon.
- **`notificationclick`**: focus an open app window and navigate it to `url`, or open a new
  window at `url`. The dashboard then loads fresh, server-computed status.

### Delivery outcomes

| Push service response | Server action |
|---|---|
| 201/202 | Set `push_subscriptions.last_success_at`. The dispatch is `sent` if at least one device succeeded |
| 404 / 410 | Delete that subscription |
| 429 / 5xx | Retry once on the next tick. If every device fails, the dispatch is `failed` (counts against SC-009) |
