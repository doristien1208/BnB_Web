import { COLS, RULES, TICK_RATE, TILE, sec, speedPx } from '../constants';
import { MOUNT_SPEED, type ItemType } from '../items';
import type { BotLevel } from '../protocol';
import { Rng } from '../rng';
import { DX, DY, OPPOSITE, type Dir } from '../types';
import {
  ALIVE,
  CONVEYOR,
  DEAD,
  TILE_COUNT,
  TRAPPED,
  inBounds,
  isFloorLike,
  isSolid,
  ringOf,
  tileCenter,
  tileIndex,
  tileOf,
  type Balloon,
  type Game,
  type Player,
} from './game';

interface Profile {
  /** ticks between decisions */
  think: number;
  /** ticks before it notices someone else's new balloon */
  react: number;
  /** ticks of safety it keeps around predicted streams */
  margin: number;
  /** chance per decision to drop a balloon when an opponent is in its stream */
  attack: number;
  /** follows chain reactions when predicting streams */
  chain: boolean;
  /** uses the needle when trapped */
  needle: boolean;
  /** steps it walks for an item or a trapped player */
  reach: number;
  /** ticks before a ring closes that it leaves the ring */
  shrinkLead: number;
  /** chance per decision to wander off instead */
  wander: number;
  /** checks whether an opponent can still get away, and always attacks when they cannot */
  plan: boolean;
}

const PROFILES: Record<BotLevel, Profile> = {
  0: { think: 12, react: 30, margin: 3, attack: 0.3, chain: false, needle: false, reach: 5, shrinkLead: RULES.shrinkWarn, wander: 0.2, plan: false },
  1: { think: 6, react: 12, margin: 5, attack: 0.6, chain: true, needle: true, reach: 9, shrinkLead: sec(5), wander: 0.05, plan: false },
  2: { think: 3, react: 4, margin: 6, attack: 0.9, chain: true, needle: true, reach: 14, shrinkLead: sec(7), wander: 0, plan: true },
};

const MAX_STEPS = 30;

/** Predicted streams plus a search over the tiles reachable from one start. */
class Plan {
  /** per tile: wet windows as [from, to, from, to, ...] in ticks from now */
  readonly wet: number[][] = Array.from({ length: TILE_COUNT }, () => []);
  readonly dist = new Int16Array(TILE_COUNT);
  readonly prev = new Int16Array(TILE_COUNT);
  /** ticks until the search could start moving (the player is stunned) */
  delay = 0;

  wetDuring(i: number, t0: number, t1: number, margin: number): boolean {
    const w = this.wet[i]!;
    for (let k = 0; k < w.length; k += 2) if (w[k]! - margin <= t1 && w[k + 1]! + margin >= t0) return true;
    return false;
  }

  /** Nothing will hit the tile from `from` on. */
  dryFrom(i: number, from: number, margin: number): boolean {
    const w = this.wet[i]!;
    for (let k = 1; k < w.length; k += 2) if (w[k]! + margin >= from) return false;
    return true;
  }

  /** First moment the tile gets wet (Infinity if never). */
  firstWet(i: number): number {
    const w = this.wet[i]!;
    let t = Infinity;
    for (let k = 0; k < w.length; k += 2) t = Math.min(t, w[k]!);
    return t;
  }

  path(to: number): number[] {
    if (to < 0 || this.dist[to]! < 0) return [];
    if (this.dist[to] === 0) return [to]; // stay: walk to the centre of the tile
    const out: number[] = [];
    for (let i = to; this.dist[i]! > 0; i = this.prev[i]!) out.push(i);
    return out.reverse();
  }
}

/**
 * Computer player. It reads the simulation directly (the server is authoritative, so there is nothing to
 * hide), predicts when every tile gets wet, and each decision picks one goal: run from streams, pop or
 * free a trapped player, attack, grab an item, break crates, or close in on an opponent. Between
 * decisions it steers along the chosen path with the same inputs a keyboard would send.
 */
export class Bot {
  private readonly prof: Profile;
  private readonly rng: Rng;
  private readonly base = new Plan();
  private readonly alt = new Plan();
  private readonly ground = new Uint8Array(TILE_COUNT);
  /** ticks until a balloon in the air lands on the tile (Infinity: none) */
  private readonly landAt = new Float64Array(TILE_COUNT);
  /** tick each balloon was first noticed: reaction time counts from when it appeared, thrown or not */
  private readonly seen = new Map<number, number>();
  private path: number[] = [];
  private escape: number[] = [];
  private placeAt = -1;
  private nextThink = 0;
  private lastX = 0;
  private lastY = 0;
  private stuck = 0;
  private d1: Dir = 0;
  private d2: Dir = 0;

  constructor(
    private readonly game: Game,
    readonly id: string,
    readonly level: BotLevel,
    seed: number,
  ) {
    this.prof = PROFILES[level];
    this.rng = new Rng(seed);
    this.nextThink = this.rng.int(this.prof.think); // bots don't all decide on the same tick
  }

  /** Call once per tick, before `game.step()`. */
  update(): void {
    const g = this.game;
    const p = g.byId(this.id);
    if (!p || p.state === DEAD || g.phase !== 'play') {
      this.send(0, 0);
      return;
    }
    const still = Math.abs(p.x - this.lastX) + Math.abs(p.y - this.lastY) < 0.05;
    this.stuck = this.d1 && still && !p.dismountT ? this.stuck + 1 : 0;
    this.lastX = p.x;
    this.lastY = p.y;
    if (this.stuck > 15) {
      // walking into something the plan did not expect: drop the plan, nudge sideways
      this.path = [];
      this.stuck = 0;
      this.nextThink = g.tick;
      const side = this.rng.pick([1, 2, 3, 4] as const);
      this.send(side, 0);
    }
    if (p.slide) {
      // on ice or a banana the controls do nothing until it stops; then it decides again at once
      this.send(0, 0);
      this.nextThink = g.tick + 1;
      return;
    }
    if (g.tick >= this.nextThink) {
      this.nextThink = g.tick + this.prof.think;
      this.think(p);
    }
    this.steer(p);
  }

  // ---------------------------------------------------------------- decisions

  private think(p: Player): void {
    const g = this.game;
    this.markGround();
    this.predict(this.base, null);
    const tpt = this.ticksPerTile(p);
    const here = tileIndex(tileOf(p.x), tileOf(p.y));
    const reg = tileIndex(p.tc, p.tr);
    this.search(this.base, p, here, tpt);
    if (p.state === TRAPPED) return this.trapped(p, here);

    // 1. streams (or a closing ring) are coming: go to the nearest tile that stays dry
    const m = this.prof.margin;
    if (!this.base.dryFrom(here, 0, m) || !this.base.dryFrom(reg, 0, m)) {
      const spot = this.safest(this.base, p, tpt);
      this.placeAt = -1;
      return this.go(spot >= 0 ? spot : this.leastBad(tpt));
    }
    // 2. a trapped player within reach: pop an opponent, free a teammate
    const trapped = this.trappedTarget(p, tpt);
    if (trapped >= 0) return this.go(trapped);
    // 3. an opponent stands in the stream of a balloon dropped right here
    if (this.canPlace(p) && this.attack(p, tpt)) return;
    // 4. arrived where it meant to break crates
    if (this.placeAt >= 0 && this.placeAt === reg && here === reg) {
      this.placeAt = -1;
      if (this.canPlace(p) && this.escapeAfter(p, reg, tpt)) return this.drop();
    }
    if (this.prof.wander && this.rng.next() < this.prof.wander) return this.go(this.randomSafe(p, tpt));
    // 5. items
    const item = this.itemTarget(p, tpt);
    if (item >= 0) return this.go(item);
    // 6. crates, until it is strong enough (or the round late enough) to go after people instead
    const near = this.approach(p, tpt);
    const hunt = near >= 0 && this.level > 0 && (g.tick > TICK_RATE * 60 || g.shrunk > 0 || (p.bal >= 3 && p.pow >= 3));
    if (!hunt && this.canPlace(p) && g.grid.includes('x')) {
      const spot = this.farmTarget(p, tpt);
      if (spot >= 0) {
        this.placeAt = spot;
        return this.go(spot);
      }
    }
    // 7. close in on the nearest opponent, ideally somewhere its stream would reach them
    this.go(near >= 0 ? near : here);
  }

  private trapped(p: Player, here: number): void {
    // the needle only helps once the stream that trapped it has gone, or it gets trapped again
    if (this.prof.needle && p.active === 'needle' && !this.base.wetDuring(here, 0, 4, 2)) {
      this.game.pushAction(this.id, 'u');
      return;
    }
    // drift toward a teammate who can free it
    const mate = this.game.players.find((q) => q !== p && q.state === ALIVE && q.side === p.side);
    this.path = mate ? this.base.path(tileIndex(tileOf(mate.x), tileOf(mate.y))).slice(0, 1) : [];
  }

  private go(tile: number): void {
    this.path = this.base.path(tile);
  }

  private drop(): void {
    this.game.pushAction(this.id, 'b');
    this.path = this.escape;
    this.placeAt = -1;
  }

  private canPlace(p: Player): boolean {
    if (p.dismountT > 0 || p.air) return false;
    const reg = tileIndex(p.tc, p.tr);
    if (!isFloorLike(this.game.grid[reg]) || this.ground[reg]) return false;
    let mine = 0;
    for (const b of this.game.balloons) if (b.owner === p.id) mine++;
    return mine < p.bal;
  }

  /** Drops a balloon when an opponent is in its stream and there is a way out afterwards. */
  private attack(p: Player, tpt: number): boolean {
    const g = this.game;
    const reg = tileIndex(p.tc, p.tr);
    const hit = new Set(this.stream(reg, p.pow));
    const inStream = (q: Player) => q.state === ALIVE && q.invulnT === 0 && hit.has(tileIndex(q.tc, q.tr));
    const foes = g.players.filter((q) => q.side !== p.side && inStream(q));
    if (!foes.length) return false;
    if (g.players.some((q) => q !== p && q.side === p.side && inStream(q))) return false; // would hit a teammate
    let chance = this.prof.attack;
    if (this.prof.plan) chance = foes.some((q) => !this.canFlee(q, reg, p.pow)) ? 1 : chance * 0.5;
    if (this.rng.next() >= chance || !this.escapeAfter(p, reg, tpt)) return false;
    this.drop();
    return true;
  }

  /** Would `q` still reach a dry tile if a balloon went down at `tile` now? */
  private canFlee(q: Player, tile: number, pow: number): boolean {
    this.predict(this.alt, { tile, pow });
    const from = tileIndex(tileOf(q.x), tileOf(q.y));
    const tpt = this.ticksPerTile(q);
    this.search(this.alt, q, from, tpt, tile);
    return this.safest(this.alt, q, tpt) >= 0;
  }

  /** Is there a dry tile to run to after dropping a balloon at `tile`? Leaves the route in `escape`. */
  private escapeAfter(p: Player, tile: number, tpt: number): boolean {
    this.predict(this.alt, { tile, pow: p.pow });
    this.search(this.alt, p, tile, tpt, tile);
    const spot = this.safest(this.alt, p, tpt);
    if (spot < 0 || spot === tile) return false;
    this.escape = this.alt.path(spot);
    return true;
  }

  private trappedTarget(p: Player, tpt: number): number {
    let best = -1;
    let bestD = Infinity;
    for (const q of this.game.players) {
      if (q === p || q.state !== TRAPPED) continue;
      const j = tileIndex(tileOf(q.x), tileOf(q.y));
      const d = this.base.dist[j]!;
      if (d < 0 || d > this.prof.reach) continue;
      if (this.base.delay + d * tpt + this.prof.margin >= q.trapT) continue; // too late either way
      if (d < bestD) {
        best = j;
        bestD = d;
      }
    }
    return best;
  }

  private itemTarget(p: Player, tpt: number): number {
    if (p.mount === 'ufo') return -1; // a UFO cannot pick items up
    const g = this.game;
    let best = -1;
    let bestScore = 0;
    const consider = (j: number, item: ItemType, lands: number) => {
      const d = this.base.dist[j]!;
      if (d < 0 || d > this.prof.reach) return;
      if (this.base.delay + d * tpt < lands - sec(1)) return; // would only stand there waiting
      const score = this.value(p, item) / (d + 1);
      if (score > bestScore) {
        best = j;
        bestScore = score;
      }
    };
    for (let j = 0; j < TILE_COUNT; j++) {
      const it = g.items[j];
      if (it) consider(j, it, 0);
    }
    if (this.level > 0) for (const d of g.drops) consider(d.tile, d.item, d.t);
    return best;
  }

  private value(p: Player, item: ItemType): number {
    switch (item) {
      case 'bubble':
        return p.bal < p.cap.bal ? 3 : 0;
      case 'potion':
        return p.pow < p.cap.pow ? 3 : 0;
      case 'ultra':
        return p.pow < p.cap.pow ? 4 : 0;
      case 'skate':
        return p.spd < p.cap.spd ? 2 : 0;
      case 'iceSkate':
        return p.spd < p.cap.spd ? 3 : 0;
      case 'redDevil':
        return p.spd < p.cap.spd || !p.kick ? 4 : 0;
      case 'shoe':
        return p.kick ? 0 : 1;
      case 'glove':
        return p.glove ? 0 : 0.5;
      case 'cloak':
        return 1;
      case 'needle':
        return 3;
      case 'dart':
      case 'spring':
      case 'banana':
        return p.active === 'needle' ? 0 : 0.5; // would replace the needle
      case 'devil':
      case 'greenDevil':
        return 0;
      default:
        return p.mount ? 0 : 3; // mounts: one free hit
    }
  }

  /** Best tile to drop a balloon that breaks crates: many crates, few steps, a way out. */
  private farmTarget(p: Player, tpt: number): number {
    const g = this.game;
    const m = this.prof.margin;
    const spots: [number, number][] = [];
    for (let j = 0; j < TILE_COUNT; j++) {
      const d = this.base.dist[j]!;
      if (d < 0 || d > 12 || this.ground[j] || !isFloorLike(g.grid[j])) continue;
      if (!this.base.dryFrom(j, this.base.delay + d * tpt, m)) continue;
      let crates = 0;
      for (const i of this.stream(j, p.pow)) {
        const t = g.grid[i];
        if ((t === 'x' || t === 'o') && !this.base.wet[i]!.length) crates++; // not already doomed
      }
      if (crates) spots.push([j, crates / (d + 2)]);
    }
    spots.sort((a, b) => b[1] - a[1]);
    for (const [j] of spots.slice(0, 3)) if (this.escapeAfter(p, j, tpt)) return j;
    return -1;
  }

  /** Tile to head for to get at the nearest opponent; -1 when none can be reached. */
  private approach(p: Player, tpt: number): number {
    const foes = this.game.players.filter((q) => q.state !== DEAD && q.side !== p.side);
    if (!foes.length) return -1;
    const m = this.prof.margin;
    const foeTiles = foes.map((q) => tileIndex(tileOf(q.x), tileOf(q.y)));
    let best = -1;
    let bestScore = Infinity;
    let bestGap = Infinity;
    for (let j = 0; j < TILE_COUNT; j++) {
      const d = this.base.dist[j]!;
      if (d < 0 || !this.base.dryFrom(j, this.base.delay + d * tpt, m)) continue;
      const c = j % COLS;
      const r = Math.floor(j / COLS);
      let gap = Infinity;
      for (const q of foes) gap = Math.min(gap, Math.abs(c - tileOf(q.x)) + Math.abs(r - tileOf(q.y)));
      if (gap > 8) continue;
      let score = gap * 3 + d;
      if (gap <= p.pow + 1 && this.level > 0) {
        const s = this.stream(j, p.pow);
        if (foeTiles.some((i) => s.includes(i))) score -= 6; // a balloon here would reach them
      }
      if (score < bestScore) {
        best = j;
        bestScore = score;
        bestGap = gap;
      }
    }
    return bestGap <= 8 ? best : -1;
  }

  private randomSafe(p: Player, tpt: number): number {
    const out: number[] = [];
    for (let j = 0; j < TILE_COUNT; j++) {
      const d = this.base.dist[j]!;
      if (d >= 1 && d <= 6 && this.base.dryFrom(j, this.base.delay + d * tpt, this.prof.margin)) out.push(j);
    }
    return out.length ? this.rng.pick(out) : tileIndex(tileOf(p.x), tileOf(p.y));
  }

  /** Nearest tile that stays dry, preferring open ones (dead ends get people trapped). */
  private safest(plan: Plan, p: Player, tpt: number): number {
    let best = -1;
    let bestScore = Infinity;
    for (let j = 0; j < TILE_COUNT; j++) {
      const d = plan.dist[j]!;
      if (d < 0 || !plan.dryFrom(j, plan.delay + d * tpt, this.prof.margin)) continue;
      let open = 0;
      const c = j % COLS;
      const r = Math.floor(j / COLS);
      for (let k = 1; k <= 4; k++) {
        const nc = c + DX[k]!;
        const nr = r + DY[k]!;
        if (inBounds(nc, nr) && !this.blocked(p, tileIndex(nc, nr))) open++;
      }
      const score = d * 10 - open * 3;
      if (score < bestScore) {
        best = j;
        bestScore = score;
      }
    }
    return best;
  }

  /** No dry tile in reach: the one that stays dry the longest. */
  private leastBad(tpt: number): number {
    let best = -1;
    let bestT = -Infinity;
    for (let j = 0; j < TILE_COUNT; j++) {
      const d = this.base.dist[j]!;
      if (d < 0) continue;
      const t = this.base.firstWet(j) - d * tpt * 0.5;
      if (t > bestT) {
        best = j;
        bestT = t;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- prediction

  private markGround(): void {
    const g = this.game;
    this.ground.fill(0);
    this.landAt.fill(Infinity);
    for (const b of g.balloons) {
      if (!this.seen.has(b.id)) this.seen.set(b.id, g.tick);
      if (!b.fly) this.ground[tileIndex(tileOf(b.x), tileOf(b.y))] = 1;
      else {
        const i = tileIndex(tileOf(b.fly.tx), tileOf(b.fly.ty));
        this.landAt[i] = Math.min(this.landAt[i]!, b.fly.total - b.fly.t);
      }
    }
    if (this.seen.size > 64) {
      const live = new Set(g.balloons.map((b) => b.id));
      for (const id of this.seen.keys()) if (!live.has(id)) this.seen.delete(id);
    }
  }

  /** When each tile gets wet: balloons (with chain reactions), streams still flowing, a closing ring. */
  private predict(plan: Plan, extra: { tile: number; pow: number } | null): void {
    const g = this.game;
    for (const w of plan.wet) w.length = 0;
    // each balloon: where it may be when it goes off (moving ones are uncertain by a tile) and when
    const bombs: { tiles: number[]; t: number }[] = [];
    const streams: number[][] = [];
    const add = (tiles: number[], pow: number, t: number) => {
      bombs.push({ tiles, t });
      streams.push([...new Set(tiles.flatMap((i) => this.stream(i, pow)))]);
    };
    for (const b of g.balloons) {
      if (b.owner !== this.id && g.tick - (this.seen.get(b.id) ?? g.tick) < this.prof.react) continue;
      if (b.fly) add([tileIndex(tileOf(b.fly.tx), tileOf(b.fly.ty))], b.pow, b.fly.total - b.fly.t + b.fuse);
      else add(this.restTiles(b), b.pow, Math.max(0, b.fuse));
    }
    if (extra) add([extra.tile], extra.pow, RULES.fuse);
    if (this.prof.chain) {
      // a stream that reaches another balloon sets it off at the same moment
      const done = new Array<boolean>(bombs.length).fill(false);
      for (let n = 0; n < bombs.length; n++) {
        let k = -1;
        for (let j = 0; j < bombs.length; j++) if (!done[j] && (k < 0 || bombs[j]!.t < bombs[k]!.t)) k = j;
        done[k] = true;
        const s = streams[k]!;
        const t = bombs[k]!.t;
        for (let j = 0; j < bombs.length; j++) {
          const o = bombs[j]!;
          if (!done[j] && o.t > t && o.tiles.some((i) => s.includes(i))) o.t = t;
        }
      }
    }
    bombs.forEach((b, k) => {
      for (const i of streams[k]!) plan.wet[i]!.push(b.t, b.t + RULES.streamLinger);
    });
    for (const bl of g.blasts) for (const i of bl.tiles) plan.wet[i]!.push(0, bl.t);
    const zt = g.shrinkIn();
    if (zt >= 0 && zt <= this.prof.shrinkLead) {
      for (let i = 0; i < TILE_COUNT; i++) if (ringOf(i) === g.shrunk) plan.wet[i]!.push(zt, Infinity);
    }
  }

  /** Where a balloon on the ground goes off: kicked ones slide until stopped, belts carry the rest. */
  private restTiles(b: Balloon): number[] {
    const grid = this.game.grid;
    const here = tileIndex(tileOf(b.x), tileOf(b.y));
    const next = (i: number, d: Dir) => {
      const c = (i % COLS) + DX[d]!;
      const r = Math.floor(i / COLS) + DY[d]!;
      const j = tileIndex(c, r);
      return inBounds(c, r) && isFloorLike(grid[j]) && !this.ground[j] ? j : -1;
    };
    if (b.move?.kind === 'kick') {
      let at = b.move.to;
      for (let n = next(at, b.move.dir); n >= 0; n = next(at, b.move.dir)) at = n;
      return [at];
    }
    if (!b.move && !CONVEYOR[grid[here] ?? '']) return [here];
    // on a belt: follow it for as long as the fuse burns
    const perTile = TILE / (RULES.conveyorSpeed / TICK_RATE);
    const path = [here];
    for (let at = here, k = 0; k <= b.fuse / perTile; k++) {
      const d = CONVEYOR[grid[at] ?? ''];
      const n = d ? next(at, d) : -1;
      if (n < 0 || path.includes(n)) break;
      path.push(n);
      at = n;
    }
    const k = Math.min(path.length - 1, Math.round(b.fuse / perTile));
    return path.slice(Math.max(0, k - 1), k + 2);
  }

  /** Tiles a balloon at `tile` would soak, the same way the simulation spreads a stream. */
  private stream(tile: number, pow: number): number[] {
    const grid = this.game.grid;
    const out = [tile];
    const c = tile % COLS;
    const r = Math.floor(tile / COLS);
    for (let d = 1; d <= 4; d++) {
      for (let k = 1; k <= pow; k++) {
        const cc = c + DX[d]! * k;
        const rr = r + DY[d]! * k;
        if (!inBounds(cc, rr)) break;
        const i = tileIndex(cc, rr);
        const t = grid[i];
        if (isSolid(t)) break;
        out.push(i);
        if (t === 'x' || t === 'o') break;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- movement

  private ticksPerTile(p: Player): number {
    if (p.state === TRAPPED) return TILE / (RULES.trappedSpeed / TICK_RATE);
    return TILE / (speedPx(p.mount ? MOUNT_SPEED[p.mount] : p.spd) / TICK_RATE);
  }

  private blocked(p: Player, j: number): boolean {
    const g = this.game;
    const t = g.grid[j];
    if (isSolid(t) || t === '@') return true; // portals: it would end up somewhere else
    if (p.mount !== 'ufo' && (t === 'x' || t === 'o' || t === '~')) return true;
    if (this.ground[j]) return true;
    const banana = g.bananas[j];
    if (banana !== null && banana !== undefined && banana !== p.side) return true;
    const it = g.items[j];
    return it === 'devil' || it === 'greenDevil';
  }

  /**
   * Shortest walks from `start` (in tiles) to every tile it can stop on, where every tile on the way is
   * dry while it passes. A move onto ice keeps sliding until a wall or the end of the ice, so on ice
   * one move can cover several tiles and only the tile it stops on counts as reached.
   */
  private search(plan: Plan, p: Player, start: number, tpt: number, extraBlock = -1): void {
    plan.dist.fill(-1);
    plan.dist[start] = 0;
    plan.prev[start] = -1;
    plan.delay = p.dismountT;
    const m = this.prof.margin;
    const grid = this.game.grid;
    const slides = p.mount !== 'ufo';
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q]!;
      const d = plan.dist[i]!;
      if (d >= MAX_STEPS) continue;
      for (let k = 1; k <= 4; k++) {
        let at = i;
        let steps = 0;
        for (;;) {
          const nc = (at % COLS) + DX[k]!;
          const nr = Math.floor(at / COLS) + DY[k]!;
          if (!inBounds(nc, nr)) break;
          const j = tileIndex(nc, nr);
          if (j === extraBlock || this.blocked(p, j)) break;
          const t = plan.delay + (d + steps + 1) * tpt;
          // a balloon lands there first and blocks it; or a stream: mid-slide there is no stopping
          if (t - tpt * 0.5 >= this.landAt[j]! || plan.wetDuring(j, t - tpt * 0.6, t + tpt * 0.6, m)) {
            if (steps && grid[at] === '=') at = i; // the slide would carry it into the stream: no move
            break;
          }
          at = j;
          steps++;
          if (!slides || grid[j] !== '=') break;
        }
        if (at === i) continue;
        const nd = d + steps;
        if (plan.dist[at]! >= 0 && plan.dist[at]! <= nd) continue;
        plan.dist[at] = nd;
        plan.prev[at] = i;
        queue.push(at);
      }
    }
  }

  /** Follows the path with the inputs a player would press: toward the next tile, lining up when blocked. */
  private steer(p: Player): void {
    const step = speedPx(p.mount ? MOUNT_SPEED[p.mount] : p.spd) / TICK_RATE;
    const grid = this.game.grid;
    while (this.path.length) {
      const t = this.path[0]!;
      const snap = grid[t] === '=' ? (TILE - RULES.hitbox) / 2 + 1 : Math.max(2, step * 0.6);
      if (Math.abs(p.x - tileCenter(t % COLS)) <= snap && Math.abs(p.y - tileCenter(Math.floor(t / COLS))) <= snap) {
        this.path.shift();
      } else break;
    }
    const t = this.path[0];
    if (t === undefined) {
      this.send(0, 0);
      return;
    }
    const tc = t % COLS;
    const tr = Math.floor(t / COLS);
    const cx = tileCenter(tc);
    const cy = tileCenter(tr);
    const c = tileOf(p.x);
    const r = tileOf(p.y);
    // line up with the lane before heading down it, as a player turns at a corner; cutting corners
    // lets the corner assist shift it into a neighbouring lane (on ice: a slide down the wrong one)
    const align = grid[tileIndex(c, r)] === '=' ? (TILE - RULES.hitbox) / 2 + 1 : Math.max(2, step / 2 + 0.1);
    let d1: Dir;
    let d2: Dir = 0;
    if (tc === c && tr !== r) {
      d1 = Math.abs(p.x - cx) > align ? (p.x < cx ? 4 : 3) : tr > r ? 2 : 1;
    } else if (tr === r && tc !== c) {
      d1 = Math.abs(p.y - cy) > align ? (p.y < cy ? 2 : 1) : tc > c ? 4 : 3;
    } else {
      const dx = cx - p.x;
      const dy = cy - p.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        d1 = dx > 0 ? 4 : 3;
        if (Math.abs(dy) > 1) d2 = dy > 0 ? 2 : 1;
      } else {
        d1 = dy > 0 ? 2 : 1;
        if (Math.abs(dx) > 1) d2 = dx > 0 ? 4 : 3;
      }
    }
    this.send(d1, d2);
  }

  private send(d1: Dir, d2: Dir): void {
    const p = this.game.byId(this.id);
    if (p?.curse === 'reverse' && this.level > 0) {
      // the devil swapped its controls; it knows, so it presses the other way
      d1 = OPPOSITE[d1] ?? 0;
      d2 = OPPOSITE[d2] ?? 0;
    }
    if (d1 === this.d1 && d2 === this.d2) return;
    this.d1 = d1;
    this.d2 = d2;
    this.game.setInput(this.id, d1, d2);
  }
}
