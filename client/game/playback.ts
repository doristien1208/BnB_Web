import { TICK_MS } from '../../shared/constants';

const MARGIN = 1; // ticks your own character stays behind the latest (late) snapshot

/**
 * Playback clock. Snapshots arrive unevenly (Windows timers wake every 15.6 ms, Wi-Fi delivers in
 * bursts), so the view runs a little behind the newest one. How far behind follows the measured
 * arrival jitter, and it changes by playing a few percent slower or faster, never by jumping.
 * Times are in ms (performance.now()).
 */
export class Playback {
  private readonly late: number[] = []; // arrival time minus server tick, in ticks, newest last
  private target = MARGIN;
  private delay: number | null = null;
  private last = 0;

  observe(tick: number, now: number): void {
    this.late.push(now / TICK_MS - tick);
    if (this.late.length > 90) this.late.shift();
    const sorted = [...this.late].sort((a, b) => a - b);
    const lo = sorted[0]!;
    const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)]!;
    // follow ordinary jitter, but a rare long stall (a lost packet) should not add lag for seconds
    this.target = Math.min(p95, lo + 4) + MARGIN;
  }

  /** Server tick (fractional) to draw your own character at, for frame time `now`. */
  at(now: number): number {
    const t = now / TICK_MS;
    const dt = Math.max(0, Math.min(6, t - this.last));
    this.last = t;
    if (this.delay === null || Math.abs(this.target - this.delay) > 10) this.delay = this.target;
    else {
      const diff = this.target - this.delay;
      const rate = diff > 0 ? 0.2 : 0.03; // fall back quickly when packets run late, catch up gently
      this.delay += Math.sign(diff) * Math.min(Math.abs(diff), dt * rate);
    }
    return t - this.delay;
  }
}
