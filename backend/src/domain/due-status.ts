import { addDays, daysBetween } from "./calendar.js";

export interface DueInput {
  intervalDays: number;
  lastCareDate?: string | null; // local date of latest non-voided event
  initialLastCaredOn?: string | null;
  createdOn: string;
}
export interface DueStatus {
  status: "overdue" | "due_today" | "upcoming";
  label: string;
  dueDate: string;
  daysOverdue?: number;
  daysUntilDue?: number;
  source: "latest_event" | "initial_last_watered" | "created_on";
  baseDate: string;
  intervalDays: number;
}

const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** Pure, deterministic due status on local calendar days (Principle III). */
export function computeDueStatus(input: DueInput, today: string): DueStatus {
  const { intervalDays } = input;
  let source: DueStatus["source"];
  let baseDate: string;
  let dueDate: string;
  if (input.lastCareDate) {
    source = "latest_event";
    baseDate = input.lastCareDate;
    dueDate = addDays(baseDate, intervalDays);
  } else if (input.initialLastCaredOn) {
    source = "initial_last_watered";
    baseDate = input.initialLastCaredOn;
    dueDate = addDays(baseDate, intervalDays);
  } else {
    source = "created_on";
    baseDate = input.createdOn;
    dueDate = input.createdOn;
  }
  const diff = daysBetween(today, dueDate);
  const base = { dueDate, source, baseDate, intervalDays };
  if (diff < 0) return { ...base, status: "overdue", daysOverdue: -diff, label: `Overdue by ${plural(-diff)}` };
  if (diff === 0) return { ...base, status: "due_today", label: "Due today" };
  return { ...base, status: "upcoming", daysUntilDue: diff, label: `Upcoming — due in ${plural(diff)}` };
}
