import { describe, expect, it } from 'vitest';
import { COLS, ROWS } from '../shared/constants';
import { MAPS } from '../shared/maps';

const LEGAL = new Set([...'.#x*o~=<>^v@M1234']);
const FLIP_H: Record<string, string> = { '<': '>', '>': '<', '1': '2', '2': '1', '3': '4', '4': '3' };
const FLIP_V: Record<string, string> = { '^': 'v', v: '^', '1': '3', '3': '1', '2': '4', '4': '2' };
const at = (g: readonly string[], c: number, r: number) => (c < 0 || r < 0 || c >= COLS || r >= ROWS ? '#' : g[r]![c]!);
const isFloor = (t: string) => t === '.' || '1234'.includes(t);
const passable = (t: string) => t !== '#' && t !== '~' && t !== 'M';

describe.each(MAPS.map((m) => [m.name, m] as const))('%s', (_name, map) => {
  const g = map.grid;

  it('is 15x13 with legal tiles', () => {
    expect(g).toHaveLength(ROWS);
    for (const row of g) {
      expect(row).toHaveLength(COLS);
      for (const ch of row) expect(LEGAL.has(ch)).toBe(true);
    }
  });

  it('is mirror-symmetric on both axes', () => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = at(g, c, r);
        expect(at(g, COLS - 1 - c, r)).toBe(FLIP_H[t] ?? t);
        expect(at(g, c, ROWS - 1 - r)).toBe(FLIP_V[t] ?? t);
      }
    }
  });

  it('has 4 spawns that can open safely with stream 1 and 2', () => {
    const spawns: [number, number][] = [];
    g.forEach((row, r) => [...row].forEach((t, c) => '1234'.includes(t) && spawns.push([c, r])));
    expect(spawns).toHaveLength(4);
    for (const [sc, sr] of spawns) {
      // the floor pocket around the spawn
      const pocket: [number, number][] = [];
      const seen = new Set<string>();
      const stack: [number, number][] = [[sc, sr]];
      while (stack.length) {
        const [c, r] = stack.pop()!;
        if (seen.has(`${c},${r}`) || !isFloor(at(g, c, r))) continue;
        seen.add(`${c},${r}`);
        pocket.push([c, r]);
        stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
      }
      for (const R of [1, 2]) {
        const safe = pocket.some(([pc, pr]) => {
          const hit = new Set([`${pc},${pr}`]);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            for (let k = 1; k <= R; k++) {
              const t = at(g, pc + dx * k, pr + dy * k);
              if (t === '#') break;
              hit.add(`${pc + dx * k},${pr + dy * k}`);
              if (!isFloor(t)) break;
            }
          }
          return pocket.some(([ec, er]) => !hit.has(`${ec},${er}`));
        });
        expect(safe, `spawn ${sc},${sr} stream ${R}`).toBe(true);
      }
    }
  });

  it('connects every walkable tile once crates are gone', () => {
    const start = g.flatMap((row, r) => [...row].map((t, c) => [t, c, r] as const)).find(([t]) => t === '1')!;
    const seen = new Set<string>();
    const stack: [number, number][] = [[start[1], start[2]]];
    while (stack.length) {
      const [c, r] = stack.pop()!;
      const key = `${c},${r}`;
      if (seen.has(key) || !passable(at(g, c, r))) continue;
      seen.add(key);
      if (at(g, c, r) === '@') stack.push([COLS - 1 - c, ROWS - 1 - r]);
      stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
    let walkable = 0;
    g.forEach((row) => [...row].forEach((t) => passable(t) && walkable++));
    expect(seen.size).toBe(walkable);
  });

  it('keeps the balloon machine a single 3x3 block in the middle', () => {
    const cells = g.flatMap((row, r) => [...row].flatMap((t, c) => (t === 'M' ? [[c, r] as const] : [])));
    if (!cells.length) return;
    expect(cells).toHaveLength(9);
    for (const [c, r] of cells) {
      expect(Math.abs(c - (COLS - 1) / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(r - (ROWS - 1) / 2)).toBeLessThanOrEqual(1);
    }
  });

  it('pairs every portal with its point-symmetric twin', () => {
    g.forEach((row, r) =>
      [...row].forEach((t, c) => {
        if (t === '@') expect(at(g, COLS - 1 - c, ROWS - 1 - r)).toBe('@');
      }),
    );
  });
});
