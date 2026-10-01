import { describe, expect, it } from 'vitest';
import { RULES, TILE, TICK_RATE } from '../shared/constants';
import { SUPPLY_ITEMS } from '../shared/items';
import { MAPS, type MapDef } from '../shared/maps';
import type { GamePlayerInfo, Mode } from '../shared/protocol';
import { ALIVE, DEAD, Game, TRAPPED, ringOf, tileCenter, tileIndex, type Player } from '../shared/sim/game';
import type { Dir } from '../shared/types';

const OPEN = [
  '1.............2',
  ...Array.from({ length: 11 }, () => '...............'),
  '3.............4',
];

function mapOf(rows: string[] = OPEN): MapDef {
  return { id: 99, key: 'village', name: 'test', tag: '', stars: 1, desc: '', grid: rows };
}

/** Sets `rows` over the open map; `edits` is a list of [col, row, tile]. */
function withTiles(edits: [number, number, string][]): string[] {
  const rows = OPEN.map((r) => [...r]);
  for (const [c, r, t] of edits) rows[r]![c] = t;
  return rows.map((r) => r.join(''));
}

function makeGame(opts: { rows?: string[]; n?: number; mode?: Mode; teams?: number[] } = {}): Game {
  const n = opts.n ?? 2;
  const infos: GamePlayerInfo[] = Array.from({ length: n }, (_, k) => ({
    id: 'abcd'[k]!,
    name: `P${k + 1}`,
    char: 0,
    color: k,
    team: opts.teams?.[k] ?? -1,
    slot: k,
  }));
  const g = new Game(mapOf(opts.rows), infos, { mode: opts.mode ?? 'ffa', time: 180, seed: 7 });
  g.countdown = 1;
  g.step(); // countdown over
  return g;
}

function put(p: Player, c: number, r: number): void {
  p.x = tileCenter(c);
  p.y = tileCenter(r);
  p.tc = c;
  p.tr = r;
}

const run = (g: Game, ticks: number) => {
  for (let i = 0; i < ticks; i++) g.step();
};
const P = (g: Game, id: string) => g.byId(id)!;

describe('water balloons', () => {
  it('explode after the fuse with a cross-shaped stream', () => {
    const g = makeGame({ rows: withTiles([[5, 3, '#'], [7, 5, 'x']]) });
    const a = P(g, 'a');
    put(a, 5, 5);
    put(P(g, 'b'), 12, 12);
    a.pow = 2;
    g.pushAction('a', 'b');
    g.step();
    expect(g.balloons).toHaveLength(1);
    put(a, 0, 12); // walk away
    run(g, RULES.fuse);
    expect(g.balloons).toHaveLength(0);
    expect(g.blasts).toHaveLength(1);
    const [up, down, left, right] = g.blasts[0]!.arms;
    expect(up).toBe(1); // hard wall at (5,3)
    expect(down).toBe(2);
    expect(left).toBe(2);
    expect(right).toBe(2); // reaches the crate at (7,5) and stops there
    expect(g.grid[tileIndex(7, 5)]).toBe('.');
  });

  it('respects the balloon count', () => {
    const g = makeGame();
    const a = P(g, 'a');
    put(a, 5, 5);
    g.pushAction('a', 'b');
    g.step();
    put(a, 7, 5);
    g.pushAction('a', 'b');
    g.step();
    expect(g.balloons).toHaveLength(1); // hippo starts with 1 balloon
  });

  it('chain-react within the same tick', () => {
    const g = makeGame();
    const [a, b] = [P(g, 'a'), P(g, 'b')];
    put(a, 5, 5);
    g.pushAction('a', 'b');
    g.step();
    put(b, 7, 5);
    b.pow = 1;
    run(g, 30);
    g.pushAction('b', 'b');
    g.step();
    put(a, 0, 12);
    put(b, 14, 12);
    a.pow = 2;
    g.balloons[0]!.pow = 2;
    run(g, RULES.fuse - 31);
    expect(g.balloons).toHaveLength(0); // the second balloon went off early
    expect(g.blasts).toHaveLength(2);
  });

  it('block the way, except for the player who was standing on them', () => {
    const g = makeGame();
    const [a, b] = [P(g, 'a'), P(g, 'b')];
    put(a, 5, 5);
    put(b, 7, 5);
    g.pushAction('a', 'b');
    g.step();
    g.setInput('a', 4, 0);
    run(g, 20);
    expect(a.x).toBeGreaterThan(tileCenter(5) + 30); // walked off
    g.setInput('a', 3, 0);
    run(g, 20);
    const edge = tileCenter(6) - (TILE - RULES.hitbox) / 2; // box flush against the balloon's tile
    expect(a.x).toBeGreaterThanOrEqual(edge - 0.1); // cannot walk back onto it
    g.setInput('b', 3, 0);
    run(g, 20);
    expect(b.x).toBeGreaterThanOrEqual(edge - 0.1); // b never could
  });
});

describe('trapped players', () => {
  function trapB(mode: Mode = 'ffa', teams?: number[], n = 2) {
    const g = makeGame({ mode, teams, n });
    const [a, b] = [P(g, 'a'), P(g, 'b')];
    put(a, 5, 5);
    g.pushAction('a', 'b');
    g.step();
    put(a, 0, 12);
    put(b, 6, 5);
    for (const p of g.players.slice(2)) put(p, 14, 12);
    run(g, RULES.fuse);
    expect(b.state).toBe(TRAPPED);
    return g;
  }

  it('pop when time runs out and the last side wins', () => {
    const g = trapB();
    run(g, RULES.trapped);
    expect(P(g, 'b').state).toBe(DEAD);
    expect(g.phase).toBe('over');
    expect(g.result?.winners).toEqual(['a']);
  });

  it('are popped by an opponent touching them', () => {
    const g = trapB();
    run(g, RULES.streamLinger);
    const a = P(g, 'a');
    put(a, 6, 5);
    a.y -= 20; // brushing the bubble from above
    g.step();
    expect(P(g, 'b').state).toBe(DEAD);
    expect(P(g, 'a').stats.kills).toBe(1);
  });

  it('are freed by a teammate touching them', () => {
    const g = trapB('team', [0, 1, 1], 3);
    run(g, RULES.streamLinger);
    const c = P(g, 'c');
    put(c, 6, 5);
    c.y += 20;
    g.step();
    expect(P(g, 'b').state).toBe(ALIVE);
    expect(P(g, 'c').stats.rescues).toBe(1);
  });

  it('get trapped again when the needle is used inside a lingering stream', () => {
    const g = trapB();
    const b = P(g, 'b');
    b.active = 'needle';
    b.activeN = 1;
    g.pushAction('b', 'u');
    g.step();
    g.step();
    expect(b.state).toBe(TRAPPED);
    expect(b.active).toBeNull();
  });

  it('escape with the needle once the stream is gone', () => {
    const g = trapB();
    const b = P(g, 'b');
    b.active = 'needle';
    b.activeN = 1;
    run(g, RULES.streamLinger + 1);
    g.pushAction('b', 'u');
    g.step();
    expect(b.state).toBe(ALIVE);
  });
});

describe('mounts', () => {
  it('absorb one hit and leave the rider free', () => {
    const g = makeGame();
    const [a, b] = [P(g, 'a'), P(g, 'b')];
    b.mount = 'turtle';
    put(a, 5, 5);
    g.pushAction('a', 'b');
    g.step();
    put(a, 0, 12);
    put(b, 6, 5);
    run(g, RULES.fuse + RULES.streamLinger + 2);
    expect(b.mount).toBeNull();
    expect(b.state).toBe(ALIVE);
  });

  /** a sets off two balloons in one chain reaction, both streams crossing (6,5) where b rides */
  function chainOnRider() {
    const g = makeGame();
    const [a, b] = [P(g, 'a'), P(g, 'b')];
    a.bal = 2;
    a.pow = 2;
    put(a, 5, 5);
    g.pushAction('a', 'b');
    g.step();
    put(a, 7, 5);
    g.pushAction('a', 'b');
    g.step();
    put(a, 0, 12);
    b.mount = 'owl';
    put(b, 6, 5);
    run(g, RULES.fuse - 1);
    expect(g.blasts).toHaveLength(2);
    return g;
  }

  it('leave the rider untouchable for a second, so a chain reaction counts as one hit', () => {
    const g = chainOnRider();
    const b = P(g, 'b');
    expect(b.mount).toBeNull();
    expect(b.state).toBe(ALIVE);
    expect(b.invulnT).toBeGreaterThan(RULES.mountInvuln - 5);
    run(g, RULES.streamLinger + 2);
    expect(b.state).toBe(ALIVE);
  });

  it('protect for one second only', () => {
    const g = chainOnRider();
    const [a, b] = [P(g, 'a'), P(g, 'b')];
    run(g, RULES.mountInvuln);
    expect(b.invulnT).toBe(0);
    put(a, 6, 6);
    g.pushAction('a', 'b');
    g.step();
    put(a, 0, 12);
    run(g, RULES.fuse);
    expect(b.state).toBe(TRAPPED);
  });
});

describe('shrink', () => {
  /** jumps the clock to `left` ticks before ring `ring` closes (rings before it already closed) */
  function nearShrink(g: Game, left: number) {
    g.timeLeft = RULES.shrinkStart - g.shrunk * RULES.shrinkEvery + left + 1;
  }

  it('warns, then closes the outer ring and crushes whoever is still on it', () => {
    const g = makeGame({ n: 3 });
    const [a, b, c] = [P(g, 'a'), P(g, 'b'), P(g, 'c')];
    put(a, 0, 5); // on ring 0
    put(b, 3, 3); // safe inside
    put(c, 1, 6); // inner edge, overlapping ring 0
    c.x -= 6;
    g.items[tileIndex(14, 6)] = 'potion';
    nearShrink(g, RULES.shrinkWarn);
    g.step();
    expect(g.snapshot().fx.some((f) => f.k === 'warn')).toBe(true);
    expect(g.shrinkIn()).toBe(RULES.shrinkWarn);
    run(g, RULES.shrinkWarn - 60);
    put(b, 0, 9);
    g.pushAction('b', 'b'); // a balloon on the ring, a second before it closes
    g.step();
    put(b, 3, 3);
    expect(g.balloons).toHaveLength(1);
    run(g, 59);
    expect(g.shrunk).toBe(1);
    expect(a.state).toBe(DEAD);
    expect(b.state).toBe(ALIVE);
    expect(c.state).toBe(ALIVE);
    expect(c.x).toBeGreaterThanOrEqual(TILE + RULES.hitbox / 2); // pushed off the closed tiles
    for (let i = 0; i < g.grid.length; i++) expect(g.grid[i] === '%').toBe(ringOf(i) === 0);
    expect(g.items[tileIndex(14, 6)]).toBeNull();
    expect(g.balloons).toHaveLength(0);
  });

  it('closes one ring every 10 seconds, four at most', () => {
    const g = makeGame();
    put(P(g, 'a'), 7, 6);
    put(P(g, 'b'), 7, 5);
    nearShrink(g, 0);
    g.step();
    for (let k = 1; k < RULES.shrinkRings; k++) {
      run(g, RULES.shrinkEvery - 1);
      expect(g.shrunk).toBe(k);
      g.step();
    }
    expect(g.shrunk).toBe(RULES.shrinkRings);
    expect(g.shrinkIn()).toBe(-1);
    expect(g.grid[tileIndex(7, 6)]).toBe('.');
    expect(g.grid.filter((t) => t === '%')).toHaveLength(15 * 13 - 7 * 5);
  });

  it('is off in rounds shorter than the schedule', () => {
    const infos: GamePlayerInfo[] = ['a', 'b'].map((id, k) => ({ id, name: id, char: 0, color: k, team: -1, slot: k }));
    const g = new Game(mapOf(), infos, { mode: 'ffa', time: 30, seed: 1 });
    expect(g.shrinkIn()).toBe(-1);
  });

  it('a balloon in the air over a closing ring lands on free floor', () => {
    const g = makeGame();
    const a = P(g, 'a');
    put(a, 5, 6);
    a.face = 3;
    a.glove = true;
    g.pushAction('a', 'b');
    g.step();
    g.pushAction('a', 'b'); // thrown three tiles left, onto (2,6); then (1,6)... ring 0 is (0,6)
    g.step();
    put(a, 7, 3);
    put(P(g, 'b'), 7, 7); // nobody on the ring, so the round goes on
    const b = g.balloons[0]!;
    b.fly!.tx = tileCenter(0); // aim it at the ring
    nearShrink(g, 0);
    run(g, RULES.throwTime + 2);
    expect(b.fly).toBeNull();
    expect(g.grid[tileIndex(Math.floor(b.x / TILE), Math.floor(b.y / TILE))]).toBe('.');
  });
});

describe('supply drops', () => {
  it('drop two basic items every 30 seconds onto free floor', () => {
    const g = makeGame();
    put(P(g, 'a'), 0, 0);
    put(P(g, 'b'), 14, 12);
    run(g, RULES.supplyEvery);
    expect(g.drops).toHaveLength(RULES.supplyCount);
    expect(g.snapshot().dr).toHaveLength(RULES.supplyCount);
    for (const d of g.drops) expect(SUPPLY_ITEMS).toContain(d.item);
    const tiles = g.drops.map((d) => d.tile);
    expect(new Set(tiles).size).toBe(tiles.length);
    run(g, RULES.supplyFall);
    expect(g.drops).toHaveLength(0);
    for (const i of tiles) expect(SUPPLY_ITEMS).toContain(g.items[i]);
    run(g, RULES.supplyEvery - RULES.supplyFall);
    expect(g.drops).toHaveLength(RULES.supplyCount); // the next ones are on their way
    expect(g.items.filter(Boolean)).toHaveLength(RULES.supplyCount);
  });
});

describe('balloon machine', () => {
  const machineRows = withTiles(
    [6, 7, 8].flatMap((c) => [5, 6, 7].map((r) => [c, r, 'M'] as [number, number, string])),
  );

  it('fires 4 to 8 balloons with 2-tile streams every 20 seconds', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const infos: GamePlayerInfo[] = ['a', 'b'].map((id, k) => ({ id, name: id, char: 0, color: k, team: -1, slot: k }));
      const g = new Game(mapOf(machineRows), infos, { mode: 'ffa', time: 180, seed });
      g.countdown = 1;
      g.step();
      expect(g.machine).toEqual({ c: 7, r: 6 });
      run(g, RULES.machineEvery - 1);
      expect(g.balloons).toHaveLength(0);
      g.step();
      const n = g.balloons.length;
      expect(n).toBeGreaterThanOrEqual(RULES.machineMin);
      expect(n).toBeLessThanOrEqual(RULES.machineMax);
      for (const b of g.balloons) {
        expect(b.owner).toBe('');
        expect(b.pow).toBe(RULES.machinePow);
        expect(b.fly).not.toBeNull();
      }
      run(g, TICK_RATE * 2);
      for (const b of g.balloons) {
        expect(b.fly).toBeNull();
        expect(g.grid[tileIndex(Math.floor(b.x / TILE), Math.floor(b.y / TILE))]).toBe('.');
      }
      expect(g.machineT).toBe(RULES.machineEvery - TICK_RATE * 2);
    }
  });

  it('blocks streams and players like a wall', () => {
    const infos: GamePlayerInfo[] = ['a', 'b'].map((id, k) => ({ id, name: id, char: 0, color: k, team: -1, slot: k }));
    const g = new Game(mapOf(machineRows), infos, { mode: 'ffa', time: 180, seed: 3 });
    g.countdown = 1;
    g.step();
    const a = P(g, 'a');
    put(a, 5, 6);
    a.pow = 3;
    g.pushAction('a', 'b');
    g.step();
    put(a, 5, 0);
    run(g, RULES.fuse);
    expect(g.blasts[0]!.arms[3]).toBe(0); // right arm stops at the machine
    run(g, RULES.streamLinger + 1);
    put(a, 5, 6);
    g.setInput('a', 4, 0);
    run(g, 30);
    expect(a.x).toBeLessThanOrEqual(tileCenter(5) + (TILE - RULES.hitbox) / 2 + 0.01);
  });
});

describe('items', () => {
  function pick(g: Game, p: Player, item: NonNullable<Game['items'][number]>) {
    g.items[tileIndex(p.tc, p.tr)] = item;
    g.step();
  }

  it('raise stats up to the character cap', () => {
    const g = makeGame();
    const a = P(g, 'a');
    put(a, 3, 3);
    for (let k = 0; k < 12; k++) pick(g, a, 'bubble');
    expect(a.bal).toBe(10);
    pick(g, a, 'ultra');
    expect(a.pow).toBe(7);
    pick(g, a, 'redDevil');
    expect(a.spd).toBe(7);
    expect(a.kick).toBe(true);
  });

  it('green devil takes one basic stat away and drops it nearby', () => {
    const g = makeGame();
    const a = P(g, 'a');
    put(a, 3, 3);
    pick(g, a, 'potion');
    expect(a.pow).toBe(2);
    pick(g, a, 'greenDevil');
    expect(a.pow).toBe(1);
    expect(g.items.filter((t) => t === 'potion')).toHaveLength(1);
  });

  it('scatter onto the field when a player is knocked out', () => {
    const g = makeGame();
    const b = P(g, 'b');
    put(b, 6, 5);
    pick(g, b, 'potion');
    pick(g, b, 'skate');
    b.state = TRAPPED;
    b.trapT = 1;
    g.step();
    expect(b.state).toBe(DEAD);
    expect(g.items.filter(Boolean)).toHaveLength(2);
  });
});

describe('movement', () => {
  it('slides around a corner into a gap', () => {
    // a wall row with a single gap at column 7
    const rows = withTiles(Array.from({ length: 15 }, (_, c) => [c, 4, c === 7 ? '.' : '#'] as [number, number, string]));
    const g = makeGame({ rows });
    const a = P(g, 'a');
    put(a, 7, 6);
    a.x += 12; // off the lane by 12 px
    g.setInput('a', 1, 0);
    run(g, 40);
    expect(a.y).toBeLessThan(tileCenter(4));
    // nudged into the gap; the 32 px box fits the 40 px gap with 4 px to spare
    expect(Math.abs(a.x - tileCenter(7))).toBeLessThanOrEqual((TILE - RULES.hitbox) / 2);
  });

  it('kicks a balloon until it hits a wall', () => {
    const g = makeGame({ rows: withTiles([[11, 5, '#']]) });
    const [a, b] = [P(g, 'a'), P(g, 'b')];
    put(b, 6, 5);
    g.pushAction('b', 'b');
    g.step();
    put(b, 14, 12);
    put(a, 5, 5);
    a.kick = true;
    g.setInput('a', 4, 0);
    run(g, 40);
    g.setInput('a', 0, 0);
    run(g, 30);
    expect(g.balloons[0]!.x).toBe(tileCenter(10));
  });

  it('falls back to the second held direction when the first is blocked', () => {
    const g = makeGame({ rows: withTiles([[5, 4, '#']]) });
    const a = P(g, 'a');
    put(a, 5, 5);
    g.setInput('a', 1 as Dir, 4 as Dir);
    run(g, 10);
    expect(a.x).toBeGreaterThan(tileCenter(5));
  });
});

describe('terrain', () => {
  it('ice keeps you sliding after you let go', () => {
    const rows = withTiles([3, 4, 5, 6, 7, 8].map((c) => [c, 5, '='] as [number, number, string]));
    const g = makeGame({ rows });
    const a = P(g, 'a');
    put(a, 2, 5);
    g.setInput('a', 4, 0);
    run(g, 12);
    g.setInput('a', 0, 0);
    run(g, 90);
    expect(a.x).toBeGreaterThan(tileCenter(8)); // slid off the far edge of the ice
    expect(a.slide).toBe(0);
  });

  it('conveyors carry balloons and players', () => {
    const rows = withTiles([5, 6, 7, 8].map((c) => [c, 5, '>'] as [number, number, string]));
    const g = makeGame({ rows });
    const [a, b] = [P(g, 'a'), P(g, 'b')];
    put(a, 5, 5);
    g.pushAction('a', 'b');
    g.step();
    put(a, 0, 12);
    run(g, 150);
    expect(g.balloons[0]!.x).toBe(tileCenter(9));
    put(b, 6, 7);
    g.grid[tileIndex(6, 7)] = '>';
    run(g, 30);
    expect(b.x).toBeGreaterThanOrEqual(tileCenter(6) + TILE / 2); // carried until it left the belt tile
  });

  it('portals send you to the point-symmetric portal', () => {
    const g = makeGame({ rows: withTiles([[3, 5, '@'], [11, 7, '@']]) });
    const a = P(g, 'a');
    put(a, 2, 5);
    g.setInput('a', 4, 0);
    run(g, 20);
    expect(a.tc).toBe(11);
    expect(a.tr).toBe(7);
  });

  it('barrels move one tile when pushed', () => {
    const g = makeGame({ rows: withTiles([[6, 5, 'o']]) });
    const a = P(g, 'a');
    put(a, 5, 5);
    g.setInput('a', 4, 0);
    run(g, 30);
    expect(g.grid[tileIndex(6, 5)]).toBe('.');
    expect(g.grid[tileIndex(7, 5)]).toBe('o');
  });

  it('a UFO flies over crates', () => {
    const g = makeGame({ rows: withTiles([[6, 5, 'x']]) });
    const a = P(g, 'a');
    a.mount = 'ufo';
    put(a, 5, 5);
    g.setInput('a', 4, 0);
    run(g, 20);
    expect(a.x).toBeGreaterThan(tileCenter(6));
  });
});

describe('active items', () => {
  it('banana makes an opponent slide until something stops them', () => {
    const g = makeGame({ rows: withTiles([[10, 5, '#']]) });
    const [a, b] = [P(g, 'a'), P(g, 'b')];
    put(a, 6, 5);
    a.active = 'banana';
    a.activeN = 1;
    g.pushAction('a', 'u');
    g.step();
    expect(g.bananas[tileIndex(6, 5)]).toBe(a.side);
    put(a, 0, 12);
    put(b, 4, 5);
    g.setInput('b', 4, 0);
    run(g, 30);
    g.setInput('b', 0, 0);
    run(g, 60);
    expect(g.bananas[tileIndex(6, 5)]).toBeNull();
    expect(b.tc).toBe(9);
  });

  it('a dart pops a balloon from afar', () => {
    const g = makeGame();
    const [a, b] = [P(g, 'a'), P(g, 'b')];
    put(b, 9, 5);
    g.pushAction('b', 'b');
    g.step();
    put(b, 14, 12);
    put(a, 3, 5);
    a.face = 4;
    a.active = 'dart';
    a.activeN = 3;
    g.pushAction('a', 'u');
    run(g, 30);
    expect(g.balloons).toHaveLength(0);
    expect(a.activeN).toBe(2);
  });

  it('springs jump over a crate, one charge per tile', () => {
    const g = makeGame({ rows: withTiles([[6, 5, 'x']]) });
    const a = P(g, 'a');
    put(a, 5, 5);
    a.face = 4;
    a.active = 'spring';
    a.activeN = 3;
    g.pushAction('a', 'u');
    run(g, RULES.springTime + 2);
    expect(a.tc).toBe(7);
    expect(a.activeN).toBe(1);
  });

  it('the glove throws your own balloon three tiles ahead', () => {
    const g = makeGame();
    const a = P(g, 'a');
    put(a, 5, 5);
    a.face = 4;
    a.glove = true;
    g.pushAction('a', 'b');
    g.step();
    g.pushAction('a', 'b');
    run(g, RULES.throwTime + 2);
    expect(g.balloons[0]!.x).toBe(tileCenter(8));
  });
});

describe('end of round', () => {
  it('is a draw when the last players go out together', () => {
    const g = makeGame();
    const [a, b] = [P(g, 'a'), P(g, 'b')];
    a.state = TRAPPED;
    b.state = TRAPPED;
    a.trapT = 1;
    b.trapT = 1;
    put(a, 1, 1);
    put(b, 10, 10);
    g.step();
    expect(g.result?.draw).toBe(true);
  });

  it('is a draw when time runs out', () => {
    const g = makeGame();
    put(P(g, 'a'), 1, 1);
    put(P(g, 'b'), 10, 10);
    g.timeLeft = 1;
    g.step();
    expect(g.result).toMatchObject({ draw: true, reason: 'time' });
  });
});

describe('every map', () => {
  it.each(MAPS.map((m) => [m.name, m] as const))('%s survives two minutes of random play', (_n, map) => {
    const infos: GamePlayerInfo[] = [0, 1, 2, 3].map((k) => ({
      id: `p${k}`,
      name: `P${k}`,
      char: k,
      color: k,
      team: k % 2,
      slot: k,
    }));
    const g = new Game(map, infos, { mode: 'team', time: 120, seed: map.id + 1 });
    let seed = 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let t = 0; t < 60 * 130 && g.phase !== 'over'; t++) {
      for (const p of infos) {
        if (rand() < 0.05) g.setInput(p.id, Math.floor(rand() * 5) as Dir, Math.floor(rand() * 5) as Dir);
        if (rand() < 0.02) g.pushAction(p.id, rand() < 0.8 ? 'b' : 'u');
      }
      g.step();
      const s = g.snapshot();
      for (const p of s.p) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(600);
      }
    }
    expect(g.phase).toBe('over');
  });
});
