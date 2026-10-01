import { CHARACTERS } from '../shared/characters';
import { COLORS } from '../shared/colors';
import { MAX_PLAYERS, RULES, TICK_MS } from '../shared/constants';
import { MAPS } from '../shared/maps';
import type {
  C2S,
  GameStartInfo,
  RoomConfig,
  RoomPhase,
  RoomSummary,
  RoomView,
  S2C,
  Snapshot,
} from '../shared/protocol';
import { Game } from '../shared/sim/game';
import { errorMsg, type Hub, type Session } from './hub';
import { log } from './log';
import { cleanText } from './validate';

interface Member {
  s: Session;
  char: number;
  color: number;
  team: number;
  slot: number;
  ready: boolean;
}

export class Room {
  readonly members: Member[] = [];
  config: RoomConfig = { map: -1, mode: 'ffa', assign: 'free', time: 180 };
  phase: RoomPhase = 'waiting';
  private game: Game | null = null;
  private info: GameStartInfo | null = null;
  private lastSnap: Snapshot | null = null;
  private nextTickAt = 0;
  private lastMap = -1;
  private resultsTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly id: number,
    readonly name: string,
    readonly password: string,
    private readonly hub: Hub,
  ) {}

  get full(): boolean {
    return this.members.length >= MAX_PLAYERS;
  }

  /** The earliest member still in the room is the host. */
  get host(): Member | undefined {
    return this.members[0];
  }

  // ---------------------------------------------------------------- membership

  add(s: Session): void {
    const usedSlots = new Set(this.members.map((m) => m.slot));
    const slot = [0, 1, 2, 3].find((k) => !usedSlots.has(k)) ?? 0;
    const uses = (c: number) => this.members.filter((m) => m.char === c).length;
    const char = CHARACTERS.map((c) => c.id).sort((a, b) => uses(a) - uses(b))[0] ?? 0;
    const teamSize = (t: number) => this.members.filter((m) => m.team === t).length;
    const m: Member = { s, char, color: 0, team: teamSize(0) <= teamSize(1) ? 0 : 1, slot, ready: false };
    m.color = this.freeColor(m, -1);
    this.members.push(m);
    s.room = this;
    this.broadcastRoom(); // the newcomer needs the room screen before the chat line arrives
    this.system(`${s.name} 進入房間`);
    this.hub.markLobby();
  }

  remove(s: Session): void {
    const k = this.members.findIndex((m) => m.s === s);
    if (k < 0) return;
    this.members.splice(k, 1);
    s.room = null;
    this.game?.forfeit(s.id);
    if (!this.members.length) {
      if (this.resultsTimer) clearTimeout(this.resultsTimer);
      this.game = null;
      this.hub.removeRoom(this);
      return;
    }
    this.system(`${s.name} 離開房間`);
    this.broadcastRoom();
    this.hub.markLobby();
  }

  memberOffline(s: Session): void {
    this.game?.setConnected(s.id, false);
    this.broadcastRoom();
  }

  /** A player reconnected: bring them back to where the room is. */
  resume(s: Session): void {
    s.send({ t: 'room', room: this.view() });
    if (this.game && this.info) {
      this.game.setConnected(s.id, true);
      s.send({ t: 'start', game: this.info });
      if (this.lastSnap) s.send({ t: 'snap', s: { ...this.lastSnap, ...this.game.staticLayers(), fx: [] } });
      if (this.phase === 'results' && this.game.result) s.send({ t: 'end', result: this.game.result });
    }
    this.broadcastRoom();
  }

  // ---------------------------------------------------------------- messages

  handle(s: Session, msg: C2S): void {
    const m = this.members.find((x) => x.s === s);
    if (!m) return;
    switch (msg.t) {
      case 'in':
        this.game?.setInput(s.id, msg.d, msg.d2);
        return;
      case 'act':
        this.game?.pushAction(s.id, msg.a);
        return;
      case 'chat':
        return this.chat(m, msg.text);
      case 'pick':
        return this.pick(m, msg);
      case 'ready':
        if (this.phase === 'waiting' && m !== this.host) {
          m.ready = msg.ready;
          this.broadcastRoom();
        }
        return;
      case 'config':
        return this.configure(m, msg);
      case 'kick':
        return this.kick(m, msg.id);
      case 'start':
        return this.start(m);
    }
  }

  private chat(m: Member, raw: string): void {
    const text = cleanText(raw, 100);
    const now = Date.now();
    if (!text || now - m.s.lastChat < 500) return;
    m.s.lastChat = now;
    this.broadcast({ t: 'chat', from: m.s.id, name: m.s.name, text });
  }

  private pick(m: Member, msg: { char?: number; color?: number; team?: number }): void {
    if (this.phase !== 'waiting') return;
    if (msg.char !== undefined && CHARACTERS[msg.char]) {
      m.char = msg.char;
      m.color = this.freeColor(m, m.color);
    }
    if (msg.color !== undefined && COLORS[msg.color]) {
      if (this.colorTaken(m, msg.color)) m.s.send(errorMsg('color', '同一個角色已經有人用這個顏色'));
      else m.color = msg.color;
    }
    if (msg.team !== undefined && this.config.mode === 'team' && this.config.assign === 'free') m.team = msg.team;
    this.broadcastRoom();
  }

  private configure(m: Member, msg: Partial<RoomConfig>): void {
    if (m !== this.host || this.phase !== 'waiting') return;
    if (msg.map !== undefined && msg.map >= -1 && msg.map < MAPS.length) this.config.map = msg.map;
    if (msg.mode) {
      this.config.mode = msg.mode;
      if (msg.mode === 'team' && new Set(this.members.map((x) => x.team)).size < 2) {
        this.members.forEach((x, k) => (x.team = k % 2));
      }
    }
    if (msg.assign) this.config.assign = msg.assign;
    if (msg.time !== undefined) this.config.time = msg.time;
    this.broadcastRoom();
    this.hub.markLobby();
  }

  private kick(m: Member, id: string): void {
    if (m !== this.host || this.phase !== 'waiting') return;
    const target = this.members.find((x) => x.s.id === id);
    if (!target || target === m) return;
    target.s.send({ t: 'kicked' });
    this.remove(target.s);
    this.hub.sendLobby(target.s);
  }

  private colorTaken(m: Member, color: number): boolean {
    return this.members.some((o) => o !== m && o.char === m.char && o.color === color);
  }

  /** Keeps `prefer` if no one with the same character has it; otherwise picks an unused colour. */
  private freeColor(m: Member, prefer: number): number {
    if (prefer >= 0 && !this.colorTaken(m, prefer)) return prefer;
    const used = new Set(this.members.filter((o) => o !== m).map((o) => o.color));
    for (const c of COLORS) if (!used.has(c.id)) return c.id;
    for (const c of COLORS) if (!this.colorTaken(m, c.id)) return c.id;
    return 0;
  }

  // ---------------------------------------------------------------- game

  private start(m: Member): void {
    if (m !== this.host || this.phase !== 'waiting') return;
    const fail = (msg: string) => m.s.send(errorMsg('start', msg));
    const n = this.members.length;
    const team = this.config.mode === 'team';
    if (n < 2) return fail('至少要 2 人才能開始');
    if (this.members.some((x) => x !== m && !x.ready)) return fail('還有人沒按準備');
    if (this.members.some((x) => !x.s.online)) return fail('有玩家斷線中');
    if (team && n < 3) return fail('團隊戰需要 3–4 人');
    if (team && this.config.assign === 'random') this.randomTeams();
    if (team && new Set(this.members.map((x) => x.team)).size < 2) return fail('兩隊都要有人');

    const choices = MAPS.map((x) => x.id).filter((id) => id !== this.lastMap);
    const map = this.config.map >= 0 ? this.config.map : (choices[Math.floor(Math.random() * choices.length)] ?? 0);
    this.lastMap = map;
    this.info = {
      map,
      mode: this.config.mode,
      time: this.config.time,
      players: this.members.map((x) => ({
        id: x.s.id,
        name: x.s.name,
        char: x.char,
        color: x.color,
        team: team ? x.team : -1,
        slot: x.slot,
      })),
    };
    this.game = new Game(MAPS[map]!, this.info.players, {
      mode: this.config.mode,
      time: this.config.time,
      seed: Math.floor(Math.random() * 2 ** 31),
    });
    this.phase = 'playing';
    this.lastSnap = null;
    this.nextTickAt = performance.now();
    this.broadcast({ t: 'start', game: this.info });
    log(`房間 #${this.id} 開局：${MAPS[map]!.name}，${n} 人，${team ? '團隊戰' : '個人戰'}`);
    this.broadcastRoom();
    this.hub.markLobby();
  }

  private randomTeams(): void {
    const order = [...this.members].sort(() => Math.random() - 0.5);
    const firstTeam = order.length === 4 ? 2 : Math.random() < 0.5 ? 1 : 2;
    order.forEach((x, k) => (x.team = k < firstTeam ? 0 : 1));
  }

  /** Called every few ms by the hub; runs the 60 Hz simulation and streams snapshots. */
  update(now: number): void {
    const g = this.game;
    if (!g || this.phase !== 'playing') return;
    if (now - this.nextTickAt > 250) this.nextTickAt = now; // fell far behind: skip rather than fast-forward
    let steps = 0;
    while (now >= this.nextTickAt && steps < 4) {
      g.step();
      const snap = g.snapshot();
      this.lastSnap = snap;
      const raw = JSON.stringify({ t: 'snap', s: snap } satisfies S2C);
      for (const x of this.members) x.s.sendRaw(raw);
      this.nextTickAt += TICK_MS;
      steps++;
      if (g.phase === 'over') {
        this.finish();
        return;
      }
    }
  }

  private finish(): void {
    this.phase = 'results';
    const result = this.game?.result;
    if (result) {
      this.broadcast({ t: 'end', result });
      const names = this.members.filter((x) => result.winners.includes(x.s.id)).map((x) => x.s.name);
      log(`房間 #${this.id} 結束：${result.draw ? '平手' : `${names.join('、')} 獲勝`}（${result.reason === 'time' ? '時間到' : '全員擊倒'}）`);
    }
    this.broadcastRoom();
    this.hub.markLobby();
    this.resultsTimer = setTimeout(() => this.backToWaiting(), RULES.resultsMs);
  }

  private backToWaiting(): void {
    this.resultsTimer = null;
    this.game = null;
    this.info = null;
    this.lastSnap = null;
    this.phase = 'waiting';
    for (const x of this.members) x.ready = false;
    this.broadcastRoom();
    this.hub.markLobby();
  }

  // ---------------------------------------------------------------- views

  view(): RoomView {
    return {
      id: this.id,
      name: this.name,
      locked: this.password !== '',
      phase: this.phase,
      config: { ...this.config },
      members: this.members.map((x) => ({
        id: x.s.id,
        name: x.s.name,
        char: x.char,
        color: x.color,
        team: x.team,
        slot: x.slot,
        ready: x.ready,
        host: x === this.host,
        connected: x.s.online,
        ping: x.s.rtt,
      })),
    };
  }

  summary(): RoomSummary {
    return {
      id: this.id,
      name: this.name,
      host: this.host?.s.name ?? '',
      map: this.info ? this.info.map : this.config.map,
      players: this.members.length,
      phase: this.phase,
      locked: this.password !== '',
    };
  }

  broadcastRoom(): void {
    this.broadcast({ t: 'room', room: this.view() });
  }

  private broadcast(msg: S2C): void {
    const raw = JSON.stringify(msg);
    for (const x of this.members) x.s.sendRaw(raw);
  }

  private system(text: string): void {
    this.broadcast({ t: 'chat', from: null, name: '', text });
  }
}
