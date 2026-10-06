import { describe, expect, it } from 'vitest';
import { RULES, TICK_RATE } from '../shared/constants';
import { MAPS, type MapDef } from '../shared/maps';
import type { BotLevel, GamePlayerInfo, Mode, Rule } from '../shared/protocol';
import { Bot } from '../shared/sim/bot';
import { ALIVE, DEAD, Game, TRAPPED, tileCenter, type Player } from '../shared/sim/game';

const OPEN: MapDef = {
  id: 99,
  key: 'village',
  name: 'open',
  tag: '',
  stars: 1,
  desc: '',
  grid: ['1.............2', ...Array.from({ length: 11 }, () => '...............'), '3.............4'],
};

/** Players p0.. with the given bot levels (null = an idle player); runs bots before every step. */
function setup(
  map: MapDef,
  levels: (BotLevel | null)[],
  opts: { mode?: Mode; rule?: Rule; time?: number; seed?: number } = {},
) {
  const mode = opts.mode ?? 'ffa';
  const seed = opts.seed ?? 5;
  const infos: GamePlayerInfo[] = levels.map((_, k) => ({
    id: `p${k}`,
    name: `P${k}`,
    char: k % 6,
    color: k,
    team: mode === 'team' ? k % 2 : -1,
    slot: k,
  }));
  const g = new Game(map, infos, { mode, rule: opts.rule, time: opts.time ?? 180, seed });
  g.countdown = 1;
  g.step();
  const bots = levels.flatMap((lv, k) => (lv === null ? [] : [new Bot(g, `p${k}`, lv, seed * 10 + k)]));
  const tick = (n: number, each?: () => void) => {
    for (let i = 0; i < n && g.phase !== 'over'; i++) {
      each?.();
      for (const b of bots) b.update();
      g.step();
    }
  };
  return { g, tick, P: (k: number) => g.byId(`p${k}`)! };
}

function put(p: Player, c: number, r: number): void {
  p.x = tileCenter(c);
  p.y = tileCenter(r);
  p.tc = c;
  p.tr = r;
}

describe('computer players', () => {
  it.each([1, 2] as const)('level %i breaks crates and collects items without trapping itself', (level) => {
    for (const map of [MAPS[0]!, MAPS[6]!, MAPS[10]!]) {
      const { g, tick, P } = setup(map, [level, null], { time: 300, seed: 11 + map.id });
      const crates = g.grid.filter((t) => t === 'x').length;
      let traps = 0;
      tick(TICK_RATE * 60, () => {
        P(1).invulnT = 999; // the idle player cannot be hit, so the round goes on
        if (P(0).state === TRAPPED) traps++;
      });
      expect(traps, map.name).toBe(0);
      expect(crates - g.grid.filter((t) => t === 'x').length, map.name).toBeGreaterThan(15);
      expect(P(0).stats.items, map.name).toBeGreaterThan(2);
    }
  });

  it.each([0, 1, 2] as const)('level %i runs from a balloon dropped next to it', (level) => {
    const { tick, P, g } = setup(OPEN, [level, null]);
    put(P(0), 5, 5);
    put(P(1), 6, 5);
    P(1).pow = 3;
    g.pushAction('p1', 'b');
    tick(1);
    put(P(1), 14, 12);
    tick(RULES.fuse + RULES.streamLinger + 10);
    expect(P(0).state).toBe(ALIVE);
  });

  it('pops a trapped opponent within reach', () => {
    const { tick, P } = setup(OPEN, [2, null]);
    put(P(0), 4, 5);
    put(P(1), 9, 5);
    P(1).state = TRAPPED;
    P(1).trapT = RULES.trapped;
    tick(TICK_RATE * 2);
    expect(P(1).state).toBe(DEAD);
    expect(P(0).stats.kills).toBe(1);
  });

  it('frees a trapped teammate', () => {
    const { tick, P } = setup(OPEN, [2, null, null], { mode: 'team' });
    put(P(0), 4, 5);
    put(P(1), 14, 12); // the opponent
    put(P(2), 9, 5); // p2 is on p0's team
    P(2).state = TRAPPED;
    P(2).trapT = RULES.trapped;
    tick(TICK_RATE * 2, () => (P(1).invulnT = 999));
    expect(P(2).state).toBe(ALIVE);
    expect(P(0).stats.rescues).toBe(1);
  });

  it('uses its needle once the stream that trapped it is gone', () => {
    const { tick, P, g } = setup(OPEN, [2, null]);
    put(P(0), 6, 5);
    put(P(1), 5, 5);
    P(0).active = 'needle';
    P(0).activeN = 1;
    g.pushAction('p1', 'b');
    tick(1);
    put(P(1), 14, 12);
    P(0).invulnT = 0;
    // hold the bot in place until the balloon goes off
    tick(RULES.fuse, () => put(P(0), 6, 5));
    tick(RULES.streamLinger + 20);
    expect(P(0).state).toBe(ALIVE);
    expect(P(0).active).toBeNull();
  });

  it('makes no new decisions while an error has crashed its screen', () => {
    const { tick, P } = setup(OPEN, [2, null]);
    put(P(0), 4, 5);
    put(P(1), 9, 5);
    P(1).state = TRAPPED;
    P(1).trapT = RULES.trapped;
    P(0).crashT = RULES.codeCrash;
    tick(RULES.codeCrash - 1);
    expect([P(0).x, P(0).y]).toEqual([tileCenter(4), tileCenter(5)]);
    tick(TICK_RATE * 2);
    expect(P(1).state).toBe(DEAD);
  });

  it('leaves the outer ring before it closes', () => {
    const { tick, P, g } = setup(OPEN, [1, null]);
    put(P(0), 0, 6);
    put(P(1), 7, 6);
    g.timeLeft = RULES.shrinkStart + RULES.shrinkWarn + 2;
    tick(RULES.shrinkWarn + 5);
    expect(g.shrunk).toBe(1);
    expect(P(0).state).toBe(ALIVE);
  });

  it.each(MAPS.map((m) => [m.name, m] as const))('four computer players finish a round on %s', (_n, map) => {
    const { g, tick } = setup(map, [2, 1, 0, 2], { time: 120, seed: map.id + 3 });
    tick(TICK_RATE * 125);
    expect(g.phase).toBe('over');
    expect(g.result).not.toBeNull();
  });

  it('fires from a tank at an opponent down the line without catching itself', () => {
    const { g, tick, P } = setup(OPEN, [2, null]);
    put(P(0), 2, 5);
    put(P(1), 9, 5);
    P(0).mount = 'tank';
    P(0).face = 4;
    let fired = 0;
    tick(TICK_RATE * 6, () => {
      put(P(1), 9, 5); // the target stands still
      fired += g.balloons.filter((b) => b.owner === 'p0' && b.move?.kind === 'kick').length > 0 ? 1 : 0;
    });
    expect(fired).toBeGreaterThan(0);
    expect(P(0).state).toBe(ALIVE);
    expect(P(1).stats.deaths + (P(1).state === TRAPPED ? 1 : 0)).toBeGreaterThan(0);
  });

  it('four computer players keep at it through deathmatch rounds, and nobody stays down', () => {
    let respawns = 0;
    let kills = 0;
    for (const id of [0, 11, 12]) {
      const { g, tick } = setup(MAPS[id]!, [2, 1, 0, 2], { rule: 'deathmatch', time: 120, seed: id + 21 });
      let stuck = false;
      tick(TICK_RATE * 125, () => {
        respawns += g.players.filter((p) => p.state === DEAD && p.respawnT === 1).length;
        stuck ||= g.players.some((p) => p.state === DEAD && p.respawnT === 0 && !p.out);
      });
      expect(g.result?.reason, MAPS[id]!.name).toBe('time');
      expect(stuck, MAPS[id]!.name).toBe(false);
      kills += g.players.reduce((n, p) => n + p.stats.kills, 0);
    }
    expect(respawns).toBeGreaterThan(0);
    expect(kills).toBeGreaterThan(0);
  });
});
