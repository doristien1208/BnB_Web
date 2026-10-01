import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import { VERSION } from '../shared/constants';
import type { C2S, RoomSummary, S2C } from '../shared/protocol';
import { log } from './log';
import { Room } from './room';
import { cleanText, parseC2S } from './validate';

const RATE_LIMIT = 120; // messages per second per connection
const RESUME_MS = 30_000; // how long a dropped player keeps their seat

export const errorMsg = (code: string, msg: string): S2C => ({ t: 'error', code, msg });

export class Session {
  readonly id = randomBytes(4).toString('hex');
  readonly token = randomBytes(16).toString('hex');
  ws: WebSocket | null = null;
  room: Room | null = null;
  rtt = 0;
  dropTimer: NodeJS.Timeout | null = null;
  lastChat = 0;
  private windowStart = 0;
  private count = 0;

  constructor(public name: string) {}

  get online(): boolean {
    return this.ws !== null;
  }

  send(msg: S2C): void {
    this.sendRaw(JSON.stringify(msg));
  }

  sendRaw(data: string): void {
    const ws = this.ws;
    // a client that stops reading should not make the server buffer forever
    if (ws && ws.readyState === ws.OPEN && ws.bufferedAmount < 1 << 20) ws.send(data);
  }

  allow(now: number): boolean {
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.count = 0;
    }
    return ++this.count <= RATE_LIMIT;
  }
}

export class Hub {
  readonly rooms = new Map<number, Room>();
  private sessions = new Map<string, Session>(); // by token
  private nextRoomId = 1;
  private lobbyDirty = true;
  private readonly started = Date.now();
  private readonly timers: NodeJS.Timeout[];

  constructor() {
    this.timers = [
      setInterval(() => this.tickRooms(), 4),
      setInterval(() => this.flushLobby(), 250),
      setInterval(() => {
        for (const r of this.rooms.values()) if (r.phase === 'waiting') r.broadcastRoom(); // refresh pings
      }, 2000),
    ];
  }

  close(): void {
    for (const t of this.timers) clearInterval(t);
    for (const s of this.sessions.values()) if (s.dropTimer) clearTimeout(s.dropTimer);
  }

  connect(ws: WebSocket): void {
    let session: Session | null = null;
    const helloTimer = setTimeout(() => ws.close(4000, 'hello timeout'), 10_000);
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const msg = parseC2S(data.toString());
      if (!session) {
        if (msg?.t !== 'hello') return;
        clearTimeout(helloTimer);
        session = this.hello(ws, msg.name, msg.token);
        return;
      }
      if (!session.allow(Date.now())) {
        ws.close(4008, 'too many messages');
        return;
      }
      if (msg && session.ws === ws) this.handle(session, msg);
    });
    ws.on('close', () => {
      clearTimeout(helloTimer);
      if (session && session.ws === ws) this.offline(session);
    });
    ws.on('error', () => ws.terminate());
  }

  markLobby(): void {
    this.lobbyDirty = true;
  }

  removeRoom(room: Room): void {
    this.rooms.delete(room.id);
    log(`房間 #${room.id} 已關閉`);
    this.lobbyDirty = true;
  }

  sendLobby(s: Session): void {
    s.send({ t: 'lobby', rooms: this.summaries(), online: this.onlineCount() });
  }

  health() {
    return {
      ok: true,
      version: VERSION,
      rooms: this.rooms.size,
      playing: [...this.rooms.values()].filter((r) => r.phase !== 'waiting').length,
      online: this.onlineCount(),
      uptime: Math.round((Date.now() - this.started) / 1000),
    };
  }

  private hello(ws: WebSocket, rawName: string, token?: string): Session {
    let s = token ? this.sessions.get(token) : undefined;
    if (s) {
      if (s.ws && s.ws !== ws) s.ws.close(4001, 'replaced');
      if (s.dropTimer) clearTimeout(s.dropTimer);
      s.dropTimer = null;
    } else {
      s = new Session(cleanText(rawName, 12) || '玩家');
      this.sessions.set(s.token, s);
    }
    s.ws = ws;
    s.send({ t: 'welcome', id: s.id, token: s.token, name: s.name });
    if (s.room) s.room.resume(s);
    else this.sendLobby(s);
    this.lobbyDirty = true;
    return s;
  }

  private offline(s: Session): void {
    s.ws = null;
    s.room?.memberOffline(s);
    s.dropTimer = setTimeout(() => this.drop(s), RESUME_MS);
    this.lobbyDirty = true;
  }

  private drop(s: Session): void {
    s.room?.remove(s);
    this.sessions.delete(s.token);
    this.lobbyDirty = true;
  }

  private handle(s: Session, msg: C2S): void {
    switch (msg.t) {
      case 'ping':
        if (msg.r !== undefined) s.rtt = msg.r;
        s.send({ t: 'pong', c: msg.c });
        return;
      case 'hello':
        return;
      case 'create':
        return this.create(s, msg.name, msg.password);
      case 'join':
        return this.join(s, msg.room, msg.password);
      case 'quick':
        return this.quick(s);
      case 'leave':
        if (s.room) {
          s.room.remove(s);
          this.sendLobby(s);
        }
        return;
      default:
        s.room?.handle(s, msg);
    }
  }

  private create(s: Session, rawName: string, password?: string): void {
    if (s.room) return;
    const name = cleanText(rawName, 20) || `${s.name} 的房間`;
    const room = new Room(this.nextRoomId++, name, cleanText(password ?? '', 16), this);
    this.rooms.set(room.id, room);
    log(`房間 #${room.id}「${room.name}」由 ${s.name} 建立`);
    room.add(s);
  }

  private join(s: Session, id: number, password?: string): void {
    if (s.room) return;
    const room = this.rooms.get(id);
    if (!room) return s.send(errorMsg('no_room', '房間不存在'));
    if (room.phase !== 'waiting') return s.send(errorMsg('playing', '這間正在遊戲中，請稍後'));
    if (room.full) return s.send(errorMsg('full', '房間已滿'));
    if (room.password && room.password !== (password ?? '')) return s.send(errorMsg('password', '密碼錯誤'));
    room.add(s);
  }

  private quick(s: Session): void {
    if (s.room) return;
    const room = [...this.rooms.values()].find((r) => r.phase === 'waiting' && !r.full && !r.password);
    if (room) room.add(s);
    else this.create(s, '');
  }

  private summaries(): RoomSummary[] {
    return [...this.rooms.values()].map((r) => r.summary());
  }

  private onlineCount(): number {
    let n = 0;
    for (const s of this.sessions.values()) if (s.online) n++;
    return n;
  }

  private flushLobby(): void {
    if (!this.lobbyDirty) return;
    this.lobbyDirty = false;
    const raw = JSON.stringify({ t: 'lobby', rooms: this.summaries(), online: this.onlineCount() } satisfies S2C);
    for (const s of this.sessions.values()) if (!s.room && s.online) s.sendRaw(raw);
  }

  private tickRooms(): void {
    const now = performance.now();
    for (const r of this.rooms.values()) r.update(now);
  }
}
