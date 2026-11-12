/**
 * PlantsVSHumans — PROTOTYPE server.
 * Single process, JSON-file storage, no auth (members pick their name), SSE live updates.
 * Domain rules (due status, duplicates, week) come from the pure, tested src/domain modules.
 */
import Fastify, { type FastifyReply } from "fastify";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v7 as newId } from "uuid";
import { computeDueStatus } from "./domain/due-status.js";
import { classifyDuplicate, duplicateWindowHours } from "./domain/duplicates.js";
import { weekBounds, projectDueDates } from "./domain/week.js";
import { localDate, isValidTimeZone, daysBetween } from "./domain/calendar.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.DATA_FILE ?? path.join(here, "..", "data", "db.json");
const PORT = Number(process.env.PORT ?? 3000);

interface Member { id: string; name: string; active: boolean; joinedAt: string }
interface Plant {
  id: string; name: string; location: string | null; intervalDays: number;
  createdOn: string; initialLastCaredOn: string | null; archived: boolean;
}
interface CareEvent {
  id: string; plantId: string; category: "watering"; memberId: string;
  performedAt: string; recordedAt: string; isBackdated: boolean;
  isIntentionalExtra: boolean; isPossibleDuplicate: boolean; duplicateOfEventId: string | null;
  note: string | null; voided: boolean;
  revisions: { action: "void" | "restore"; memberId: string; at: string }[];
}
interface Store { household: { name: string; timeZone: string }; members: Member[]; plants: Plant[]; events: CareEvent[] }

// ------------------------------------------------------------------ storage
function load(): Store {
  if (existsSync(DATA_FILE)) return JSON.parse(readFileSync(DATA_FILE, "utf8")) as Store;
  return { household: { name: "Our Home", timeZone: "Europe/London" }, members: [], plants: [], events: [] };
}
const store = load();
function save() {
  mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

// ------------------------------------------------------------------ helpers
const CATEGORY = { code: "watering", label: "Watering", icon: "💧" } as const;
const tz = () => store.household.timeZone;
const today = () => localDate(new Date(), tz());
const memberName = (id: string) => store.members.find((m) => m.id === id)?.name ?? "Someone";
class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: object = {}) { super(message); }
}
const plantEvents = (plantId: string) =>
  store.events
    .filter((e) => e.plantId === plantId && !e.voided)
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt));

function plantView(p: Plant) {
  const latest = plantEvents(p.id)[0] ?? null;
  const due = p.archived
    ? null
    : computeDueStatus(
        {
          intervalDays: p.intervalDays,
          lastCareDate: latest ? localDate(new Date(latest.performedAt), tz()) : null,
          initialLastCaredOn: p.initialLastCaredOn,
          createdOn: p.createdOn,
        },
        today(),
      );
  return {
    ...p,
    category: CATEGORY,
    latestEventId: latest?.id ?? null,
    lastWatered: latest ? { at: latest.performedAt, by: memberName(latest.memberId) } : null,
    dueStatus: due,
  };
}
const eventView = (e: CareEvent) => ({ ...e, performedBy: memberName(e.memberId), category: CATEGORY });

function relative(fromIso: string): string {
  const mins = Math.round((Date.now() - new Date(fromIso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

// ------------------------------------------------------------------ SSE
const clients = new Set<FastifyReply>();
function broadcast(event: string, data: object) {
  const msg = `event: ${event}\nid: ${newId()}\ndata: ${JSON.stringify({ ...data, occurredAt: new Date().toISOString() })}\n\n`;
  for (const c of clients) c.raw.write(msg);
}
setInterval(() => { for (const c of clients) c.raw.write(": ping\n\n"); }, 25_000).unref();

// ------------------------------------------------------------------ app
export function buildApp() {
  const app = Fastify({ logger: { level: "info" } });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ code: err.code, message: err.message, ...err.extra });
    reply.status(500).send({ code: "internal", message: "Something went wrong" });
  });

  const requireMember = (id: unknown): Member => {
    const m = store.members.find((x) => x.id === id && x.active);
    if (!m) throw new HttpError(400, "unknown_member", "Pick who you are first.");
    return m;
  };
  const requirePlant = (id: string): Plant => {
    const p = store.plants.find((x) => x.id === id);
    if (!p) throw new HttpError(404, "not_found", "Plant not found");
    return p;
  };
  const str = (v: unknown, field: string, max: number, required = true): string | null => {
    if (v === undefined || v === null || v === "") {
      if (required) throw new HttpError(422, "validation_error", `${field} is required`);
      return null;
    }
    const s = String(v).trim();
    if (s.length < 1 || s.length > max) throw new HttpError(422, "validation_error", `${field} must be 1–${max} characters`);
    return s;
  };
  const interval = (v: unknown): number => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 60) throw new HttpError(422, "validation_error", "Watering interval must be 1–60 days");
    return n;
  };

  // Household + members
  app.get("/api/household", async () => ({ ...store.household, today: today(), members: store.members }));
  app.patch<{ Body: { name?: string; timeZone?: string } }>("/api/household", async (req) => {
    if (req.body.name !== undefined) store.household.name = str(req.body.name, "Name", 60)!;
    if (req.body.timeZone !== undefined) {
      if (!isValidTimeZone(req.body.timeZone)) throw new HttpError(422, "validation_error", "Unknown time zone");
      store.household.timeZone = req.body.timeZone;
    }
    save(); broadcast("household.updated", {});
    return store.household;
  });
  app.post<{ Body: { name: string } }>("/api/members", async (req, reply) => {
    const m: Member = { id: newId(), name: str(req.body.name, "Name", 40)!, active: true, joinedAt: new Date().toISOString() };
    store.members.push(m); save(); broadcast("member.joined", { memberId: m.id });
    return reply.status(201).send(m);
  });
  app.delete<{ Params: { id: string } }>("/api/members/:id", async (req, reply) => {
    const m = store.members.find((x) => x.id === req.params.id);
    if (!m) throw new HttpError(404, "not_found", "Member not found");
    m.active = false; save(); broadcast("member.left", { memberId: m.id });
    return reply.status(204).send();
  });

  // Plants
  app.get<{ Querystring: { includeArchived?: string } }>("/api/plants", async (req) => {
    const plants = store.plants.filter((p) => req.query.includeArchived === "true" || !p.archived).map(plantView);
    const order = { overdue: 0, due_today: 1, upcoming: 2 } as const;
    plants.sort((a, b) => (a.dueStatus ? order[a.dueStatus.status] : 3) - (b.dueStatus ? order[b.dueStatus.status] : 3)
      || (a.dueStatus?.dueDate ?? "").localeCompare(b.dueStatus?.dueDate ?? ""));
    return { today: today(), plants };
  });
  app.post<{ Body: { name: string; location?: string; intervalDays: number; lastWateredOn?: string } }>("/api/plants", async (req, reply) => {
    const t = today();
    const last = req.body.lastWateredOn || null;
    if (last && (!/^\d{4}-\d{2}-\d{2}$/.test(last) || daysBetween(t, last) > 0))
      throw new HttpError(422, "validation_error", "Last watered can't be in the future");
    const p: Plant = {
      id: newId(), name: str(req.body.name, "Name", 60)!, location: str(req.body.location, "Location", 60, false),
      intervalDays: interval(req.body.intervalDays), createdOn: t, initialLastCaredOn: last, archived: false,
    };
    store.plants.push(p); save(); broadcast("plant.created", { plantId: p.id });
    return reply.status(201).send(plantView(p));
  });
  app.patch<{ Params: { id: string }; Body: { name?: string; location?: string | null; intervalDays?: number; archived?: boolean } }>(
    "/api/plants/:id",
    async (req) => {
      const p = requirePlant(req.params.id);
      if (req.body.name !== undefined) p.name = str(req.body.name, "Name", 60)!;
      if (req.body.location !== undefined) p.location = str(req.body.location, "Location", 60, false);
      if (req.body.intervalDays !== undefined) p.intervalDays = interval(req.body.intervalDays);
      if (req.body.archived !== undefined) p.archived = Boolean(req.body.archived);
      save(); broadcast("plant.updated", { plantId: p.id });
      return plantView(p);
    },
  );
  app.get<{ Params: { id: string } }>("/api/plants/:id/events", async (req) => {
    requirePlant(req.params.id);
    return store.events
      .filter((e) => e.plantId === req.params.id)
      .sort((a, b) => b.performedAt.localeCompare(a.performedAt))
      .map(eventView);
  });

  // Log watering (FR-009–FR-012, FR-020–FR-022)
  app.post<{
    Params: { id: string };
    Body: { memberId: string; performedAt?: string; note?: string; knownLatestEventId?: string | null; confirmDuplicate?: boolean };
  }>("/api/plants/:id/water", async (req, reply) => {
    const member = requireMember(req.body.memberId);
    const plant = requirePlant(req.params.id);
    if (plant.archived) throw new HttpError(422, "validation_error", "Plant is archived");
    const now = new Date();
    let performedAt = now;
    let isBackdated = false;
    if (req.body.performedAt) {
      performedAt = new Date(req.body.performedAt);
      if (Number.isNaN(performedAt.getTime())) throw new HttpError(422, "validation_error", "Invalid time");
      if (performedAt.getTime() > now.getTime() + 60_000) throw new HttpError(422, "validation_error", "You can't log a watering in the future");
      isBackdated = true;
    }
    const note = str(req.body.note, "Note", 280, false);
    const candidates = plantEvents(plant.id).map((e) => ({ id: e.id, performedAt: new Date(e.performedAt) }));
    const decision = classifyDuplicate({
      candidates, knownLatestEventId: req.body.knownLatestEventId ?? null,
      confirm: Boolean(req.body.confirmDuplicate), performedAt, intervalDays: plant.intervalDays,
    });
    if (decision.kind === "warn") {
      const ex = store.events.find((e) => e.id === decision.existing.id)!;
      throw new HttpError(409, "duplicate_warning",
        `${memberName(ex.memberId)} watered ${plant.name} ${relative(ex.performedAt)} — log anyway?`,
        { existingEvent: eventView(ex), windowHours: duplicateWindowHours(plant.intervalDays) });
    }
    const e: CareEvent = {
      id: newId(), plantId: plant.id, category: "watering", memberId: member.id,
      performedAt: performedAt.toISOString(), recordedAt: now.toISOString(), isBackdated,
      isIntentionalExtra: decision.kind === "intentional_extra",
      isPossibleDuplicate: decision.kind === "possible_duplicate",
      duplicateOfEventId: decision.kind === "normal" ? null : decision.existing.id,
      note, voided: false, revisions: [],
    };
    store.events.push(e); save();
    broadcast("care_event.created", { plantId: plant.id, eventId: e.id, actorMemberId: member.id, isPossibleDuplicate: e.isPossibleDuplicate, actorName: member.name, plantName: plant.name });
    return reply.status(201).send({ event: eventView(e), plant: plantView(plant) });
  });

  // Undo / restore — history is never deleted (FR-013)
  for (const action of ["void", "restore"] as const) {
    app.post<{ Params: { id: string }; Body: { memberId: string } }>(`/api/events/:id/${action}`, async (req) => {
      const member = requireMember(req.body.memberId);
      const e = store.events.find((x) => x.id === req.params.id);
      if (!e) throw new HttpError(404, "not_found", "Event not found");
      if (e.voided === (action === "void")) throw new HttpError(409, "conflict", action === "void" ? "Already undone" : "Not undone");
      e.voided = action === "void";
      e.revisions.push({ action, memberId: member.id, at: new Date().toISOString() });
      save(); broadcast("care_event.updated", { plantId: e.plantId, eventId: e.id, action, actorMemberId: member.id });
      return eventView(e);
    });
  }

  // Weekly dashboard (FR-023–FR-029)
  app.get<{ Querystring: { weekStart?: string; memberId?: string } }>("/api/dashboard", async (req) => {
    const t = today();
    const { weekStart, weekEnd } = weekBounds(req.query.weekStart ?? t);
    if (req.query.weekStart && req.query.weekStart !== weekStart) throw new HttpError(422, "validation_error", "weekStart must be a Monday");
    const containsToday = daysBetween(weekStart, t) >= 0 && daysBetween(t, weekEnd) >= 0;
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(`${weekStart}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
      return { date: d.toISOString().slice(0, 10), items: [] as object[] };
    });
    const byDate = new Map(days.map((d) => [d.date, d]));
    for (const e of store.events) {
      if (e.voided || (req.query.memberId && e.memberId !== req.query.memberId)) continue;
      const day = byDate.get(localDate(new Date(e.performedAt), tz()));
      const plant = store.plants.find((p) => p.id === e.plantId);
      if (day && plant) day.items.push({ kind: "completed", plantId: plant.id, plantName: plant.name, category: CATEGORY, statusLabel: "Done", event: eventView(e) });
    }
    const overdue: object[] = [];
    for (const p of store.plants.filter((x) => !x.archived)) {
      const v = plantView(p);
      const ds = v.dueStatus!;
      const base = { plantId: p.id, plantName: p.name, plantLocation: p.location, category: CATEGORY, latestEventId: v.latestEventId };
      if (ds.status === "overdue" && containsToday) overdue.push({ ...base, kind: "overdue", statusLabel: ds.label, dueDate: ds.dueDate });
      const from = daysBetween(t, weekStart) > 0 ? weekStart : t; // past days show history only
      const firstDue = ds.status === "overdue" ? t : ds.dueDate;
      if (daysBetween(from, weekEnd) < 0) continue;
      for (const date of projectDueDates(firstDue, p.intervalDays, from, weekEnd)) {
        if (ds.status === "overdue" && date === t) continue; // already in overdue list
        const isToday = date === t;
        byDate.get(date)?.items.push({
          ...base, kind: isToday ? "due_today" : "upcoming", dueDate: date,
          statusLabel: isToday ? "Due today" : "Upcoming", projected: date !== ds.dueDate,
        });
      }
    }
    return { today: t, weekStart, weekEnd, timeZone: tz(), overdue, days, members: store.members, categories: [CATEGORY] };
  });

  // Live updates (FR-014)
  app.get("/api/stream", (req, reply) => {
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    reply.raw.write(": connected\n\n");
    clients.add(reply);
    req.raw.on("close", () => clients.delete(reply));
  });

  // UI
  const html = readFileSync(path.join(here, "..", "public", "index.html"), "utf8");
  app.get("/", (_req, reply) => reply.type("text/html").send(html));

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const app = buildApp();
  await app.listen({ port: PORT, host: "0.0.0.0" });
}
