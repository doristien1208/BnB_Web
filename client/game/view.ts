import { CHARACTERS } from '../../shared/characters';
import { COLORS, TEAMS } from '../../shared/colors';
import { COLS, FIELD_H, FIELD_W, RULES, TICK_RATE, TILE, VIEW_H, VIEW_W } from '../../shared/constants';
import { ITEMS, ITEM_BY_CODE, MOUNT_BY_CODE } from '../../shared/items';
import { MAPS } from '../../shared/maps';
import {
  BOT_LEVELS,
  type C2S,
  type Fx,
  type GamePlayerInfo,
  type GameResult,
  type GameStartInfo,
  type SnapBalloon,
  type SnapBlast,
  type SnapPlayer,
  type Snapshot,
} from '../../shared/protocol';
import { ringOf } from '../../shared/sim/game';
import type { Audio } from '../audio';
import { h, isSubmitKey } from '../dom';
import { balloonSprite, bananaSprite, characterSprite, itemSprite, mountSprite } from './art';
import { Input } from './input';
import { Playback } from './playback';
import {
  THEMES,
  barrelSprite,
  bushSprite,
  closedSprite,
  conveyorSprite,
  floorSprite,
  hardSprite,
  hazardSprite,
  iceSprite,
  machineSprite,
  portalSprite,
  softSprite,
  waterSprite,
  type Theme,
} from './themes';

export const FONT = '"PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif';
const WORLD_EXTRA = 1.5; // everything else is drawn this much further back: smoother, and nobody notices
const MAX_EXTRAPOLATE = 2; // ticks motion carries on past the newest snapshot while the next one is late
const BELT: Record<string, number> = { '^': 1, v: 2, '<': 3, '>': 4 };
const MACHINE_BALLOON = 8; // balloon tag colour index with no player colour: the machine's balloons

/** Anything that can carry client messages: the WebSocket client, or the offline sandbox. */
export interface Link {
  send(m: C2S): void;
  readonly rtt: number;
}

interface Sample {
  a: Snapshot;
  b: Snapshot | null;
  f: number;
  /** when `b` is missing: the snapshot before `a`, and how many ticks past `a` to carry motion on */
  prev: Snapshot | null;
  ex: number;
}

interface Effect {
  kind: 'text' | 'splash';
  x: number;
  y: number;
  at: number;
  text?: string;
  color?: string;
}

interface ChatLine {
  name: string;
  text: string;
  at: number;
}

export class GameView {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly theme: Theme;
  private readonly floor: HTMLCanvasElement;
  private readonly darkness: HTMLCanvasElement;
  private readonly players = new Map<string, GamePlayerInfo>();
  private readonly me: GamePlayerInfo | undefined;
  private readonly input: Input;
  private readonly chatBox: HTMLInputElement;
  private readonly clock = new Playback();
  private readonly machine: { x: number; y: number } | null = null;
  private snaps: Snapshot[] = [];
  private pending: { k: number; f: Fx }[] = [];
  private grid = '';
  private items = '';
  private shownGrid = '';
  private closedAt = new Map<number, number>();
  private raf = 0;
  private scale = 1;
  private effects: Effect[] = [];
  private chatLines: ChatLine[] = [];
  private result: GameResult | null = null;
  private resultAt = 0;
  private goAt = 0;
  private bannerAt = 0;
  private banner = '';
  private shakeAt = 0;
  private spitAt = 0;
  private lastSecond = -1;
  private lastWarnSecond = -1;
  private lastBoom = 0;
  private overlay: HTMLElement | null = null;
  private destroyed = false;

  constructor(
    private readonly info: GameStartInfo,
    meId: string,
    private readonly net: Link,
    private readonly audio: Audio,
  ) {
    const map = MAPS[info.map] ?? MAPS[0]!;
    this.theme = THEMES[map.key];
    for (const p of info.players) this.players.set(p.id, p);
    this.me = this.players.get(meId);
    const machine = map.grid.flatMap((row, r) => [...row].flatMap((t, c) => (t === 'M' ? [[c, r] as const] : [])));
    if (machine.length) {
      const avg = (k: 0 | 1) => machine.reduce((s, m) => s + m[k], 0) / machine.length;
      this.machine = { x: avg(0) * TILE + TILE / 2, y: avg(1) * TILE + TILE / 2 };
    }

    this.canvas = h('canvas', { class: 'game-canvas' });
    this.ctx = this.canvas.getContext('2d')!;
    this.chatBox = h('input', { class: 'game-chat', maxLength: 100, placeholder: '輸入訊息，Enter 送出，Esc 取消' });
    this.root = h('div', { class: 'game' }, this.canvas, this.chatBox);

    this.floor = document.createElement('canvas');
    this.floor.width = FIELD_W;
    this.floor.height = FIELD_H;
    const fctx = this.floor.getContext('2d')!;
    fctx.imageSmoothingEnabled = false;
    for (let r = 0; r < FIELD_H / TILE; r++) {
      for (let c = 0; c < COLS; c++) {
        fctx.drawImage(floorSprite(map.key, (r + c) % 2 === 0, (c * 7 + r * 3) % 4), c * TILE, r * TILE, TILE, TILE);
      }
    }
    this.darkness = document.createElement('canvas');
    this.darkness.width = FIELD_W;
    this.darkness.height = FIELD_H;

    this.input = new Input(
      (d1, d2) => this.net.send({ t: 'in', d: d1, d2 }),
      (a) => this.net.send({ t: 'act', a }),
    );
    window.addEventListener('keydown', this.onKey);
    window.onbeforeunload = (e) => {
      e.preventDefault();
      return '';
    };
    this.audio.startMusic(this.theme.music);
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    window.removeEventListener('keydown', this.onKey);
    window.onbeforeunload = null;
    this.audio.stopMusic();
    this.root.remove();
  }

  onSnap(s: Snapshot): void {
    // grid and items only come when they change; every snapshot keeps the layers that were current,
    // so a crate disappears when its stream is drawn, not when the packet arrives
    if (s.g) this.grid = s.g;
    else s.g = this.grid;
    if (s.i) this.items = s.i;
    else s.i = this.items;
    this.clock.observe(s.k, performance.now());
    this.snaps.push(s);
    if (this.snaps.length > 90) this.snaps.splice(0, this.snaps.length - 90);
    for (const f of s.fx) this.pending.push({ k: s.k, f });
    if (s.ph === 0) {
      const sec = Math.ceil(s.cd / TICK_RATE);
      if (sec !== this.lastSecond) {
        this.lastSecond = sec;
        this.audio.play('beep');
      }
    }
  }

  onEnd(result: GameResult): void {
    this.result = result;
    this.resultAt = performance.now();
    const won = !!this.me && result.winners.includes(this.me.id);
    this.audio.stopMusic();
    this.audio.play(won ? 'win' : result.draw ? 'beep' : 'lose');
    window.onbeforeunload = null;
    window.setTimeout(() => this.showResults(), 1400);
  }

  addChat(name: string, text: string): void {
    this.chatLines.push({ name, text, at: performance.now() });
    if (this.chatLines.length > 6) this.chatLines.shift();
  }

  // ---------------------------------------------------------------- events

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Enter') {
      if (document.activeElement === this.chatBox) {
        if (!isSubmitKey(e)) return; // Enter that confirms a Chinese IME composition
        e.preventDefault();
        const text = this.chatBox.value.trim();
        if (text) this.net.send({ t: 'chat', text });
        this.closeChat();
      } else {
        e.preventDefault();
        this.input.reset();
        this.input.enabled = false;
        this.chatBox.value = '';
        this.chatBox.classList.add('open');
        this.chatBox.focus();
      }
    } else if (e.code === 'Escape' && document.activeElement === this.chatBox) {
      this.closeChat();
    } else if (e.code === 'KeyM' && document.activeElement !== this.chatBox) {
      const on = this.audio.toggleMusic();
      if (on !== this.audio.sfxOn) this.audio.toggleSfx();
    }
  };

  private closeChat(): void {
    this.chatBox.value = '';
    this.chatBox.classList.remove('open');
    this.chatBox.blur();
    this.input.enabled = true;
  }

  private handleFx(f: Fx, tick: number): void {
    const x = f.x ?? 0;
    const y = f.y ?? 0;
    const now = performance.now();
    const mine = !!this.me && f.id === this.me.id;
    switch (f.k) {
      case 'go':
        this.goAt = now;
        this.audio.play('go');
        break;
      case 'place':
        this.audio.play('place');
        break;
      case 'boom':
        if (tick !== this.lastBoom) this.audio.play('boom');
        this.lastBoom = tick;
        break;
      case 'break':
        this.effects.push({ kind: 'splash', x, y, at: now, color: '#c58b55' });
        break;
      case 'trap':
        this.audio.play('trap');
        break;
      case 'free':
        this.audio.play('free');
        this.effects.push({ kind: 'text', x, y: y - 40, at: now, text: '救援！', color: '#69f0ae' });
        break;
      case 'needle':
        this.audio.play('free');
        break;
      case 'pop':
        this.audio.play('pop');
        this.effects.push({ kind: 'splash', x, y, at: now, color: '#8fd0ff' });
        if (f.by) this.effects.push({ kind: 'text', x, y: y - 40, at: now, text: '擊破！', color: '#ff8a80' });
        break;
      case 'crush':
        this.effects.push({ kind: 'splash', x, y, at: now, color: '#f2c230' });
        this.effects.push({ kind: 'text', x, y: y - 40, at: now, text: '壓扁！', color: '#ffcc80' });
        break;
      case 'pick': {
        const t = ITEM_BY_CODE[f.item ?? ''];
        if (mine && t) {
          this.audio.play('pick');
          this.effects.push({ kind: 'text', x, y: y - 40, at: now, text: ITEMS[t].name, color: '#fff59d' });
        }
        break;
      }
      case 'kick':
      case 'throw':
      case 'push':
        this.audio.play('kick');
        break;
      case 'dart':
        this.audio.play('dart');
        break;
      case 'banana':
        this.audio.play('click');
        break;
      case 'slip':
        this.audio.play('slip');
        break;
      case 'jump':
        this.audio.play('jump');
        break;
      case 'dismount':
        this.audio.play('kick');
        this.effects.push({ kind: 'text', x, y: y - 40, at: now, text: '坐騎掉了', color: '#ffe082' });
        break;
      case 'portal':
        this.audio.play('portal');
        break;
      case 'warn':
        this.audio.play('siren');
        this.showBanner('縮圈警告！', now);
        break;
      case 'shrink':
        this.shakeAt = now + 230; // the blocks take a moment to fall
        window.setTimeout(() => this.audio.play('thud'), 230);
        break;
      case 'supply':
        this.audio.play('chime');
        this.showBanner('物資補給！', now);
        break;
      case 'land':
        this.effects.push({ kind: 'splash', x, y, at: now, color: '#ffe082' });
        break;
      case 'spit':
        this.spitAt = now;
        this.audio.play('whoosh');
        break;
      case 'end':
        break;
    }
  }

  private showBanner(text: string, now: number): void {
    this.banner = text;
    this.bannerAt = now;
  }

  private showResults(): void {
    if (this.destroyed || !this.result) return;
    const r = this.result;
    const me = this.me;
    const won = !!me && r.winners.includes(me.id);
    const title = r.draw ? '平手' : won ? '勝利！' : '落敗…';
    const rows = [...this.info.players]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => {
        const st = r.stats[p.id] ?? { kills: 0, rescues: 0, trapped: 0, items: 0 };
        const ch = CHARACTERS[p.char]!;
        return h(
          'tr',
          { class: r.winners.includes(p.id) ? 'win' : '' },
          h('td', null, `P${p.slot + 1}`),
          h('td', null, p.name, p.id === me?.id ? '（你）' : p.bot !== undefined ? `（${BOT_LEVELS[p.bot]}）` : ''),
          h('td', null, `${ch.animal}${ch.name}`),
          h('td', null, String(st.kills)),
          h('td', null, String(st.rescues)),
          h('td', null, String(st.trapped)),
          h('td', null, String(st.items)),
        );
      });
    this.overlay = h(
      'div',
      { class: 'results' },
      h(
        'div',
        { class: 'results-card' },
        h('h2', { class: r.draw ? 'draw' : won ? 'win' : 'lose' }, title),
        h('p', { class: 'muted' }, r.reason === 'time' ? '時間到' : '全員擊倒'),
        h(
          'table',
          null,
          h(
            'thead',
            null,
            h('tr', null, ...['', '玩家', '角色', '擊破', '救援', '被困', '道具'].map((t) => h('th', null, t))),
          ),
          h('tbody', null, rows),
        ),
        h('p', { class: 'muted' }, '稍後自動回到候機室'),
        h('button', { class: 'btn', onclick: () => this.overlay?.remove() }, '關閉'),
      ),
    );
    this.root.append(this.overlay);
  }

  // ---------------------------------------------------------------- frame

  private readonly frame = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.fit();
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = this.theme.panel;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const t = this.clock.at(now);
    while (this.pending.length && this.pending[0]!.k <= t) {
      const { k, f } = this.pending.shift()!;
      this.handleFx(f, k);
    }
    const world = this.sample(t - WORLD_EXTRA);
    if (!world || !world.a.g) {
      this.label('載入中…', FIELD_W / 2, FIELD_H / 2, 20, '#fff');
      return;
    }
    const self = this.me ? this.sample(t) : null;
    this.warnBeep(self?.a ?? world.a);
    const shake = now - this.shakeAt;
    if (shake > 0 && shake < 320) {
      const k = 1 - shake / 320;
      ctx.translate(Math.sin(now / 21) * 4 * k, Math.cos(now / 17) * 3 * k);
    }
    this.drawField(world, self, now);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.drawPanel(world.a);
    this.drawBar(self?.a ?? world.a);
    this.drawOverlay(world.a, now);
  };

  private fit(): void {
    const box = this.root.getBoundingClientRect();
    const s = Math.max(0.4, Math.min(box.width / VIEW_W, box.height / VIEW_H));
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(VIEW_W * s);
    const hgt = Math.round(VIEW_H * s);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(hgt * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(hgt * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${hgt}px`;
    }
    this.scale = (w / VIEW_W) * dpr;
  }

  private sample(t: number): Sample | null {
    const s = this.snaps;
    if (!s.length) return null;
    let i = s.length - 1;
    while (i > 0 && s[i]!.k > t) i--;
    const a = s[i]!;
    const b = s[i + 1] ?? null;
    if (b) return { a, b, f: Math.max(0, Math.min(1, (t - a.k) / (b.k - a.k))), prev: null, ex: 0 };
    return { a, b: null, f: 0, prev: s[i - 1] ?? null, ex: Math.max(0, Math.min(MAX_EXTRAPOLATE, t - a.k)) };
  }

  private playerAt(smp: Sample, id: string): SnapPlayer | undefined {
    const pa = smp.a.p.find((p) => p.i === id);
    if (!pa) return undefined;
    if (smp.b) {
      const pb = smp.b.p.find((p) => p.i === id);
      if (!pb || Math.abs(pb.x - pa.x) + Math.abs(pb.y - pa.y) > 60) return pa;
      return { ...pa, x: pa.x + (pb.x - pa.x) * smp.f, y: pa.y + (pb.y - pa.y) * smp.f, a: pa.a + (pb.a - pa.a) * smp.f };
    }
    // the next snapshot is late: keep walking at the last known pace for a moment instead of freezing
    const pp = smp.prev?.p.find((p) => p.i === id);
    if (!pp || !smp.ex || smp.a.k === smp.prev!.k) return pa;
    const per = smp.ex / (smp.a.k - smp.prev!.k);
    const vx = pa.x - pp.x;
    const vy = pa.y - pp.y;
    if (Math.abs(vx) + Math.abs(vy) > 8) return pa; // teleported or launched: don't guess
    return { ...pa, x: pa.x + vx * per, y: pa.y + vy * per };
  }

  private balloonAt(smp: Sample, b: SnapBalloon): SnapBalloon {
    const nb = smp.b?.b.find((x) => x.i === b.i);
    if (!nb) return b;
    return { ...b, x: b.x + (nb.x - b.x) * smp.f, y: b.y + (nb.y - b.y) * smp.f, z: b.z + (nb.z - b.z) * smp.f };
  }

  private friend(id: string): boolean {
    if (!this.me) return false;
    if (id === this.me.id) return true;
    const p = this.players.get(id);
    return this.info.mode === 'team' && !!p && p.team === this.me.team;
  }

  private tileAt(x: number, y: number): string {
    return this.shownGrid[Math.floor(y / TILE) * COLS + Math.floor(x / TILE)] ?? '#';
  }

  /** Beeps the last seconds before a ring closes. */
  private warnBeep(s: Snapshot): void {
    const sec = s.zt > 0 && s.zt <= RULES.shrinkWarn ? Math.ceil(s.zt / TICK_RATE) : -1;
    if (sec !== this.lastWarnSecond && sec > 0 && sec < Math.ceil(RULES.shrinkWarn / TICK_RATE)) this.audio.play('beep');
    this.lastWarnSecond = sec;
  }

  // ---------------------------------------------------------------- field

  private drawField(world: Sample, self: Sample | null, now: number): void {
    const ctx = this.ctx;
    const key = (MAPS[this.info.map] ?? MAPS[0]!).key;
    const grid = world.a.g ?? this.grid;
    const items = world.a.i ?? this.items;
    if (grid !== this.shownGrid) {
      // blocks that just appeared on a closing ring fall from the sky; on (re)join they are just there
      const first = !this.shownGrid;
      for (let i = 0; i < grid.length; i++) if (grid[i] === '%' && !this.closedAt.has(i)) this.closedAt.set(i, first ? 0 : now);
      this.shownGrid = grid;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, FIELD_W, FIELD_H);
    ctx.clip();
    ctx.drawImage(this.floor, 0, 0);

    const f2 = Math.floor(now / 400) % 2;
    const f4 = Math.floor(now / 110) % 4;
    const f8 = Math.floor(now / 90) % 8;
    const draws: { y: number; fn: () => void }[] = [];
    const air: (() => void)[] = [];
    for (let i = 0; i < grid.length; i++) {
      const ch = grid[i]!;
      const x = (i % COLS) * TILE;
      const y = Math.floor(i / COLS) * TILE;
      if (ch === '~') ctx.drawImage(waterSprite(f2), x, y, TILE, TILE);
      else if (ch === '=') ctx.drawImage(iceSprite(), x, y, TILE, TILE);
      else if (ch === '@') ctx.drawImage(portalSprite(f8), x, y, TILE, TILE);
      else if (BELT[ch]) ctx.drawImage(conveyorSprite(BELT[ch]!, f4), x, y, TILE, TILE);
      else if (ch === '#') draws.push({ y: y + TILE, fn: () => ctx.drawImage(hardSprite(key), x, y - 8, TILE, 48) });
      else if (ch === 'x') draws.push({ y: y + TILE, fn: () => ctx.drawImage(softSprite(key), x, y - 8, TILE, 48) });
      else if (ch === 'o') draws.push({ y: y + TILE, fn: () => ctx.drawImage(barrelSprite(), x, y - 8, TILE, 48) });
      else if (ch === '*') draws.push({ y: y + TILE + 0.1, fn: () => ctx.drawImage(bushSprite(key), x, y - 4, TILE, 44) });
      else if (ch === '%') this.drawClosed(i, x, y, now, draws, air);
      const code = items[i];
      const item = code && code !== '.' ? ITEM_BY_CODE[code] : undefined;
      if (item) draws.push({ y: y + 1, fn: () => this.drawItem(item, x, y, now, i) });
    }
    if (this.machine) {
      const m = this.machine;
      draws.push({ y: m.y + TILE * 1.5, fn: () => this.drawMachine(world.a, now) });
    }
    this.drawWarning(world.a, now);
    for (const i of world.a.n) {
      ctx.drawImage(bananaSprite(), (i % COLS) * TILE + 8, Math.floor(i / COLS) * TILE + 10, 24, 24);
    }
    for (const e of world.a.e) this.drawBlast(e, now);

    for (const raw of world.a.b) {
      const b = this.balloonAt(world, raw);
      const hidden = this.tileAt(b.x, b.y) === '*';
      if (b.z > 0) air.push(() => this.drawBalloon(b, now, 1));
      else {
        draws.push({ y: b.y + 12, fn: () => this.drawBalloon(b, now, 1) });
        if (hidden && this.friend(b.o)) draws.push({ y: b.y + 40, fn: () => this.drawBalloon(b, now, 0.5) });
      }
    }
    const shown: SnapPlayer[] = [];
    for (const info of this.info.players) {
      const p = this.me && info.id === this.me.id && self ? this.playerAt(self, info.id) : this.playerAt(world, info.id);
      if (!p || p.s === 2) continue;
      const friend = this.friend(p.i);
      const inBush = this.tileAt(p.x, p.y) === '*';
      if (!friend && inBush && p.a === 0) continue;
      let alpha = 1;
      if (p.cl > 0) alpha = friend ? 0.45 : 0.1;
      shown.push(p);
      if (p.a > 0) air.push(() => this.drawPlayer(p, info, now, alpha));
      else {
        draws.push({ y: p.y + 14, fn: () => this.drawPlayer(p, info, now, alpha) });
        if (inBush) draws.push({ y: Math.floor(p.y / TILE) * TILE + TILE + 0.2, fn: () => this.drawPlayer(p, info, now, 0.5) });
      }
    }
    draws.sort((a, b) => a.y - b.y);
    for (const d of draws) d.fn();
    for (const fn of air) fn();
    this.drawDrops(world, now);

    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 3;
    for (const d of world.a.d) {
      const dx = d.d === 3 ? -1 : d.d === 4 ? 1 : 0;
      const dy = d.d === 1 ? -1 : d.d === 2 ? 1 : 0;
      ctx.beginPath();
      ctx.moveTo(d.x - dx * 12, d.y - dy * 12);
      ctx.lineTo(d.x + dx * 8, d.y + dy * 8);
      ctx.stroke();
    }
    for (const p of shown) {
      const info = this.players.get(p.i);
      if (info && (p.cl === 0 || this.friend(p.i))) this.drawTag(p, info);
    }
    this.drawEffects(now);
    if ((MAPS[this.info.map] ?? MAPS[0]!).night) this.drawNight(world, self);
    ctx.restore();
  }

  /** A block on a closed ring; it drops in over a quarter second when the ring closes. */
  private drawClosed(i: number, x: number, y: number, now: number, draws: { y: number; fn: () => void }[], air: (() => void)[]): void {
    const ctx = this.ctx;
    const k = Math.min(1, (now - (this.closedAt.get(i) ?? 0)) / 230);
    if (k >= 1) {
      draws.push({ y: y + TILE, fn: () => ctx.drawImage(closedSprite(), x, y - 8, TILE, 48) });
      return;
    }
    ctx.fillStyle = `rgba(0,0,0,${0.15 + 0.35 * k})`;
    ctx.beginPath();
    ctx.ellipse(x + TILE / 2, y + TILE / 2 + 6, 8 + 12 * k, 4 + 6 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    const drop = (1 - k) * (1 - k) * 220;
    air.push(() => ctx.drawImage(closedSprite(), x, y - 8 - drop, TILE, 48));
  }

  /** The ring that closes next flashes red, with a countdown, for the last seconds. */
  private drawWarning(s: Snapshot, now: number): void {
    if (!(s.zt > 0 && s.zt <= RULES.shrinkWarn)) return;
    const ctx = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(now / 90);
    for (let i = 0; i < this.shownGrid.length; i++) {
      if (ringOf(i) !== s.zn || this.shownGrid[i] === '%') continue;
      const x = (i % COLS) * TILE;
      const y = Math.floor(i / COLS) * TILE;
      ctx.fillStyle = `rgba(255,40,40,${0.18 + 0.2 * pulse})`;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.globalAlpha = 0.25 + 0.3 * pulse;
      ctx.drawImage(hazardSprite(), x, y, TILE, TILE);
      ctx.globalAlpha = 1;
    }
  }

  private drawMachine(s: Snapshot, now: number): void {
    const m = this.machine;
    if (!m) return;
    const ctx = this.ctx;
    const left = s.mc ?? RULES.machineEvery;
    const charge = 1 - left / RULES.machineEvery;
    const soon = left < TICK_RATE * 2;
    const shake = soon ? Math.sin(now / 25) * 1.5 : 0;
    const puff = now - this.spitAt < 250 ? 1 - (now - this.spitAt) / 250 : 0;
    const x0 = m.x - TILE * 1.5 + shake;
    const y0 = m.y - TILE * 1.5 - 24 - puff * 6;
    ctx.drawImage(machineSprite(), x0, y0, 120, 144);
    // charge bar in the gauge window, red light on top in the last two seconds
    ctx.fillStyle = soon && Math.floor(now / 120) % 2 ? '#ff5252' : '#4dd0e1';
    ctx.fillRect(x0 + 26, y0 + 82, 68 * charge, 12);
    if (soon) {
      ctx.fillStyle = Math.floor(now / 120) % 2 ? '#ff1744' : '#ffcdd2';
      ctx.fillRect(x0 + 54, y0 + 4, 12, 6);
    }
    if (puff > 0) {
      ctx.globalAlpha = puff;
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + now / 200;
        ctx.beginPath();
        ctx.arc(m.x + Math.cos(a) * 30 * (1.4 - puff), y0 + 20 + Math.sin(a) * 12, 7 * puff + 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Supply drops on their way down: a shadow grows on the landing tile while the parachute sinks. */
  private drawDrops(world: Sample, now: number): void {
    const ctx = this.ctx;
    for (const [tile, code, ticks] of world.a.dr) {
      const t = ITEM_BY_CODE[code];
      if (!t) continue;
      const left = Math.max(0, ticks - (world.b ? world.f : world.ex));
      const k = 1 - left / RULES.supplyFall;
      const x = (tile % COLS) * TILE + TILE / 2;
      const y = Math.floor(tile / COLS) * TILE + TILE / 2;
      ctx.strokeStyle = `rgba(255,224,130,${0.5 + 0.4 * Math.sin(now / 80)})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(x, y + 4, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(0,0,0,${0.1 + 0.25 * k})`;
      ctx.beginPath();
      ctx.ellipse(x, y + 12, 5 + 8 * k, 2 + 3 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      const iy = y - (1 - k) * 170 - 2 + Math.sin(now / 160) * 2;
      // canopy and lines
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 17, iy - 26);
      ctx.lineTo(x - 6, iy - 6);
      ctx.moveTo(x + 17, iy - 26);
      ctx.lineTo(x + 6, iy - 6);
      ctx.stroke();
      for (let s = 0; s < 4; s++) {
        ctx.fillStyle = s % 2 ? '#ffffff' : '#ff7043';
        ctx.beginPath();
        ctx.moveTo(x, iy - 28);
        ctx.arc(x, iy - 26, 18, Math.PI + (s * Math.PI) / 4, Math.PI + ((s + 1) * Math.PI) / 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(x, iy + 6, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(itemSprite(t), x - 12, iy - 6, 24, 24);
    }
  }

  private drawItem(type: NonNullable<(typeof ITEM_BY_CODE)[string]>, x: number, y: number, now: number, i: number): void {
    const ctx = this.ctx;
    const bob = Math.sin(now / 260 + i) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x + 20, y + 33, 11, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + 20, y + 18 + bob, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.drawImage(itemSprite(type), x + 6, y + 4 + bob, 28, 28);
  }

  private drawBlast(e: SnapBlast, now: number): void {
    const ctx = this.ctx;
    const life = e.t / RULES.streamLinger;
    const w = 30 * (0.55 + 0.45 * life) + Math.sin(now / 35) * 1.5;
    const cx = e.c * TILE + TILE / 2;
    const cy = e.r * TILE + TILE / 2;
    const [up, down, left, right] = e.a;
    const layers: [number, string][] = [
      [w, 'rgba(48,140,235,0.92)'],
      [w * 0.62, '#9fdcff'],
      [w * 0.24, '#ffffff'],
    ];
    for (const [lw, col] of layers) {
      const half = lw / 2;
      ctx.fillStyle = col;
      const top = cy - up * TILE - (up ? 14 : half);
      const bottom = cy + down * TILE + (down ? 14 : half);
      const l = cx - left * TILE - (left ? 14 : half);
      const r = cx + right * TILE + (right ? 14 : half);
      ctx.beginPath();
      ctx.roundRect(cx - half, top, lw, bottom - top, half);
      ctx.roundRect(l, cy - half, r - l, lw, half);
      ctx.arc(cx, cy, half * 1.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBalloon(b: SnapBalloon, now: number, alpha: number): void {
    const ctx = this.ctx;
    const owner = this.players.get(b.o);
    const left = b.f / RULES.fuse;
    const fast = left < 0.3;
    const pulse = 1 + Math.sin(now / (fast ? 60 : 140)) * (fast ? 0.1 : 0.05);
    const size = 34 * pulse;
    const lift = b.z > 0 ? Math.sin(b.z * Math.PI) * (owner ? 44 : 110) : 0; // the machine lobs them high
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + 14, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(balloonSprite(owner ? owner.color : MACHINE_BALLOON), b.x - size / 2, b.y - size / 2 - 3 - lift, size, size);
    ctx.globalAlpha = 1;
  }

  private drawPlayer(p: SnapPlayer, info: GamePlayerInfo, now: number, alpha: number): void {
    const ctx = this.ctx;
    const ch = CHARACTERS[info.char] ?? CHARACTERS[0]!;
    const moving = p.m === 1 && p.s === 0;
    const frame = moving ? ([0, 1, 0, 2][Math.floor(now / 110) % 4] ?? 0) : 0;
    const jump = p.a > 0 ? Math.sin(p.a * Math.PI) * 26 : 0;
    const mount = MOUNT_BY_CODE[p.mt];
    let a = alpha;
    if (p.iv > 0 && Math.floor(now / 70) % 2) a *= 0.35; // just lost a mount: streams pass through
    if (p.dc) a *= 0.5;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 13, 13 - jump / 6, 5 - jump / 12, 0, 0, Math.PI * 2);
    ctx.fill();
    if (this.info.mode === 'team' && info.team >= 0) {
      ctx.strokeStyle = TEAMS[info.team]?.ring ?? '#fff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 13, 16, 6.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    let y = p.y - 34 - jump - (moving && frame ? 1 : 0);
    if (mount) {
      ctx.drawImage(mountSprite(mount), p.x - 24, p.y - 12 - jump, 48, 32);
      y -= 12;
    }
    const wobble = p.s === 1 ? Math.sin(now / 90) * 1.5 : 0;
    ctx.drawImage(characterSprite(ch.key, info.color, p.f || 2, frame), Math.round(p.x - 20 + wobble), Math.round(y), 40, 48);
    if (mount === 'ufo') {
      ctx.fillStyle = 'rgba(128,222,234,0.3)';
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, y + 22, 18, 20, 0, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
    }
    if (p.s === 1) this.drawBubble(p.x, p.y - 12, 1 - p.tt / RULES.trapped, now);
    if (p.cu) {
      ctx.fillStyle = p.cu === 'r' ? '#ce93d8' : '#ff8a65';
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(p.cu === 'r' ? '顛倒' : '狂放', p.x, y - 4);
    }
    ctx.globalAlpha = 1;
  }

  /** The trap bubble turns opaque as time runs out and flashes red in the last second. */
  private drawBubble(x: number, y: number, progress: number, now: number): void {
    const ctx = this.ctx;
    const r = 25;
    const op = 0.25 + progress * 0.72;
    const g = ctx.createRadialGradient(x - 7, y - 9, 2, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.3 + progress * 0.55})`);
    g.addColorStop(0.6, `rgba(150,215,255,${op * 0.75})`);
    g.addColorStop(1, `rgba(60,150,235,${Math.min(1, op + 0.15)})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    const last = progress > 1 - TICK_RATE / RULES.trapped;
    ctx.strokeStyle = last && Math.floor(now / 100) % 2 ? '#ff5252' : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, r - 6, Math.PI * 1.1, Math.PI * 1.45);
    ctx.stroke();
  }

  private drawTag(p: SnapPlayer, info: GamePlayerInfo): void {
    const ctx = this.ctx;
    const mounted = !!MOUNT_BY_CODE[p.mt];
    const jump = p.a > 0 ? Math.sin(p.a * Math.PI) * 26 : 0;
    let y = p.y - 50 - (mounted ? 12 : 0) - jump;
    if (y < 9) y = p.y + 26; // top row: show the tag under the feet instead of off-screen
    ctx.font = `bold 11px ${FONT}`;
    const label = info.name;
    const w = Math.ceil(ctx.measureText(label).width) + 10;
    const team = this.info.mode === 'team' ? TEAMS[info.team] : undefined;
    const total = w + (team ? 14 : 0);
    const x0 = Math.max(2, Math.min(FIELD_W - total - 2, p.x - total / 2));
    if (team) {
      ctx.fillStyle = team.ring;
      ctx.beginPath();
      ctx.arc(x0 + 6, y, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2235';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(team.name, x0 + 6, y + 0.5);
    }
    const bx = x0 + (team ? 14 : 0);
    ctx.fillStyle = COLORS[info.color]?.dark ?? '#333';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.roundRect(bx, y - 7.5, w, 15, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (this.me && info.id === this.me.id) {
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + w / 2, y + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  private drawEffects(now: number): void {
    const ctx = this.ctx;
    this.effects = this.effects.filter((e) => now - e.at < 900);
    for (const e of this.effects) {
      const t = (now - e.at) / 900;
      if (e.kind === 'text') {
        ctx.globalAlpha = 1 - t;
        ctx.font = `bold 14px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(e.text ?? '', e.x, e.y - t * 20);
        ctx.fillStyle = e.color ?? '#fff';
        ctx.fillText(e.text ?? '', e.x, e.y - t * 20);
      } else {
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = e.color ?? '#8fd0ff';
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(a) * t * 26, e.y + Math.sin(a) * t * 26, 3.5 * (1 - t) + 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Night map: you only see about 3 tiles around yourself; balloons and streams glow. */
  private drawNight(world: Sample, self: Sample | null): void {
    const me = this.me ? (self ? this.playerAt(self, this.me.id) : undefined) : undefined;
    if (!me || me.s === 2) return; // knocked out players watch with full vision
    const m = this.darkness.getContext('2d')!;
    m.globalCompositeOperation = 'source-over';
    m.clearRect(0, 0, FIELD_W, FIELD_H);
    m.fillStyle = 'rgba(6,8,22,0.93)';
    m.fillRect(0, 0, FIELD_W, FIELD_H);
    m.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, strength: number) => {
      const g = m.createRadialGradient(x, y, r * 0.35, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${strength})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = g;
      m.beginPath();
      m.arc(x, y, r, 0, Math.PI * 2);
      m.fill();
    };
    hole(me.x, me.y - 6, TILE * 3.5, 1);
    for (const b of world.a.b) hole(b.x, b.y, 38, 0.8);
    for (const e of world.a.e) {
      const cx = e.c * TILE + TILE / 2;
      const cy = e.r * TILE + TILE / 2;
      hole(cx, cy, 46, 0.9);
      const [up, down, left, right] = e.a;
      for (let k = 1; k <= up; k++) hole(cx, cy - k * TILE, 34, 0.8);
      for (let k = 1; k <= down; k++) hole(cx, cy + k * TILE, 34, 0.8);
      for (let k = 1; k <= left; k++) hole(cx - k * TILE, cy, 34, 0.8);
      for (let k = 1; k <= right; k++) hole(cx + k * TILE, cy, 34, 0.8);
    }
    for (const p of world.a.p) if (p.i !== me.i && p.s !== 2 && this.friend(p.i)) hole(p.x, p.y, 50, 0.6);
    m.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(this.darkness, 0, 0);
    this.drawWarning(world.a, performance.now()); // the warning shows through the dark
  }

  // ---------------------------------------------------------------- panels

  private label(text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center'): void {
    const ctx = this.ctx;
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  private drawPanel(s: Snapshot): void {
    const ctx = this.ctx;
    const x0 = FIELD_W;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x0, 0, VIEW_W - x0, VIEW_H);
    const map = MAPS[this.info.map] ?? MAPS[0]!;
    this.label(map.name, x0 + 100, 24, 15, '#fff');
    const secs = Math.max(0, Math.ceil(s.tl / TICK_RATE));
    const low = s.ph === 1 && secs <= 30;
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    this.label(time, x0 + 100, 60, 30, low && Math.floor(performance.now() / 300) % 2 ? '#ff8a80' : '#fff');

    const players = [...this.info.players].sort((a, b) => a.slot - b.slot);
    players.forEach((info, k) => {
      const y = 80 + k * 108;
      const p = s.p.find((x) => x.i === info.id);
      const col = COLORS[info.color] ?? COLORS[0]!;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.roundRect(x0 + 10, y, 180, 98, 10);
      ctx.fill();
      if (this.me && info.id === this.me.id) {
        ctx.strokeStyle = '#ffd54f';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const dead = !p || p.s === 2;
      ctx.globalAlpha = dead ? 0.35 : 1;
      const ch = CHARACTERS[info.char] ?? CHARACTERS[0]!;
      ctx.fillStyle = col.light;
      ctx.beginPath();
      ctx.arc(x0 + 42, y + 50, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(characterSprite(ch.key, info.color, 2, 0), x0 + 22, y + 24, 40, 48);
      ctx.globalAlpha = 1;
      this.label(`P${info.slot + 1}`, x0 + 76, y + 22, 11, 'rgba(255,255,255,0.7)', 'left');
      if (this.info.mode === 'team') {
        const team = TEAMS[info.team];
        if (team) {
          ctx.fillStyle = team.ring;
          ctx.beginPath();
          ctx.roundRect(x0 + 100, y + 11, 30, 15, 7);
          ctx.fill();
          this.label(team.label, x0 + 115, y + 22, 10, '#2a2235');
        }
      }
      this.label(this.fitText(info.name, 100, 14), x0 + 76, y + 44, 14, '#fff', 'left');
      let status = '存活';
      let color = '#a5d6a7';
      if (!p || p.s === 2) {
        status = '淘汰';
        color = '#ef9a9a';
      } else if (p.s === 1) {
        status = `被困 ${(p.tt / TICK_RATE).toFixed(1)}s`;
        color = '#81d4fa';
      } else if (p.dc) {
        status = '斷線';
        color = '#bdbdbd';
      }
      this.label(status, x0 + 76, y + 66, 12, color, 'left');
      const who = info.bot !== undefined ? ` · 電腦${BOT_LEVELS[info.bot]}` : '';
      this.label(this.fitText(`${ch.animal}${ch.name}${who}`, 110, 11), x0 + 76, y + 86, 11, 'rgba(255,255,255,0.6)', 'left');
    });
    // what the round has in store: the next ring, the balloon machine
    let ly = 534;
    if (s.zt >= 0 && (s.zt <= 15 * TICK_RATE || s.zn > 0)) {
      const warn = s.zt <= RULES.shrinkWarn;
      const text = `縮圈 ${Math.ceil(s.zt / TICK_RATE)} 秒（第 ${s.zn + 1}/${RULES.shrinkRings} 圈）`;
      this.label(text, x0 + 100, ly, 12, warn && Math.floor(performance.now() / 200) % 2 ? '#ff8a80' : '#ffcc80');
      ly += 20;
    } else if (s.zt < 0 && s.zn > 0) {
      this.label(`已縮完 ${s.zn} 圈`, x0 + 100, ly, 12, '#ffcc80');
      ly += 20;
    }
    if (s.mc !== undefined && s.ph === 1) {
      this.label(`水球機 ${Math.ceil(s.mc / TICK_RATE)} 秒後發射`, x0 + 100, ly, 12, s.mc < TICK_RATE * 2 ? '#ff8a80' : '#b3e5fc');
    }
    this.label(`延遲 ${this.net.rtt} ms`, x0 + 100, VIEW_H - 14, 11, 'rgba(255,255,255,0.6)');
  }

  private fitText(text: string, max: number, size: number): string {
    this.ctx.font = `bold ${size}px ${FONT}`;
    if (this.ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && this.ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
    return `${t}…`;
  }

  private drawBar(s: Snapshot): void {
    const ctx = this.ctx;
    const y0 = FIELD_H;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, y0, FIELD_W, VIEW_H - y0);
    const me = this.me;
    const p = me ? s.p.find((x) => x.i === me.id) : undefined;
    if (!me || !p) {
      this.label('觀戰中', FIELD_W / 2, y0 + 46, 16, '#fff');
      return;
    }
    const ch = CHARACTERS[me.char] ?? CHARACTERS[0]!;
    ctx.drawImage(characterSprite(ch.key, me.color, 2, 0), 12, y0 + 18, 40, 48);
    if (p.s === 2) {
      this.label('你已被淘汰，觀戰中', 300, y0 + 46, 16, '#ffcdd2');
      return;
    }
    const rows: [string, number, readonly [number, number]][] = [
      ['水球', p.b, ch.bal],
      ['水柱', p.w, ch.pow],
      ['速度', p.v, ch.spd],
    ];
    rows.forEach(([name, val, [, cap]], k) => {
      const y = y0 + 22 + k * 22;
      this.label(name, 64, y + 4, 12, '#fff', 'left');
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i < val ? '#4fc3f7' : i < cap ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.25)';
        ctx.fillRect(100 + i * 13, y - 6, 10, 10);
      }
      this.label(`${val}/${cap}`, 236, y + 4, 11, 'rgba(255,255,255,0.75)', 'left');
    });
    let ax = 284;
    if (p.k) {
      ctx.drawImage(itemSprite('shoe'), ax, y0 + 14, 28, 28);
      this.label('踢', ax + 14, y0 + 56, 10, '#fff');
      ax += 34;
    }
    if (p.g) {
      ctx.drawImage(itemSprite('glove'), ax, y0 + 14, 28, 28);
      this.label('丟', ax + 14, y0 + 56, 10, '#fff');
      ax += 34;
    }
    const mount = MOUNT_BY_CODE[p.mt];
    if (mount) {
      ctx.drawImage(itemSprite(mount), ax, y0 + 14, 28, 28);
      this.label('坐騎', ax + 14, y0 + 56, 10, '#fff');
    }
    // active item slot
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.roundRect(432, y0 + 6, 60, 58, 10);
    ctx.fill();
    const active = ITEM_BY_CODE[p.it];
    if (active) {
      ctx.drawImage(itemSprite(active), 442, y0 + 10, 40, 40);
      this.label(`×${p.n}`, 488, y0 + 60, 12, '#fff', 'right');
    } else {
      this.label('道具', 462, y0 + 40, 12, 'rgba(255,255,255,0.5)');
    }
    this.label('Ctrl / Z', 462, y0 + 77, 10, 'rgba(255,255,255,0.6)');
    const hint =
      p.cu === 'r' ? '中了惡魔：方向顛倒！' : p.cu === 'a' ? '中了惡魔：停不下來放水球！' : p.iv > 0 ? '坐騎掉了：短暫無敵' : '';
    if (hint) this.label(hint, 300, y0 + 76, 12, p.cu ? '#ce93d8' : '#ffe082');
    this.label('方向鍵移動', 590, y0 + 26, 11, 'rgba(255,255,255,0.7)', 'right');
    this.label('Space 放水球', 590, y0 + 44, 11, 'rgba(255,255,255,0.7)', 'right');
    this.label('Enter 聊天 · M 靜音', 590, y0 + 62, 11, 'rgba(255,255,255,0.7)', 'right');
  }

  private drawOverlay(s: Snapshot, now: number): void {
    const ctx = this.ctx;
    const cx = FIELD_W / 2;
    const cy = FIELD_H / 2;
    const big = (text: string, color: string, size: number, y = cy) => {
      ctx.font = `900 ${size}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(20,30,60,0.75)';
      ctx.strokeText(text, cx, y);
      ctx.fillStyle = color;
      ctx.fillText(text, cx, y);
    };
    if (s.ph === 0) {
      const left = s.cd / TICK_RATE;
      const pop = 1 - (left % 1);
      big(String(Math.ceil(left)), '#fff', 72 + pop * 24);
    } else if (now - this.goAt < 700) {
      big('開始！', '#ffd54f', 64);
    }
    if (s.zt > 0 && s.zt <= RULES.shrinkWarn && s.ph === 1) {
      big(`縮圈 ${Math.ceil(s.zt / TICK_RATE)}`, Math.floor(now / 150) % 2 ? '#ff5252' : '#ffcdd2', 34, 96);
    } else if (this.banner && now - this.bannerAt < 1600) {
      const k = Math.min(1, (now - this.bannerAt) / 180);
      ctx.globalAlpha = Math.min(1, (1600 - (now - this.bannerAt)) / 300);
      big(this.banner, this.banner.startsWith('縮圈') ? '#ff8a80' : '#ffe082', 24 + 12 * k, 96);
      ctx.globalAlpha = 1;
    }
    if (this.result) {
      const me = this.me;
      const won = !!me && this.result.winners.includes(me.id);
      const k = Math.min(1, (now - this.resultAt) / 300);
      big(this.result.draw ? '平手' : won ? '勝利！' : '落敗…', this.result.draw ? '#fff' : won ? '#ffd54f' : '#90caf9', 40 + 30 * k);
    }
    const lines = this.chatLines.filter((l) => now - l.at < 10000);
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'left';
    lines.forEach((l, k) => {
      const y = FIELD_H - 12 - (lines.length - 1 - k) * 17;
      const text = l.name ? `${l.name}：${l.text}` : l.text;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(text, 8, y);
      ctx.fillStyle = l.name ? '#fff' : '#fff59d';
      ctx.fillText(text, 8, y);
    });
  }
}
