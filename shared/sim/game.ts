import { COLS, ROWS, RULES, TICK_RATE, TILE, sec, speedPx } from '../constants';
import { CHARACTERS } from '../characters';
import {
  ITEMS,
  ITEM_TYPES,
  MOUNT_CODE,
  MOUNT_SPEED,
  SUPPLY_ITEMS,
  isActive,
  isMount,
  type ActiveType,
  type ItemType,
  type MountType,
} from '../items';
import type { MapDef } from '../maps';
import type { Fx, GamePlayerInfo, GameResult, Mode, PlayerStats, Rule, Snapshot } from '../protocol';
import { Rng } from '../rng';
import { DX, DY, OPPOSITE, type Dir } from '../types';

export const ALIVE = 0;
export const TRAPPED = 1;
export const DEAD = 2;
type PState = typeof ALIVE | typeof TRAPPED | typeof DEAD;

const HALF = RULES.hitbox / 2;
export const TILE_COUNT = COLS * ROWS;
export const tileIndex = (c: number, r: number) => r * COLS + c;
export const inBounds = (c: number, r: number) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
export const tileOf = (v: number) => Math.floor(v / TILE);
export const tileCenter = (t: number) => t * TILE + TILE / 2;
const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

export const CONVEYOR: Readonly<Partial<Record<string, Dir>>> = { '^': 1, v: 2, '<': 3, '>': 4 };
const FLOOR_LIKE = new Set(['.', '*', '=', '<', '>', '^', 'v', '@']);
/** Tiles a player can stand on and a balloon can sit on. */
export const isFloorLike = (t: string | undefined) => t !== undefined && FLOOR_LIKE.has(t);
/** Tiles nothing gets through, not even a UFO or a stream: walls, rings closed by the shrink, the machine. */
export const isSolid = (t: string | undefined) => t === undefined || t === '#' || t === '%' || t === 'M';
/** Shrink ring of a tile: 0 for the outermost ring, 1 for the next one in, ... */
export const ringOf = (i: number) => {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  return Math.min(c, r, COLS - 1 - c, ROWS - 1 - r);
};

/** Code regions of a map (程式碼空間): region index per tile (-1 = none), numbered by first appearance. */
export function codeRegions(map: MapDef): { of: Int8Array; count: number } {
  const of = new Int8Array(TILE_COUNT).fill(-1);
  const letters: string[] = [];
  map.regions?.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === '.' || !inBounds(c, r)) return;
      let k = letters.indexOf(ch);
      if (k < 0) k = letters.push(ch) - 1;
      of[tileIndex(c, r)] = k;
    }),
  );
  return { of, count: letters.length };
}

interface Flight {
  t: number;
  total: number;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
}

export interface Player {
  id: string;
  name: string;
  char: number;
  color: number;
  team: number;
  slot: number;
  /** players on the same side are teammates; in free-for-all every player is their own side */
  side: string;
  x: number;
  y: number;
  face: Dir;
  moving: boolean;
  /** registered tile: where balloons are placed and hits are judged (lags behind by the hysteresis) */
  tc: number;
  tr: number;
  state: PState;
  trapT: number;
  dismountT: number;
  /** streams pass through the player while this runs (set when a mount is knocked off) */
  invulnT: number;
  mount: MountType | null;
  bal: number;
  pow: number;
  spd: number;
  base: { bal: number; pow: number; spd: number };
  cap: { bal: number; pow: number; spd: number };
  kick: boolean;
  glove: boolean;
  /** stat items collected; scattered on death, one is spat out by the green devil */
  bag: ItemType[];
  curse: 'reverse' | 'auto' | null;
  curseT: number;
  cloakT: number;
  active: ActiveType | null;
  activeN: number;
  slide: Dir;
  slideIce: boolean;
  portalCd: number;
  air: Flight | null;
  pushT: number;
  pushDir: Dir;
  /** blocked tiles this player may still walk out of (after losing a UFO, a teleport, ...) */
  ghost: Set<number>;
  in1: Dir;
  in2: Dir;
  actions: ('b' | 'u')[];
  connected: boolean;
  dcT: number;
  stats: PlayerStats;
  /** deathmatch: ticks until a dead player comes back (0 = not coming back) */
  respawnT: number;
  /** where the player fell: deathmatch respawns them there */
  deathTile: number;
  /** left the round for good (left the room, or disconnected too long): never respawns */
  out: boolean;
  /** owner of the stream that trapped the player; '' for the balloon machine */
  trappedBy: string | null;
  /** pirate eyepatch: turtles and owls run faster */
  eyepatch: boolean;
  /** 程式碼空間: ticks the player's screen stays crashed, and the error that did it (each error crashes it once) */
  crashT: number;
  crashBy: number;
}

/** Speed level a player moves at: the mount's (an eyepatch speeds up turtles and owls), else their own. */
export function moveLevel(p: Player): number {
  if (!p.mount) return p.spd;
  const bonus = p.eyepatch && (p.mount === 'turtle' || p.mount === 'owl') ? RULES.eyepatchBonus : 0;
  return MOUNT_SPEED[p.mount] + bonus;
}

export interface Balloon {
  id: number;
  owner: string;
  x: number;
  y: number;
  fuse: number;
  pow: number;
  /** players allowed to overlap the balloon: whoever stood on the tile when it was placed */
  pass: Set<string>;
  move: { dir: Dir; speed: number; kind: 'kick' | 'belt'; to: number } | null;
  fly: Flight | null;
}

export interface Blast {
  id: number;
  /** the balloon's owner ('' = the balloon machine): who gets the kill in deathmatch */
  owner: string;
  c: number;
  r: number;
  arms: [number, number, number, number];
  tiles: Set<number>;
  t: number;
  /** players this blast already hit; a player is hit at most once per blast */
  hit: Set<string>;
  reveal: [number, ItemType][];
}

interface Dart {
  owner: string;
  start: number;
  x: number;
  y: number;
  dir: Dir;
}

/** A supply drop on its way down; it becomes a floor item when `t` runs out. */
export interface Drop {
  tile: number;
  item: ItemType;
  t: number;
}

/** A code region throwing an error: it slows everyone on it, and crashes the screen of each player it catches. */
export interface CodeError {
  id: number;
  region: number;
  t: number;
}

export interface GameOptions {
  mode: Mode;
  rule?: Rule;
  time: number;
  seed: number;
}

export class Game {
  readonly map: MapDef;
  readonly mode: Mode;
  readonly rule: Rule;
  grid: string[] = [];
  items: (ItemType | null)[];
  /** side of the player who laid the banana, or null */
  bananas: (string | null)[];
  players: Player[];
  balloons: Balloon[] = [];
  blasts: Blast[] = [];
  darts: Dart[] = [];
  drops: Drop[] = [];
  /** rings the shrink has closed so far */
  shrunk = 0;
  /** centre tile of the balloon machine, on maps that have one */
  readonly machine: { c: number; r: number } | null = null;
  /** ticks until the machine fires */
  machineT: number = RULES.machineEvery;
  /** code regions per tile (-1 = none) and how many there are; none outside 程式碼空間 */
  readonly regionOf: Int8Array;
  readonly regionCount: number;
  /** regions throwing an error right now */
  errors: CodeError[] = [];
  /** ticks until the next regions throw an error */
  errorT: number = RULES.codeStart;
  tick = 0;
  phase: 'countdown' | 'play' | 'over' = 'countdown';
  countdown: number = RULES.countdown;
  timeLeft: number;
  result: GameResult | null = null;

  private fx: Fx[] = [];
  private rng: Rng;
  private nextId = 1;
  private gridVersion = 0;
  private itemsVersion = 0;
  private sentGrid = -1;
  private sentItems = -1;
  private readonly dropRate: number;
  private readonly dropTable: [ItemType, number][];
  private readonly dropTotal: number;
  private readonly initialSides: number;
  /** rounds shorter than the shrink schedule never shrink */
  private readonly shrinkOn: boolean;
  /** ticks of play since the countdown ended */
  private played = 0;

  constructor(map: MapDef, infos: readonly GamePlayerInfo[], opts: GameOptions) {
    this.map = map;
    this.mode = opts.mode;
    this.rule = opts.rule ?? 'survival';
    this.rng = new Rng(opts.seed);
    this.timeLeft = opts.time * TICK_RATE;
    this.shrinkOn = this.timeLeft > RULES.shrinkStart + RULES.shrinkWarn;
    const spawns: [number, number][] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = map.grid[r]?.[c] ?? '#';
        if (ch >= '1' && ch <= '4') {
          spawns[Number(ch) - 1] = [c, r];
          this.grid.push('.');
        } else {
          this.grid.push(ch);
        }
      }
    }
    const machine = this.grid.flatMap((t, i) => (t === 'M' ? [i] : []));
    if (machine.length) {
      const avg = (f: (i: number) => number) => Math.round(machine.reduce((s, i) => s + f(i), 0) / machine.length);
      this.machine = { c: avg((i) => i % COLS), r: avg((i) => Math.floor(i / COLS)) };
    }
    this.items = new Array<ItemType | null>(TILE_COUNT).fill(null);
    for (const [c, r, t] of map.startItems ?? []) if (inBounds(c, r)) this.items[tileIndex(c, r)] = t;
    this.bananas = new Array<string | null>(TILE_COUNT).fill(null);
    const regions = codeRegions(map);
    this.regionOf = regions.of;
    this.regionCount = regions.count;
    this.dropRate = map.dropRate ?? RULES.dropRate;
    this.dropTable = ITEM_TYPES.map((t): [ItemType, number] => [t, map.weights?.[t] ?? ITEMS[t].weight]).filter(
      ([, w]) => w > 0,
    );
    this.dropTotal = this.dropTable.reduce((s, [, w]) => s + w, 0);
    const pos = this.assignSpawns(infos, spawns);
    this.players = infos.map((info, k) => this.makePlayer(info, pos[k] ?? [0, 0]));
    this.initialSides = new Set(this.players.map((p) => p.side)).size;
  }

  // ---------------------------------------------------------------- inputs

  setInput(id: string, d1: Dir, d2: Dir): void {
    const p = this.byId(id);
    if (!p) return;
    p.in1 = d1;
    p.in2 = d1 === d2 ? 0 : d2;
  }

  pushAction(id: string, a: 'b' | 'u'): void {
    const p = this.byId(id);
    if (p && p.actions.length < 4) p.actions.push(a);
  }

  setConnected(id: string, on: boolean): void {
    const p = this.byId(id);
    if (!p) return;
    p.connected = on;
    if (on) p.dcT = 0;
  }

  /** Player left the room mid-game. */
  forfeit(id: string): void {
    const p = this.byId(id);
    if (!p) return;
    p.connected = false;
    if (this.phase === 'over') return;
    if (p.state !== DEAD) this.kill(p, null, false, true);
    else p.respawnT = 0; // already down in deathmatch: they just don't come back
    p.out = true;
  }

  byId(id: string): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  // ---------------------------------------------------------------- main loop

  step(): void {
    if (this.phase === 'over') return;
    this.tick++;
    if (this.phase === 'countdown') {
      for (const p of this.players) p.actions.length = 0;
      if (--this.countdown <= 0) {
        this.phase = 'play';
        this.fx.push({ k: 'go' });
      }
      return;
    }
    this.timeLeft--;
    this.played++;
    this.updateShrink();
    this.updateErrors();
    this.updateRespawns();
    for (const p of this.players) this.updatePlayer(p);
    this.updateDarts();
    this.updateMachine();
    this.updateBalloons();
    this.explode();
    this.updateBlasts();
    this.updateSupply();
    this.updateTrapped();
    this.checkEnd();
  }

  /** Ticks until the next ring closes, or -1 when no ring will close any more. */
  shrinkIn(): number {
    if (!this.shrinkOn || this.shrunk >= RULES.shrinkRings) return -1;
    return Math.max(-1, this.timeLeft - (RULES.shrinkStart - this.shrunk * RULES.shrinkEvery));
  }

  snapshot(): Snapshot {
    const s: Snapshot = {
      k: this.tick,
      ph: this.phase === 'countdown' ? 0 : this.phase === 'play' ? 1 : 2,
      cd: this.countdown,
      tl: this.timeLeft,
      p: this.players.map((p) => ({
        i: p.id,
        x: round1(p.x),
        y: round1(p.y),
        f: p.face,
        m: p.moving ? 1 : 0,
        s: p.state,
        tt: p.trapT,
        dm: p.dismountT,
        mt: p.mount ? MOUNT_CODE[p.mount] : '',
        a: p.air ? round2(p.air.t / p.air.total) : 0,
        b: p.bal,
        w: p.pow,
        v: p.spd,
        k: p.kick ? 1 : 0,
        g: p.glove ? 1 : 0,
        it: p.active ? ITEMS[p.active].code : '',
        n: p.activeN,
        cu: p.curse === 'reverse' ? 'r' : p.curse === 'auto' ? 'a' : '',
        cl: p.cloakT,
        iv: p.invulnT,
        dc: p.connected ? 0 : 1,
        rs: p.respawnT,
        kl: p.stats.kills,
        dt: p.stats.deaths,
        ep: p.eyepatch ? 1 : 0,
        cr: p.crashT,
      })),
      b: this.balloons.map((b) => ({
        i: b.id,
        x: round1(b.x),
        y: round1(b.y),
        o: b.owner,
        f: b.fuse,
        z: b.fly ? round2(b.fly.t / b.fly.total) : 0,
      })),
      e: this.blasts.map((bl) => ({ i: bl.id, c: bl.c, r: bl.r, a: bl.arms, t: bl.t })),
      d: this.darts.map((d) => ({ x: round1(d.x), y: round1(d.y), d: d.dir })),
      n: this.bananaTiles(),
      zn: this.shrunk,
      zt: this.shrinkIn(),
      dr: this.drops.map((d): [number, string, number] => [d.tile, ITEMS[d.item].code, d.t]),
      fx: this.fx,
    };
    if (this.machine) s.mc = this.machineT;
    if (this.regionCount) s.ce = this.errors.map((e): [number, number] => [e.region, e.t]);
    this.fx = [];
    if (this.gridVersion !== this.sentGrid) {
      s.g = this.grid.join('');
      this.sentGrid = this.gridVersion;
    }
    if (this.itemsVersion !== this.sentItems) {
      s.i = this.encodeItems();
      this.sentItems = this.itemsVersion;
    }
    return s;
  }

  /** Grid and item layers for a client that (re)joins mid-game. */
  staticLayers(): { g: string; i: string } {
    return { g: this.grid.join(''), i: this.encodeItems() };
  }

  // ---------------------------------------------------------------- setup

  private assignSpawns(infos: readonly GamePlayerInfo[], spawns: [number, number][]): [number, number][] {
    // spawn indexes: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right
    if (this.mode === 'team') {
      const prefs = [
        [0, 2, 1, 3],
        [1, 3, 0, 2],
      ];
      const used = new Set<number>();
      const chosen: number[] = [];
      for (const k of this.rng.shuffle(infos.map((_, k) => k))) {
        const pref = prefs[infos[k]?.team === 1 ? 1 : 0] ?? [];
        const s = pref.find((s) => !used.has(s)) ?? 0;
        used.add(s);
        chosen[k] = s;
      }
      return chosen.map((s) => spawns[s] ?? [0, 0]);
    }
    const order = this.rng.shuffle([0, 1, 2, 3]);
    return infos.map((_, k) => spawns[order[k] ?? 0] ?? [0, 0]);
  }

  private makePlayer(info: GamePlayerInfo, [c, r]: [number, number]): Player {
    const ch = CHARACTERS[info.char] ?? CHARACTERS[0]!;
    return {
      id: info.id,
      name: info.name,
      char: info.char,
      color: info.color,
      team: info.team,
      slot: info.slot,
      side: this.mode === 'team' ? `team${info.team}` : info.id,
      x: tileCenter(c),
      y: tileCenter(r),
      face: 2,
      moving: false,
      tc: c,
      tr: r,
      state: ALIVE,
      trapT: 0,
      dismountT: 0,
      invulnT: 0,
      mount: null,
      bal: ch.bal[0],
      pow: ch.pow[0],
      spd: ch.spd[0],
      base: { bal: ch.bal[0], pow: ch.pow[0], spd: ch.spd[0] },
      cap: { bal: ch.bal[1], pow: ch.pow[1], spd: ch.spd[1] },
      kick: false,
      glove: false,
      bag: [],
      curse: null,
      curseT: 0,
      cloakT: 0,
      active: null,
      activeN: 0,
      slide: 0,
      slideIce: false,
      portalCd: 0,
      air: null,
      pushT: 0,
      pushDir: 0,
      ghost: new Set(),
      in1: 0,
      in2: 0,
      actions: [],
      connected: true,
      dcT: 0,
      stats: { kills: 0, deaths: 0, rescues: 0, trapped: 0, items: 0 },
      respawnT: 0,
      deathTile: tileIndex(c, r),
      out: false,
      trappedBy: null,
      eyepatch: false,
      crashT: 0,
      crashBy: 0,
    };
  }

  // ---------------------------------------------------------------- players

  private updatePlayer(p: Player): void {
    if (p.crashT > 0) p.crashT--;
    if (p.state === DEAD) return;
    if (p.portalCd > 0) p.portalCd--;
    if (p.invulnT > 0) p.invulnT--;
    if (!p.connected) {
      p.in1 = 0;
      p.in2 = 0;
      p.actions.length = 0;
      if (++p.dcT >= RULES.disconnectGrace) {
        this.kill(p, null, false, true);
        return;
      }
    }
    const actions = p.actions.splice(0);
    if (p.state === TRAPPED) {
      if (actions.includes('u') && p.active === 'needle') {
        this.useNeedle(p);
      } else if (p.in1) {
        this.unstick(p);
        this.moveDir(p, p.in1, RULES.trappedSpeed / TICK_RATE);
        this.afterMove(p);
      }
      return;
    }
    if (p.air) {
      this.updateJump(p);
      return;
    }
    if (p.dismountT > 0) {
      p.dismountT--;
      return;
    }
    for (const a of actions) {
      if (a === 'b') this.placeBalloon(p);
      else this.useActive(p);
    }
    if (p.curse) {
      if (p.curse === 'auto') this.placeBalloon(p);
      if (--p.curseT <= 0) p.curse = null;
    }
    if (p.cloakT > 0) p.cloakT--;

    this.unstick(p);
    const speed = (speedPx(moveLevel(p)) / TICK_RATE) * (this.slowed(p) ? RULES.codeSlow : 1);
    let d1 = p.in1;
    let d2 = p.in2;
    if (p.curse === 'reverse') {
      d1 = OPPOSITE[d1] ?? 0;
      d2 = OPPOSITE[d2] ?? 0;
    }
    let moved: Dir = 0;
    if (p.slide) {
      if (this.moveDir(p, p.slide, speed)) moved = p.slide;
      else {
        p.slide = 0;
        p.slideIce = false;
      }
      p.pushT = 0;
    } else {
      if (d1 && this.moveDir(p, d1, speed)) moved = d1;
      else if (d2 && this.moveDir(p, d2, speed)) moved = d2;
      if (!moved && d1) this.interactAhead(p, d1);
      else p.pushT = 0;
      if (moved) p.face = moved;
      else if (d1) p.face = d1;
    }
    p.moving = moved !== 0;

    const belt = CONVEYOR[this.tileUnder(p)];
    if (belt && p.mount !== 'ufo') this.moveDir(p, belt, RULES.conveyorSpeed / TICK_RATE);
    this.afterMove(p);

    const under = this.tileUnder(p);
    if (p.slideIce && under !== '=') {
      p.slide = 0;
      p.slideIce = false;
    } else if (!p.slide && under === '=' && moved && p.mount !== 'ufo') {
      p.slide = moved;
      p.slideIce = true;
    }
    this.checkBanana(p);
    this.checkPortal(p);
    this.pickup(p);
    this.catchError(p);
  }

  private tileUnder(p: Player): string {
    return this.grid[tileIndex(tileOf(p.x), tileOf(p.y))] ?? '#';
  }

  private afterMove(p: Player): void {
    this.updateTile(p);
    for (const i of p.ghost) if (!this.overlapsTile(p, i)) p.ghost.delete(i);
  }

  /** Registered tile changes only once the centre is clearly past the tile edge. */
  private updateTile(p: Player): void {
    const c = tileOf(p.x);
    const r = tileOf(p.y);
    if (c !== p.tc) {
      const past = c > p.tc ? p.x - c * TILE : p.tc * TILE - p.x;
      if (past >= RULES.tileHysteresis || Math.abs(c - p.tc) > 1) p.tc = c;
    }
    if (r !== p.tr) {
      const past = r > p.tr ? p.y - r * TILE : p.tr * TILE - p.y;
      if (past >= RULES.tileHysteresis || Math.abs(r - p.tr) > 1) p.tr = r;
    }
  }

  /** Safety net: if the player overlaps tiles that block them, let them walk out. */
  private unstick(p: Player): void {
    this.forBoxTiles(p.x, p.y, (c, r) => {
      if (this.blockedFor(p, c, r) && inBounds(c, r)) p.ghost.add(tileIndex(c, r));
    });
  }

  private forBoxTiles(x: number, y: number, fn: (c: number, r: number) => void): void {
    const c0 = tileOf(x - HALF);
    const c1 = tileOf(x + HALF - 0.001);
    const r0 = tileOf(y - HALF);
    const r1 = tileOf(y + HALF - 0.001);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fn(c, r);
  }

  private overlapsTile(p: Player, i: number): boolean {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    return (
      p.x + HALF > c * TILE && p.x - HALF < (c + 1) * TILE && p.y + HALF > r * TILE && p.y - HALF < (r + 1) * TILE
    );
  }

  private blockedFor(p: Player, c: number, r: number): boolean {
    if (!inBounds(c, r)) return true;
    const i = tileIndex(c, r);
    if (p.ghost.has(i)) return false;
    const t = this.grid[i];
    if (isSolid(t)) return true;
    if ((t === 'x' || t === 'o' || t === '~') && p.mount !== 'ufo') return true;
    const b = this.balloonAt(i);
    return !!b && !b.pass.has(p.id);
  }

  private boxBlocked(p: Player, x: number, y: number): boolean {
    let blocked = false;
    this.forBoxTiles(x, y, (c, r) => {
      if (!blocked && this.blockedFor(p, c, r)) blocked = true;
    });
    return blocked;
  }

  /** Moves along one axis with collision; slides around corners like the original. */
  private moveDir(p: Player, dir: Dir, dist: number): boolean {
    const dx = DX[dir] ?? 0;
    const dy = DY[dir] ?? 0;
    let left = dist;
    let moved = false;
    while (left > 1e-6) {
      const step = Math.min(left, 4);
      left -= step;
      if (!this.boxBlocked(p, p.x + dx * step, p.y + dy * step)) {
        p.x += dx * step;
        p.y += dy * step;
        moved = true;
        continue;
      }
      let lo = 0;
      let hi = step;
      for (let k = 0; k < 7; k++) {
        const mid = (lo + hi) / 2;
        if (this.boxBlocked(p, p.x + dx * mid, p.y + dy * mid)) hi = mid;
        else lo = mid;
      }
      if (lo > 0.01) {
        p.x += dx * lo;
        p.y += dy * lo;
        moved = true;
      }
      if (this.cornerAssist(p, dir, step - lo)) {
        moved = true;
        continue;
      }
      break;
    }
    return moved;
  }

  private cornerAssist(p: Player, dir: Dir, budget: number): boolean {
    if (budget <= 1e-6) return false;
    const horizontal = DX[dir] !== 0;
    const lanePos = horizontal ? p.y : p.x;
    const along = horizontal ? p.x : p.y;
    const sign = horizontal ? (DX[dir] ?? 0) : (DY[dir] ?? 0);
    const ahead = tileOf(along + sign * (HALF + 0.5));
    const l0 = tileOf(lanePos - HALF);
    const l1 = tileOf(lanePos + HALF - 0.001);
    const lc = tileOf(lanePos);
    for (const lane of lc === l0 ? [l0, l1] : [l1, l0]) {
      const c = horizontal ? ahead : lane;
      const r = horizontal ? lane : ahead;
      if (this.blockedFor(p, c, r)) continue;
      const diff = tileCenter(lane) - lanePos;
      if (Math.abs(diff) < 0.01) return false;
      const s = Math.sign(diff) * Math.min(Math.abs(diff), budget);
      const nx = horizontal ? p.x : p.x + s;
      const ny = horizontal ? p.y + s : p.y;
      if (this.boxBlocked(p, nx, ny)) return false;
      p.x = nx;
      p.y = ny;
      return true;
    }
    return false;
  }

  /** Walking into a balloon kicks it (with shoes); walking into a barrel pushes it. */
  private interactAhead(p: Player, d: Dir): void {
    const c = tileOf(p.x);
    const r = tileOf(p.y);
    const off = DX[d] !== 0 ? p.y - tileCenter(r) : p.x - tileCenter(c);
    const ac = c + (DX[d] ?? 0);
    const ar = r + (DY[d] ?? 0);
    if (Math.abs(off) > RULES.laneSnap || !inBounds(ac, ar)) {
      p.pushT = 0;
      return;
    }
    const ai = tileIndex(ac, ar);
    const b = this.balloonAt(ai);
    if (b) {
      p.pushT = 0;
      if (p.kick && !b.move && !b.pass.has(p.id)) this.kick(b, d, p);
      return;
    }
    if (this.grid[ai] === 'o' && p.mount !== 'ufo') {
      if (p.pushDir !== d) {
        p.pushDir = d;
        p.pushT = 0;
      }
      if (++p.pushT >= RULES.pushDelay) {
        p.pushT = 0;
        this.pushBarrel(ac, ar, d);
      }
      return;
    }
    p.pushT = 0;
  }

  private pushBarrel(c: number, r: number, d: Dir): void {
    const nc = c + (DX[d] ?? 0);
    const nr = r + (DY[d] ?? 0);
    if (!inBounds(nc, nr)) return;
    const to = tileIndex(nc, nr);
    if (this.grid[to] !== '.' || this.items[to] || this.bananas[to] !== null || this.balloonAt(to)) return;
    if (this.players.some((q) => q.state !== DEAD && this.overlapsTile(q, to))) return;
    this.grid[to] = 'o';
    this.grid[tileIndex(c, r)] = '.';
    this.gridVersion++;
    this.fx.push({ k: 'push', x: tileCenter(nc), y: tileCenter(nr) });
  }

  private updateJump(p: Player): void {
    const j = p.air;
    if (!j) return;
    j.t++;
    const f = Math.min(1, j.t / j.total);
    p.x = j.fx + (j.tx - j.fx) * f;
    p.y = j.fy + (j.ty - j.fy) * f;
    if (j.t >= j.total) {
      p.air = null;
      p.tc = tileOf(p.x);
      p.tr = tileOf(p.y);
      this.unstick(p);
      this.pickup(p);
    }
  }

  private checkBanana(p: Player): void {
    if (p.mount === 'ufo' || p.slide) return;
    const i = tileIndex(p.tc, p.tr);
    const side = this.bananas[i];
    if (side === null || side === undefined || side === p.side) return;
    if (Math.abs(p.x - tileCenter(p.tc)) > 10 || Math.abs(p.y - tileCenter(p.tr)) > 10) return;
    this.bananas[i] = null;
    p.slide = p.face || 2;
    p.slideIce = false;
    this.fx.push({ k: 'slip', id: p.id, x: p.x, y: p.y });
  }

  private checkPortal(p: Player): void {
    if (p.portalCd > 0) return;
    const c = tileOf(p.x);
    const r = tileOf(p.y);
    if (this.grid[tileIndex(c, r)] !== '@') return;
    if (Math.abs(p.x - tileCenter(c)) > 4 || Math.abs(p.y - tileCenter(r)) > 4) return;
    const tc = COLS - 1 - c;
    const tr = ROWS - 1 - r;
    if (this.grid[tileIndex(tc, tr)] !== '@') return;
    p.x = tileCenter(tc);
    p.y = tileCenter(tr);
    p.tc = tc;
    p.tr = tr;
    p.portalCd = RULES.portalCooldown;
    p.slide = 0;
    p.slideIce = false;
    this.unstick(p);
    this.fx.push({ k: 'portal', id: p.id, x: p.x, y: p.y });
  }

  private pickup(p: Player): void {
    if (p.state !== ALIVE || p.air || p.mount === 'ufo') return;
    const i = tileIndex(p.tc, p.tr);
    const it = this.items[i];
    if (!it) return;
    this.items[i] = null;
    this.itemsVersion++;
    this.applyItem(p, it);
  }

  private applyItem(p: Player, t: ItemType): void {
    switch (t) {
      case 'bubble':
        if (p.bal < p.cap.bal) {
          p.bal++;
          p.bag.push(t);
        }
        break;
      case 'potion':
        if (p.pow < p.cap.pow) {
          p.pow++;
          p.bag.push(t);
        }
        break;
      case 'skate':
        if (p.spd < p.cap.spd) {
          p.spd++;
          p.bag.push(t);
        }
        break;
      case 'ultra':
        p.pow = p.cap.pow;
        p.bag.push(t);
        break;
      case 'redDevil':
        p.spd = p.cap.spd;
        p.kick = true;
        p.bag.push(t);
        break;
      case 'iceSkate':
        p.spd = p.cap.spd;
        p.bag.push(t);
        break;
      case 'shoe':
        p.kick = true;
        p.bag.push(t);
        break;
      case 'glove':
        p.glove = true;
        p.bag.push(t);
        break;
      case 'eyepatch':
        if (!p.eyepatch) {
          p.eyepatch = true;
          p.bag.push(t);
        }
        break;
      case 'greenDevil':
        this.greenDevil(p);
        break;
      case 'devil':
        p.curse = this.rng.next() < 0.5 ? 'reverse' : 'auto';
        p.curseT = RULES.curse;
        break;
      case 'cloak':
        p.cloakT = RULES.cloak;
        break;
      default:
        if (isMount(t)) {
          p.mount = t;
          p.slide = 0;
          p.slideIce = false;
        } else if (isActive(t)) {
          const n = t === 'needle' ? 1 : t === 'banana' ? this.rng.pick([1, 3, 5]) : 3;
          if (p.active === t) p.activeN += n;
          else {
            p.active = t;
            p.activeN = n;
          }
        }
    }
    p.stats.items++;
    this.fx.push({ k: 'pick', id: p.id, item: ITEMS[t].code, x: p.x, y: p.y });
  }

  private greenDevil(p: Player): void {
    const basics: number[] = [];
    p.bag.forEach((t, k) => {
      if (t === 'bubble' || t === 'potion' || t === 'skate') basics.push(k);
    });
    if (!basics.length) return;
    const k = this.rng.pick(basics);
    const [t] = p.bag.splice(k, 1);
    if (t === 'bubble') p.bal = Math.max(p.base.bal, p.bal - 1);
    else if (t === 'potion') p.pow = Math.max(p.base.pow, p.pow - 1);
    else if (t === 'skate') p.spd = Math.max(p.base.spd, p.spd - 1);
    if (!t) return;
    const near: number[] = [];
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const c = p.tc + dc;
        const r = p.tr + dr;
        if ((dc || dr) && inBounds(c, r) && this.isEmptyFloor(tileIndex(c, r))) near.push(tileIndex(c, r));
      }
    }
    const spot = near.length ? this.rng.pick(near) : this.rng.pick(this.emptyTiles().concat([-1]));
    if (spot >= 0) {
      this.items[spot] = t;
      this.itemsVersion++;
    }
  }

  // ---------------------------------------------------------------- balloons

  private balloonTile(b: Balloon): number {
    return tileIndex(tileOf(b.x), tileOf(b.y));
  }

  private balloonAt(i: number): Balloon | undefined {
    return this.balloons.find((b) => !b.fly && this.balloonTile(b) === i);
  }

  /** Balloons a player may have out at once: a tank holds RULES.tankExtra more. */
  capacity(p: Player): number {
    return p.bal + (p.mount === 'tank' ? RULES.tankExtra : 0);
  }

  private placeBalloon(p: Player): void {
    if (p.state !== ALIVE || p.air || p.dismountT > 0) return;
    const i = tileIndex(p.tc, p.tr);
    if (!isFloorLike(this.grid[i])) return;
    const room = this.balloons.filter((b) => b.owner === p.id).length < this.capacity(p);
    if (p.mount === 'tank' && room && this.fire(p)) return;
    const existing = this.balloonAt(i);
    if (existing) {
      if (p.glove && existing.owner === p.id && existing.pass.has(p.id) && !existing.move) {
        this.throwBalloon(existing, p.face || 2, p);
      }
      return;
    }
    if (!room) return;
    const b: Balloon = {
      id: this.nextId++,
      owner: p.id,
      x: tileCenter(p.tc),
      y: tileCenter(p.tr),
      fuse: RULES.fuse,
      pow: p.pow,
      pass: new Set(),
      move: null,
      fly: null,
    };
    for (const q of this.players) if (q.state !== DEAD && this.overlapsTile(q, i)) b.pass.add(q.id);
    this.balloons.push(b);
    this.fx.push({ k: 'place', x: b.x, y: b.y, id: p.id });
  }

  /**
   * A tank fires: the balloon comes out on the tile in front and slides on like a kicked one (its fuse
   * waits until it stops). False when that tile is taken, so the balloon goes down under the tank instead.
   */
  private fire(p: Player): boolean {
    const d = p.face || 2;
    const c = p.tc + (DX[d] ?? 0);
    const r = p.tr + (DY[d] ?? 0);
    if (!inBounds(c, r)) return false;
    const i = tileIndex(c, r);
    if (!isFloorLike(this.grid[i]) || this.balloons.some((o) => !o.fly && (this.balloonTile(o) === i || o.move?.to === i))) {
      return false;
    }
    if (this.players.some((q) => q !== p && q.state !== DEAD && !q.air && this.overlapsTile(q, i))) return false;
    const b: Balloon = {
      id: this.nextId++,
      owner: p.id,
      x: tileCenter(c),
      y: tileCenter(r),
      fuse: RULES.fuse,
      pow: p.pow,
      pass: new Set(this.overlapsTile(p, i) ? [p.id] : []),
      move: null,
      fly: null,
    };
    this.balloons.push(b);
    const to = this.nextBalloonTile(b, c, r, d);
    if (to >= 0) b.move = { dir: d, speed: RULES.kickSpeed / TICK_RATE, kind: 'kick', to };
    this.fx.push({ k: 'fire', x: b.x, y: b.y, id: p.id });
    return true;
  }

  private kick(b: Balloon, d: Dir, p: Player): void {
    const to = this.nextBalloonTile(b, tileOf(b.x), tileOf(b.y), d);
    if (to < 0) return;
    b.move = { dir: d, speed: RULES.kickSpeed / TICK_RATE, kind: 'kick', to };
    this.fx.push({ k: 'kick', x: b.x, y: b.y, id: p.id });
  }

  /** Next tile a sliding balloon may enter, or -1 when something is in the way. */
  private nextBalloonTile(b: Balloon, c: number, r: number, d: Dir): number {
    const nc = c + (DX[d] ?? 0);
    const nr = r + (DY[d] ?? 0);
    if (!inBounds(nc, nr)) return -1;
    const i = tileIndex(nc, nr);
    if (!isFloorLike(this.grid[i])) return -1;
    if (this.balloons.some((o) => o !== b && !o.fly && (this.balloonTile(o) === i || o.move?.to === i))) return -1;
    if (this.players.some((q) => q.state !== DEAD && !q.air && this.overlapsTile(q, i))) return -1;
    return i;
  }

  private throwBalloon(b: Balloon, d: Dir, p: Player): void {
    const c = tileOf(b.x);
    const r = tileOf(b.y);
    for (let k = RULES.throwTiles; ; k++) {
      const nc = c + (DX[d] ?? 0) * k;
      const nr = r + (DY[d] ?? 0) * k;
      if (!inBounds(nc, nr)) return;
      const i = tileIndex(nc, nr);
      if (isFloorLike(this.grid[i]) && !this.balloonAt(i)) {
        b.fly = { t: 0, total: RULES.throwTime, fx: b.x, fy: b.y, tx: tileCenter(nc), ty: tileCenter(nr) };
        b.move = null;
        b.pass.clear();
        this.fx.push({ k: 'throw', id: p.id, x: b.x, y: b.y });
        return;
      }
    }
  }

  /** Returns false when there is nowhere to land (the balloon is lost). */
  private landBalloon(b: Balloon): boolean {
    const j = b.fly;
    if (!j) return true;
    b.fly = null;
    const dx = Math.sign(j.tx - j.fx);
    const dy = Math.sign(j.ty - j.fy);
    let c = tileOf(j.tx);
    let r = tileOf(j.ty);
    const free = (i: number) =>
      isFloorLike(this.grid[i]) && !this.balloons.some((o) => o !== b && !o.fly && this.balloonTile(o) === i);
    while (!free(tileIndex(c, r))) {
      if (!inBounds(c + dx, r + dy) || (dx === 0 && dy === 0)) break;
      c += dx;
      r += dy;
    }
    let i = tileIndex(c, r);
    if (!free(i)) {
      // e.g. the target was on a ring that closed mid-flight: bounce to the nearest free floor
      i = this.nearest(tileIndex(tileOf(j.tx), tileOf(j.ty)), free);
      if (i < 0) return false;
    }
    b.x = tileCenter(i % COLS);
    b.y = tileCenter(Math.floor(i / COLS));
    for (const q of this.players) if (q.state !== DEAD && this.overlapsTile(q, i)) b.pass.add(q.id);
    return true;
  }

  private updateBalloons(): void {
    const lost: Balloon[] = [];
    for (const b of this.balloons) {
      if (b.fly) {
        const j = b.fly;
        j.t++;
        const f = Math.min(1, j.t / j.total);
        b.x = j.fx + (j.tx - j.fx) * f;
        b.y = j.fy + (j.ty - j.fy) * f;
        if (j.t >= j.total && !this.landBalloon(b)) lost.push(b);
        continue; // the fuse waits while the balloon is in the air
      }
      if (b.move) this.advanceBalloon(b);
      else this.checkBelt(b);
      if (!b.move || b.move.kind === 'belt') b.fuse--; // a kicked balloon's fuse waits until it stops
      if (b.pass.size) {
        const i = this.balloonTile(b);
        for (const id of b.pass) {
          const q = this.byId(id);
          if (!q || q.state === DEAD || !this.overlapsTile(q, i)) b.pass.delete(id);
        }
      }
    }
    if (lost.length) this.balloons = this.balloons.filter((b) => !lost.includes(b));
  }

  private advanceBalloon(b: Balloon): void {
    const m = b.move;
    if (!m) return;
    const tx = tileCenter(m.to % COLS);
    const ty = tileCenter(Math.floor(m.to / COLS));
    if (Math.abs(tx - b.x) + Math.abs(ty - b.y) > m.speed) {
      b.x += (DX[m.dir] ?? 0) * m.speed;
      b.y += (DY[m.dir] ?? 0) * m.speed;
      return;
    }
    b.x = tx;
    b.y = ty;
    const c = tileOf(tx);
    const r = tileOf(ty);
    if (m.kind === 'kick') {
      const next = this.nextBalloonTile(b, c, r, m.dir);
      if (next < 0) b.move = null;
      else m.to = next;
      return;
    }
    const belt = CONVEYOR[this.grid[m.to] ?? '#'];
    if (!belt) {
      b.move = null;
      return;
    }
    m.dir = belt;
    const next = this.nextBalloonTile(b, c, r, belt);
    if (next < 0) b.move = null;
    else m.to = next;
  }

  private checkBelt(b: Balloon): void {
    const belt = CONVEYOR[this.grid[this.balloonTile(b)] ?? '#'];
    if (!belt) return;
    const next = this.nextBalloonTile(b, tileOf(b.x), tileOf(b.y), belt);
    if (next >= 0) b.move = { dir: belt, speed: RULES.conveyorSpeed / TICK_RATE, kind: 'belt', to: next };
  }

  // ---------------------------------------------------------------- active items

  private useActive(p: Player): void {
    if (!p.active || p.activeN <= 0 || p.active === 'needle') return; // the needle only works while trapped
    if (p.active === 'dart') {
      this.darts.push({ owner: p.id, start: tileIndex(p.tc, p.tr), x: p.x, y: p.y, dir: p.face || 2 });
      this.consume(p, 1);
      this.fx.push({ k: 'dart', id: p.id });
    } else if (p.active === 'banana') {
      const i = tileIndex(p.tc, p.tr);
      if (this.bananas[i] === null && isFloorLike(this.grid[i])) {
        this.bananas[i] = p.side;
        this.consume(p, 1);
        this.fx.push({ k: 'banana', id: p.id });
      }
    } else if (p.active === 'spring') {
      this.springJump(p);
    }
  }

  private consume(p: Player, n: number): void {
    p.activeN -= n;
    if (p.activeN <= 0) {
      p.active = null;
      p.activeN = 0;
    }
  }

  private useNeedle(p: Player): void {
    p.state = ALIVE;
    p.trapT = 0;
    p.trappedBy = null;
    this.consume(p, 1);
    // the stream lingers: a needle used too early gets you trapped again
    for (const bl of this.blasts) bl.hit.delete(p.id);
    this.fx.push({ k: 'needle', id: p.id });
  }

  private springJump(p: Player): void {
    const d = p.face || 2;
    for (let k = 1; k <= RULES.springMaxTiles; k++) {
      const c = p.tc + (DX[d] ?? 0) * k;
      const r = p.tr + (DY[d] ?? 0) * k;
      if (!inBounds(c, r)) return;
      const i = tileIndex(c, r);
      if (!isFloorLike(this.grid[i]) || this.balloonAt(i)) continue;
      if (p.activeN < k) return;
      this.consume(p, k);
      p.air = { t: 0, total: RULES.springTime, fx: p.x, fy: p.y, tx: tileCenter(c), ty: tileCenter(r) };
      p.slide = 0;
      p.slideIce = false;
      this.fx.push({ k: 'jump', id: p.id });
      return;
    }
  }

  private updateDarts(): void {
    const speed = RULES.dartSpeed / TICK_RATE;
    this.darts = this.darts.filter((d) => {
      for (let s = 0; s < speed; s += 5) {
        const step = Math.min(5, speed - s);
        d.x += (DX[d.dir] ?? 0) * step;
        d.y += (DY[d.dir] ?? 0) * step;
        const c = tileOf(d.x);
        const r = tileOf(d.y);
        if (!inBounds(c, r)) return false;
        const i = tileIndex(c, r);
        const t = this.grid[i];
        if (isSolid(t) || t === 'x' || t === 'o') return false;
        if (i === d.start) continue;
        const b = this.balloonAt(i);
        if (b) {
          b.fuse = 0;
          b.move = null;
          return false;
        }
      }
      return true;
    });
  }

  // ---------------------------------------------------------------- explosions

  private explode(): void {
    const queue = this.balloons.filter((b) => b.fuse <= 0 && !b.fly);
    if (!queue.length) return;
    const done = new Set<Balloon>();
    const breaks = new Map<number, Blast>();
    while (queue.length) {
      const b = queue.shift()!;
      if (done.has(b)) continue;
      done.add(b);
      const c = tileOf(b.x);
      const r = tileOf(b.y);
      const blast: Blast = {
        id: this.nextId++,
        owner: b.owner,
        c,
        r,
        arms: [0, 0, 0, 0],
        tiles: new Set([tileIndex(c, r)]),
        t: RULES.streamLinger,
        hit: new Set(),
        reveal: [],
      };
      for (let d = 1; d <= 4; d++) {
        for (let k = 1; k <= b.pow; k++) {
          const cc = c + (DX[d] ?? 0) * k;
          const rr = r + (DY[d] ?? 0) * k;
          if (!inBounds(cc, rr)) break;
          const i = tileIndex(cc, rr);
          const t = this.grid[i];
          if (isSolid(t)) break;
          blast.arms[d - 1] = k;
          blast.tiles.add(i);
          if (t === 'x' || t === 'o') {
            if (!breaks.has(i)) breaks.set(i, blast);
            break; // the stream stops at the first crate it breaks
          }
          for (const o of this.balloons) if (!done.has(o) && !o.fly && this.balloonTile(o) === i) queue.push(o);
        }
      }
      this.blasts.push(blast);
      this.fx.push({ k: 'boom', x: tileCenter(c), y: tileCenter(r), id: b.owner });
    }
    this.balloons = this.balloons.filter((b) => !done.has(b));
    for (const [i, blast] of breaks) {
      this.grid[i] = '.';
      this.gridVersion++;
      const item = this.rollDrop();
      if (item) blast.reveal.push([i, item]);
      this.fx.push({ k: 'break', x: tileCenter(i % COLS), y: tileCenter(Math.floor(i / COLS)) });
    }
  }

  private rollDrop(): ItemType | null {
    if (this.dropTotal <= 0 || this.rng.next() >= this.dropRate) return null;
    let roll = this.rng.next() * this.dropTotal;
    for (const [t, w] of this.dropTable) {
      roll -= w;
      if (roll < 0) return t;
    }
    return this.dropTable[this.dropTable.length - 1]?.[0] ?? null;
  }

  private updateBlasts(): void {
    for (const bl of this.blasts) {
      for (const i of bl.tiles) {
        if (this.items[i]) {
          this.items[i] = null; // streams wash away items lying on the floor
          this.itemsVersion++;
        }
      }
      for (const p of this.players) {
        if (p.state !== ALIVE || p.air || p.invulnT > 0 || bl.hit.has(p.id)) continue;
        if (!bl.tiles.has(tileIndex(p.tc, p.tr))) continue;
        bl.hit.add(p.id);
        if (p.mount) {
          // the rider falls off; the other streams of a chain reaction pass through them
          p.mount = null;
          p.dismountT = RULES.dismount;
          p.invulnT = RULES.mountInvuln;
          p.slide = 0;
          p.slideIce = false;
          this.unstick(p);
          this.fx.push({ k: 'dismount', id: p.id, x: p.x, y: p.y });
        } else {
          this.trap(p, bl.owner);
        }
      }
      bl.t--;
    }
    if (!this.blasts.some((bl) => bl.t <= 0)) return;
    const ended = this.blasts.filter((bl) => bl.t <= 0);
    this.blasts = this.blasts.filter((bl) => bl.t > 0);
    for (const bl of ended) {
      for (const [i, item] of bl.reveal) {
        if (this.items[i] || this.grid[i] !== '.') continue;
        this.items[i] = item; // items under a crate appear once its stream is gone
        this.itemsVersion++;
      }
    }
  }

  private trap(p: Player, by: string): void {
    p.state = TRAPPED;
    p.trapT = RULES.trapped;
    p.trappedBy = by;
    p.curse = null;
    p.curseT = 0;
    p.cloakT = 0;
    p.slide = 0;
    p.slideIce = false;
    p.pushT = 0;
    p.stats.trapped++;
    this.fx.push({ k: 'trap', id: p.id, x: p.x, y: p.y });
  }

  private updateTrapped(): void {
    for (const p of this.players) {
      if (p.state !== TRAPPED) continue;
      if (--p.trapT <= 0) {
        this.kill(p, this.trapCredit(p));
        continue;
      }
      for (const q of this.players) {
        if (q === p || q.state !== ALIVE || q.air) continue;
        if (Math.abs(q.x - p.x) >= RULES.touch || Math.abs(q.y - p.y) >= RULES.touch) continue;
        if (this.mode === 'team' && q.team === p.team) {
          p.state = ALIVE;
          p.trapT = 0;
          p.trappedBy = null;
          q.stats.rescues++;
          this.fx.push({ k: 'free', id: p.id, by: q.id, x: p.x, y: p.y });
        } else {
          this.kill(p, q);
        }
        break;
      }
    }
  }

  /**
   * Deathmatch: a bubble that bursts by itself counts for whoever's stream trapped the player, unless that
   * was themselves, a teammate or the balloon machine. Survival never credits a burst bubble.
   */
  private trapCredit(p: Player): Player | null {
    if (this.rule !== 'deathmatch' || !p.trappedBy) return null;
    const q = this.byId(p.trappedBy);
    return q && q !== p && q.side !== p.side ? q : null;
  }

  /** `permanent`: the player left (or stayed disconnected too long) and never respawns. */
  private kill(p: Player, by: Player | null, crushed = false, permanent = false): void {
    if (p.state === DEAD) return;
    p.state = DEAD;
    p.trapT = 0;
    p.trappedBy = null;
    p.mount = null;
    p.slide = 0;
    p.air = null;
    p.curse = null;
    p.cloakT = 0;
    p.invulnT = 0;
    p.stats.deaths++;
    p.deathTile = tileIndex(tileOf(p.x), tileOf(p.y));
    p.respawnT = this.rule === 'deathmatch' && !permanent ? RULES.respawn : 0;
    if (permanent || this.rule === 'survival') p.out = true;
    if (by) by.stats.kills++;
    this.fx.push({ k: crushed ? 'crush' : 'pop', id: p.id, by: by?.id, x: p.x, y: p.y });
    const spots = this.rng.shuffle(this.emptyTiles());
    for (const t of p.bag) {
      const i = spots.pop();
      if (i === undefined) break;
      this.items[i] = t;
    }
    if (p.bag.length) this.itemsVersion++;
    p.bag = [];
  }

  private checkEnd(): void {
    // survival: the last side standing; deathmatch: nobody stays down, so only leaving ends it early
    const sides = new Set(
      this.players.filter((p) => (this.rule === 'deathmatch' ? !p.out : p.state !== DEAD)).map((p) => p.side),
    );
    const ko = this.initialSides >= 2 ? sides.size <= 1 : sides.size === 0;
    if (!ko && this.timeLeft > 0) return;
    this.phase = 'over';
    let winner = ko && sides.size === 1 ? [...sides][0] : undefined;
    if (!ko && this.rule === 'deathmatch') winner = this.topSide();
    this.result = {
      draw: winner === undefined,
      winners: winner === undefined ? [] : this.players.filter((p) => p.side === winner).map((p) => p.id),
      reason: ko ? 'ko' : 'time',
      stats: Object.fromEntries(this.players.map((p) => [p.id, { ...p.stats }])),
    };
    this.fx.push({ k: 'end' });
  }

  /** Deathmatch at the bell: most kills (a team adds theirs up), then fewest deaths; still level = draw. */
  private topSide(): string | undefined {
    const score = new Map<string, { kills: number; deaths: number }>();
    for (const p of this.players) {
      const s = score.get(p.side) ?? { kills: 0, deaths: 0 };
      s.kills += p.stats.kills;
      s.deaths += p.stats.deaths;
      score.set(p.side, s);
    }
    const ranked = [...score].sort(([, a], [, b]) => b.kills - a.kills || a.deaths - b.deaths);
    const [first, second] = ranked;
    if (!first) return undefined;
    if (second && second[1].kills === first[1].kills && second[1].deaths === first[1].deaths) return undefined;
    return first[0];
  }

  // ---------------------------------------------------------------- deathmatch respawn

  private updateRespawns(): void {
    if (this.rule !== 'deathmatch') return;
    for (const p of this.players) {
      if (p.state === DEAD && p.respawnT > 0 && --p.respawnT === 0) this.respawn(p);
    }
  }

  /**
   * Back where they fell (or the nearest free floor when a balloon, a closing ring or an error is there),
   * with the character's starting stats and a moment in which no stream can trap them.
   */
  private respawn(p: Player): void {
    const closing = this.closingRing();
    const free = (i: number) =>
      isFloorLike(this.grid[i]) && !this.balloonAt(i) && ringOf(i) !== closing && !this.isError(i);
    const i = free(p.deathTile) ? p.deathTile : this.nearest(p.deathTile, free);
    if (i < 0) return;
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    Object.assign(p, {
      x: tileCenter(c),
      y: tileCenter(r),
      tc: c,
      tr: r,
      face: 2,
      moving: false,
      state: ALIVE,
      trapT: 0,
      trappedBy: null,
      dismountT: 0,
      invulnT: RULES.respawnInvuln,
      mount: null,
      bal: p.base.bal,
      pow: p.base.pow,
      spd: p.base.spd,
      kick: false,
      glove: false,
      eyepatch: false,
      bag: [],
      curse: null,
      curseT: 0,
      cloakT: 0,
      active: null,
      activeN: 0,
      slide: 0,
      slideIce: false,
      portalCd: 0,
      air: null,
      pushT: 0,
      ghost: new Set<number>(),
      crashT: 0,
    } satisfies Partial<Player>);
    this.unstick(p);
    this.fx.push({ k: 'respawn', id: p.id, x: p.x, y: p.y });
  }

  // ---------------------------------------------------------------- code regions

  /** Every few seconds 1–2 regions throw an error for three seconds, without warning. */
  private updateErrors(): void {
    if (!this.regionCount) return;
    for (const e of this.errors) e.t--;
    this.errors = this.errors.filter((e) => e.t > 0);
    if (--this.errorT > 0) return;
    this.errorT = RULES.codeEveryMin + this.rng.int(RULES.codeEveryMax - RULES.codeEveryMin + 1);
    const busy = new Set(this.errors.map((e) => e.region));
    const idle = Array.from({ length: this.regionCount }, (_, k) => k).filter((k) => !busy.has(k));
    const start = this.rng.shuffle(idle).slice(0, 1 + this.rng.int(2));
    for (const region of start) this.errors.push({ id: this.nextId++, region, t: RULES.codeError });
    if (start.length) this.fx.push({ k: 'glitch' });
  }

  /** The error a tile's region is throwing right now, if any. */
  errorAt(i: number): CodeError | undefined {
    const region = this.regionOf[i] ?? -1;
    return region < 0 ? undefined : this.errors.find((e) => e.region === region);
  }

  isError(i: number): boolean {
    return this.errorAt(i) !== undefined;
  }

  /** Standing on an error slows a player down; a UFO flies over it. */
  private slowed(p: Player): boolean {
    return this.regionCount > 0 && p.mount !== 'ufo' && this.isError(tileIndex(tileOf(p.x), tileOf(p.y)));
  }

  /** Walking onto an error, or one starting underfoot, crashes the player's screen: once per error. */
  private catchError(p: Player): void {
    if (!this.regionCount || p.mount === 'ufo') return;
    const e = this.errorAt(tileIndex(tileOf(p.x), tileOf(p.y)));
    if (!e || e.id === p.crashBy) return;
    p.crashBy = e.id;
    p.crashT = RULES.codeCrash;
    this.fx.push({ k: 'crash', id: p.id, x: p.x, y: p.y });
  }

  // ---------------------------------------------------------------- shrink

  private updateShrink(): void {
    const left = this.shrinkIn();
    if (left === RULES.shrinkWarn) this.fx.push({ k: 'warn' });
    if (left === 0) this.closeRing(this.shrunk++);
  }

  /** Ring `k` closes: blocks fall on it, and anything still standing there is crushed. */
  private closeRing(k: number): void {
    const ring = new Set<number>();
    for (let i = 0; i < TILE_COUNT; i++) if (ringOf(i) === k) ring.add(i);
    for (const i of ring) {
      this.grid[i] = '%';
      this.items[i] = null;
      this.bananas[i] = null;
    }
    this.gridVersion++;
    this.itemsVersion++;
    this.balloons = this.balloons.filter((b) => {
      if (b.fly) return true; // lands on free floor instead (landBalloon)
      if (ring.has(this.balloonTile(b))) return false;
      if (b.move && ring.has(b.move.to)) {
        b.move = null;
        b.x = tileCenter(tileOf(b.x));
        b.y = tileCenter(tileOf(b.y));
      }
      return true;
    });
    // the open area after this ring is gone, as limits for a player's centre
    const lo = (k + 1) * TILE + HALF;
    const hiX = (COLS - 1 - k) * TILE - HALF;
    const hiY = (ROWS - 1 - k) * TILE - HALF;
    for (const p of this.players) {
      if (p.state === DEAD) continue;
      const landing = p.air ? tileIndex(tileOf(p.air.tx), tileOf(p.air.ty)) : -1;
      if (ring.has(tileIndex(tileOf(p.x), tileOf(p.y))) || ring.has(landing)) {
        this.kill(p, null, true);
        continue;
      }
      // standing on the inner edge: the blocks push you fully inside
      p.x = Math.max(lo, Math.min(hiX, p.x));
      p.y = Math.max(lo, Math.min(hiY, p.y));
      if (ring.has(tileIndex(p.tc, p.tr))) {
        p.tc = tileOf(p.x);
        p.tr = tileOf(p.y);
      }
    }
    this.fx.push({ k: 'shrink' });
  }

  // ---------------------------------------------------------------- supply drops

  private updateSupply(): void {
    if (this.drops.length) {
      for (const d of this.drops) {
        if (--d.t > 0) continue;
        let i = d.tile;
        if (!this.isEmptyFloor(i)) i = this.rng.pick(this.openTiles().concat([-1])); // something got there first
        if (i < 0) continue;
        this.items[i] = d.item;
        this.itemsVersion++;
        this.fx.push({ k: 'land', x: tileCenter(i % COLS), y: tileCenter(Math.floor(i / COLS)) });
      }
      this.drops = this.drops.filter((d) => d.t > 0);
    }
    if (this.played % RULES.supplyEvery !== 0) return;
    const spots = this.rng.shuffle(this.openTiles());
    for (let k = 0; k < RULES.supplyCount && spots.length; k++) {
      this.drops.push({ tile: spots.pop()!, item: this.rng.pick(SUPPLY_ITEMS), t: RULES.supplyFall });
    }
    if (this.drops.length) this.fx.push({ k: 'supply' });
  }

  /**
   * Free floor for something falling from the sky: no item, balloon or player on it, not about to be
   * closed by the shrink, and not already promised to another drop or a balloon in the air.
   */
  private openTiles(): number[] {
    const closing = this.closingRing();
    const taken = new Set(this.drops.map((d) => d.tile));
    for (const b of this.balloons) if (b.fly) taken.add(tileIndex(tileOf(b.fly.tx), tileOf(b.fly.ty)));
    const out: number[] = [];
    for (let i = 0; i < TILE_COUNT; i++) {
      if (!this.isEmptyFloor(i) || taken.has(i) || ringOf(i) === closing) continue;
      if (this.players.some((p) => p.state !== DEAD && this.overlapsTile(p, i))) continue;
      out.push(i);
    }
    return out;
  }

  // ---------------------------------------------------------------- balloon machine

  private updateMachine(): void {
    const m = this.machine;
    if (!m || --this.machineT > 0) return;
    this.machineT = RULES.machineEvery;
    const n = RULES.machineMin + this.rng.int(RULES.machineMax - RULES.machineMin + 1);
    const spots = this.rng.shuffle(this.openTiles());
    const fx = tileCenter(m.c);
    const fy = tileCenter(m.r);
    for (let k = 0; k < n && spots.length; k++) {
      const i = spots.pop()!;
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      const total = sec(0.45) + Math.round(Math.hypot(c - m.c, r - m.r) * 3); // farther tiles fly longer
      this.balloons.push({
        id: this.nextId++,
        owner: '', // the machine's: nobody's balloon count
        x: fx,
        y: fy,
        fuse: RULES.fuse,
        pow: RULES.machinePow,
        pass: new Set(),
        move: null,
        fly: { t: 0, total, fx, fy, tx: tileCenter(c), ty: tileCenter(r) },
      });
    }
    this.fx.push({ k: 'spit', x: fx, y: fy });
  }

  // ---------------------------------------------------------------- helpers

  /** The ring the shrink is about to close (within its warning and a second more), or -1. */
  private closingRing(): number {
    const left = this.shrinkIn();
    return left >= 0 && left <= RULES.shrinkWarn + sec(1) ? this.shrunk : -1;
  }

  /** Closest tile (by steps on the grid) to `from` that passes `ok`, or -1. */
  private nearest(from: number, ok: (i: number) => boolean): number {
    const seen = new Set([from]);
    const queue = [from];
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k]!;
      if (ok(i)) return i;
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      for (let d = 1; d <= 4; d++) {
        const nc = c + (DX[d] ?? 0);
        const nr = r + (DY[d] ?? 0);
        const j = tileIndex(nc, nr);
        if (inBounds(nc, nr) && !seen.has(j)) {
          seen.add(j);
          queue.push(j);
        }
      }
    }
    return -1;
  }

  private isEmptyFloor(i: number): boolean {
    return this.grid[i] === '.' && !this.items[i] && this.bananas[i] === null && !this.balloonAt(i);
  }

  private emptyTiles(): number[] {
    const out: number[] = [];
    for (let i = 0; i < TILE_COUNT; i++) if (this.isEmptyFloor(i)) out.push(i);
    return out;
  }

  private bananaTiles(): number[] {
    const out: number[] = [];
    this.bananas.forEach((b, i) => {
      if (b !== null) out.push(i);
    });
    return out;
  }

  private encodeItems(): string {
    return this.items.map((t) => (t ? ITEMS[t].code : '.')).join('');
  }
}
