import { DateTime } from "luxon";

/** Household-local calendar date (YYYY-MM-DD) for an instant. */
export const localDate = (instant: Date, tz: string): string =>
  DateTime.fromJSDate(instant, { zone: tz }).toISODate()!;

export const addDays = (date: string, n: number): string =>
  DateTime.fromISO(date, { zone: "UTC" }).plus({ days: n }).toISODate()!;

export const daysBetween = (from: string, to: string): number =>
  Math.round(DateTime.fromISO(to, { zone: "UTC" }).diff(DateTime.fromISO(from, { zone: "UTC" }), "days").days);

export const isValidTimeZone = (tz: string): boolean => DateTime.local().setZone(tz).isValid;
