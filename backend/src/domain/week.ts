import { DateTime } from "luxon";
import { addDays, daysBetween } from "./calendar.js";

export function weekBounds(date: string): { weekStart: string; weekEnd: string } {
  const d = DateTime.fromISO(date, { zone: "UTC" });
  const weekStart = d.minus({ days: d.weekday - 1 }).toISODate()!;
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

/** Due dates from dueDate repeating every intervalDays within [start, end]. */
export function projectDueDates(dueDate: string, intervalDays: number, start: string, end: string): string[] {
  const out: string[] = [];
  let d = dueDate;
  if (daysBetween(d, start) > 0) {
    const steps = Math.ceil(daysBetween(d, start) / intervalDays);
    d = addDays(d, steps * intervalDays);
  }
  while (daysBetween(d, end) >= 0) {
    out.push(d);
    d = addDays(d, intervalDays);
  }
  return out;
}
