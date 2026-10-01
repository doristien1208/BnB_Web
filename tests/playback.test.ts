import { describe, expect, it } from 'vitest';
import { Playback } from '../client/game/playback';
import { TICK_MS } from '../shared/constants';
import { Rng } from '../shared/rng';

/**
 * A server on Windows (timers wake every 15.6 ms, so ticks leave in uneven bunches), a network with
 * jitter and, optionally, a stall now and then; a browser drawing at 60 fps. Returns per-frame stats.
 */
function simulate(opts: { jitter: number; stallEvery?: number; seconds?: number; seed?: number }) {
  const rng = new Rng(opts.seed ?? 1);
  const seconds = opts.seconds ?? 20;
  const ticks = Math.round((seconds * 1000) / TICK_MS);
  const arrivals: number[] = [];
  let wake = 0;
  let last = 0;
  for (let k = 0; k < ticks; k++) {
    const due = k * TICK_MS;
    while (wake < due) wake += 15.625;
    let at = wake + 2 + rng.next() * opts.jitter;
    if (opts.stallEvery && Math.floor(at / opts.stallEvery) !== Math.floor((at - 150) / opts.stallEvery)) {
      at = Math.ceil(at / opts.stallEvery) * opts.stallEvery; // a lost packet holds everything back for a moment
    }
    last = Math.max(last, at); // TCP keeps them in order
    arrivals.push(last);
  }
  const clock = new Playback();
  let next = 0;
  let prev: number | null = null;
  const frames: { t: number; step: number; covered: boolean; behind: number }[] = [];
  for (let now = 300 + rng.next() * TICK_MS; now < seconds * 1000; now += 1000 / 60) {
    while (next < ticks && arrivals[next]! <= now) clock.observe(next, arrivals[next++]!);
    const t = clock.at(now);
    frames.push({ t, step: prev === null ? 1 : t - prev, covered: Math.ceil(t) < next, behind: next - 1 - t });
    prev = t;
  }
  return frames.slice(60); // skip the first second while it settles
}

describe('playback clock', () => {
  it.each([0, 15, 35])('plays smoothly with %i ms of network jitter', (jitter) => {
    const frames = simulate({ jitter });
    for (const f of frames) expect(f.step).toBeGreaterThan(0); // never runs backwards
    const smooth = frames.filter((f) => f.step > 0.75 && f.step < 1.25).length / frames.length;
    const covered = frames.filter((f) => f.covered).length / frames.length;
    const behind = frames.reduce((s, f) => s + f.behind, 0) / frames.length;
    expect(smooth).toBeGreaterThan(0.99);
    expect(covered).toBeGreaterThan(0.97); // the next snapshot is almost always there to interpolate to
    expect(behind).toBeLessThan(2 + jitter / TICK_MS); // ...without adding much lag
  });

  it('rides out an occasional stall without lagging for long afterwards', () => {
    const calm = simulate({ jitter: 10 });
    const stalls = simulate({ jitter: 10, stallEvery: 5000 });
    const behind = (fs: typeof calm) => fs.reduce((s, f) => s + f.behind, 0) / fs.length;
    expect(behind(stalls)).toBeLessThan(behind(calm) + 1.5);
    for (const f of stalls) expect(f.step).toBeGreaterThan(0);
  });
});
