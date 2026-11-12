export const duplicateWindowHours = (intervalDays: number): number => Math.max(12, intervalDays * 12);

export interface Candidate {
  id: string;
  performedAt: Date;
}
export type DuplicateDecision =
  | { kind: "normal" }
  | { kind: "warn"; existing: Candidate }
  | { kind: "intentional_extra"; existing: Candidate }
  | { kind: "possible_duplicate"; existing: Candidate };

/**
 * candidates: non-voided events for the same plant/category, newest first.
 * knownLatestEventId: latest event the client was showing when the member tapped.
 */
export function classifyDuplicate(args: {
  candidates: Candidate[];
  knownLatestEventId: string | null;
  confirm: boolean;
  performedAt: Date;
  intervalDays: number;
}): DuplicateDecision {
  const windowMs = duplicateWindowHours(args.intervalDays) * 3600_000;
  const inWindow = args.candidates.filter(
    (c) => Math.abs(args.performedAt.getTime() - c.performedAt.getTime()) < windowMs,
  );
  const existing = inWindow[0];
  if (!existing) return { kind: "normal" };
  if (args.confirm) return { kind: "intentional_extra", existing };
  const knownIdx = args.knownLatestEventId ? args.candidates.findIndex((c) => c.id === args.knownLatestEventId) : -1;
  // Events newer than what the client knew about = a race: keep both, flag the later one.
  const unseen = inWindow.filter((c) => knownIdx === -1 || args.candidates.indexOf(c) < knownIdx);
  if (unseen[0]) return { kind: "possible_duplicate", existing: unseen[0] };
  return { kind: "warn", existing };
}
