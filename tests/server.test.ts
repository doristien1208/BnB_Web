import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { C2S, S2C } from '../shared/protocol';
import { createApp } from '../server/app';

let url = '';
const app = createApp(null);

beforeAll(async () => {
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  url = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/ws`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => app.server.close(() => resolve()));
});

/** Minimal bot client that records every message it receives. */
class Bot {
  ws: WebSocket;
  inbox: S2C[] = [];
  constructor(origin?: string) {
    this.ws = new WebSocket(url, origin ? { headers: { origin } } : undefined);
    this.ws.on('message', (d) => this.inbox.push(JSON.parse(d.toString()) as S2C));
  }
  open() {
    return new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }
  send(msg: C2S) {
    this.ws.send(JSON.stringify(msg));
  }
  async wait<T extends S2C['t']>(t: T, pred: (m: Extract<S2C, { t: T }>) => boolean = () => true, ms = 6000) {
    const until = Date.now() + ms;
    for (;;) {
      const hit = this.inbox.find((m) => m.t === t && pred(m as Extract<S2C, { t: T }>));
      if (hit) return hit as Extract<S2C, { t: T }>;
      if (Date.now() > until) throw new Error(`timed out waiting for ${t}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  close() {
    this.ws.close();
  }
}

describe('server', () => {
  it('rejects sockets from another origin', async () => {
    const bot = new Bot('http://evil.example');
    await expect(bot.open()).rejects.toThrow();
  });

  it('runs lobby, waiting room and a networked round', async () => {
    const alice = new Bot();
    const bob = new Bot();
    await Promise.all([alice.open(), bob.open()]);
    alice.send({ t: 'hello', name: '  Alice  ' });
    bob.send({ t: 'hello', name: 'Bob' });
    const welcome = await alice.wait('welcome');
    expect(welcome.name).toBe('Alice');
    await bob.wait('lobby');

    alice.send({ t: 'create', name: '測試房' });
    const created = await alice.wait('room');
    expect(created.room.members).toHaveLength(1);

    bob.send({ t: 'join', room: created.room.id });
    await alice.wait('room', (m) => m.room.members.length === 2);

    // same character, same colour is refused
    const bobView = await bob.wait('room', (m) => m.room.members.length === 2);
    const aliceMember = bobView.room.members.find((m) => m.name === 'Alice')!;
    bob.send({ t: 'pick', char: aliceMember.char, color: aliceMember.color });
    await bob.wait('error', (m) => m.code === 'color');

    alice.send({ t: 'start' });
    await alice.wait('error', (m) => m.code === 'start'); // Bob is not ready yet

    bob.send({ t: 'ready', ready: true });
    await alice.wait('room', (m) => m.room.members.some((x) => x.ready));
    alice.send({ t: 'config', map: 0 });
    await alice.wait('room', (m) => m.room.config.map === 0);
    alice.send({ t: 'start' });
    const start = await bob.wait('start');
    expect(start.game.players).toHaveLength(2);
    expect(start.game.map).toBe(0);

    const first = await alice.wait('snap');
    expect(first.s.g).toHaveLength(195);
    const playing = await alice.wait('snap', (m) => m.s.ph === 1);
    const me = playing.s.p.find((p) => p.i === welcome.id)!;

    // move toward the open side of the spawn corner and drop a balloon
    const dir = me.x < 300 ? 4 : 3;
    alice.send({ t: 'in', d: dir, d2: 0 });
    alice.send({ t: 'act', a: 'b' });
    const moved = await alice.wait('snap', (m) => {
      const p = m.s.p.find((x) => x.i === welcome.id)!;
      return Math.abs(p.x - me.x) > 10 && m.s.b.length > 0;
    });
    expect(moved.s.b[0]!.o).toBe(welcome.id);

    alice.close();
    bob.close();
  }, 15000);

  it('fills seats with computer players that play the round', async () => {
    const carol = new Bot();
    await carol.open();
    carol.send({ t: 'hello', name: 'Carol' });
    const welcome = await carol.wait('welcome');
    carol.send({ t: 'create', name: '電腦房' });
    const room = await carol.wait('room');
    carol.send({ t: 'start' });
    await carol.wait('error', (m) => m.code === 'start'); // alone: not enough players yet

    carol.send({ t: 'addBot', level: 2 });
    carol.send({ t: 'addBot', level: 0 });
    const full = await carol.wait('room', (m) => m.room.members.length === 3);
    const bots = full.room.members.filter((m) => m.bot !== undefined);
    expect(bots.map((m) => m.bot)).toEqual([2, 0]);
    expect(bots.every((m) => m.ready && !m.host)).toBe(true);
    expect(new Set(full.room.members.map((m) => m.slot)).size).toBe(3);

    // the host sets a computer player up, and can take it out again
    carol.send({ t: 'setBot', id: bots[1]!.id, level: 1, char: 4 });
    await carol.wait('room', (m) => m.room.members.some((x) => x.id === bots[1]!.id && x.bot === 1 && x.char === 4));
    carol.send({ t: 'kick', id: bots[1]!.id });
    await carol.wait('room', (m) => m.room.members.length === 2);
    carol.send({ t: 'addBot', level: 2 });
    carol.send({ t: 'addBot', level: 2 });
    carol.send({ t: 'addBot', level: 2 }); // a fifth seat does not exist
    await carol.wait('error', (m) => m.code === 'full');
    expect(app.hub.rooms.get(room.room.id)!.summary()).toMatchObject({ players: 4, bots: 3 });

    carol.send({ t: 'config', map: 8 });
    carol.send({ t: 'start' });
    const start = await carol.wait('start');
    expect(start.game.players.filter((p) => p.bot === 2)).toHaveLength(3);
    const go = await carol.wait('snap', (m) => m.s.ph === 1);
    const botIds = start.game.players.filter((p) => p.bot !== undefined).map((p) => p.id);
    const startPos = new Map(go.s.p.map((p) => [p.i, `${p.x},${p.y}`]));
    // computer players move on their own
    await carol.wait('snap', (m) => m.s.p.some((p) => botIds.includes(p.i) && `${p.x},${p.y}` !== startPos.get(p.i)));
    expect(welcome.id).toBeTruthy();

    // when the last person leaves, the room closes even though computer players are still seated
    carol.inbox.length = 0;
    carol.send({ t: 'leave' });
    await carol.wait('lobby', (m) => !m.rooms.some((r) => r.id === room.room.id));
    expect(app.hub.rooms.has(room.room.id)).toBe(false);
    carol.close();
  }, 15000);
});
