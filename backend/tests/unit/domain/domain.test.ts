import { describe, it, expect } from "vitest";
import { computeDueStatus } from "../../../src/domain/due-status.js";
import { duplicateWindowHours, classifyDuplicate } from "../../../src/domain/duplicates.js";
import { weekBounds, projectDueDates } from "../../../src/domain/week.js";
import { localDate } from "../../../src/domain/calendar.js";

const today = "2026-11-12";

describe("computeDueStatus", () => {
  it("interval 7, last watered 7 days ago → due today", () => {
    expect(computeDueStatus({ intervalDays: 7, lastCareDate: "2026-11-05", createdOn: "2026-10-01" }, today).status).toBe("due_today");
  });
  it("interval 3, last watered 5 days ago → overdue by 2", () => {
    const s = computeDueStatus({ intervalDays: 3, lastCareDate: "2026-11-07", createdOn: "2026-10-01" }, today);
    expect(s).toMatchObject({ status: "overdue", daysOverdue: 2, label: "Overdue by 2 days" });
  });
  it("interval 5, last watered 1 day ago → upcoming in 4", () => {
    const s = computeDueStatus({ intervalDays: 5, lastCareDate: "2026-11-11", createdOn: "2026-10-01" }, today);
    expect(s).toMatchObject({ status: "upcoming", daysUntilDue: 4 });
  });
  it("no history → due on creation date", () => {
    expect(computeDueStatus({ intervalDays: 7, createdOn: today }, today)).toMatchObject({ status: "due_today", source: "created_on" });
  });
  it("initial last-watered date used when no events", () => {
    expect(computeDueStatus({ intervalDays: 3, initialLastCaredOn: "2026-11-10", createdOn: today }, today)).toMatchObject({ dueDate: "2026-11-13", source: "initial_last_watered" });
  });
  it("long absence shows true overdue duration once", () => {
    expect(computeDueStatus({ intervalDays: 2, lastCareDate: "2026-10-29", createdOn: "2026-10-01" }, today).daysOverdue).toBe(12);
  });
  it("is DST-safe (calendar days across Europe/London change)", () => {
    expect(computeDueStatus({ intervalDays: 7, lastCareDate: "2026-10-22", createdOn: "2026-10-01" }, "2026-10-29").status).toBe("due_today");
  });
});

describe("calendar", () => {
  it("uses household-local date, not UTC", () => {
    expect(localDate(new Date("2026-11-13T04:30:00Z"), "America/New_York")).toBe("2026-11-12");
  });
});

describe("duplicates", () => {
  it("window is half the interval, min 12h", () => {
    expect(duplicateWindowHours(1)).toBe(12);
    expect(duplicateWindowHours(7)).toBe(84);
  });
  const now = new Date("2026-11-12T12:00:00Z");
  const recent = { id: "e1", performedAt: new Date("2026-11-12T09:00:00Z") };
  it("warns when the client already saw the recent event", () => {
    expect(classifyDuplicate({ candidates: [recent], knownLatestEventId: "e1", confirm: false, performedAt: now, intervalDays: 2 }).kind).toBe("warn");
  });
  it("confirm saves an intentional extra", () => {
    expect(classifyDuplicate({ candidates: [recent], knownLatestEventId: "e1", confirm: true, performedAt: now, intervalDays: 2 }).kind).toBe("intentional_extra");
  });
  it("race (event unknown to client) saves and flags", () => {
    expect(classifyDuplicate({ candidates: [recent], knownLatestEventId: null, confirm: false, performedAt: now, intervalDays: 2 }).kind).toBe("possible_duplicate");
  });
  it("outside window saves normally", () => {
    const old = { id: "e0", performedAt: new Date("2026-11-11T23:00:00Z") };
    expect(classifyDuplicate({ candidates: [old], knownLatestEventId: "e0", confirm: false, performedAt: now, intervalDays: 1 }).kind).toBe("normal");
  });
});

describe("week", () => {
  it("Sunday maps to preceding Monday", () => {
    expect(weekBounds("2026-11-15")).toEqual({ weekStart: "2026-11-09", weekEnd: "2026-11-15" });
  });
  it("projects due dates every interval", () => {
    expect(projectDueDates("2026-11-10", 3, "2026-11-09", "2026-11-15")).toEqual(["2026-11-10", "2026-11-13"]);
  });
});
