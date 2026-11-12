export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Controllable clock for tests and the test-only clock hook. */
export class FakeClock implements Clock {
  private current: Date;
  constructor(start: Date | string = "2026-11-11T12:00:00Z") {
    this.current = new Date(start);
  }
  now(): Date {
    return new Date(this.current);
  }
  set(to: Date | string): void {
    this.current = new Date(to);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
