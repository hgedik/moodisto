import type { Clock } from '../../../src/application/ports';

/** A clock the test moves by hand, so nothing has to wait for a TTL to expire. */
export class TestClock implements Clock {
  private current = new Date('2026-08-27T10:00:00.000Z');

  now(): Date {
    return this.current;
  }

  advance(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}
