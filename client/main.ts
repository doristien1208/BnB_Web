import './style.css';
import type { RoomSummary, RoomView, S2C } from '../shared/protocol';
import { Audio } from './audio';
import { clear, h, store, toast } from './dom';
import { GameView } from './game/view';
import { Net } from './net';
import { startSandbox } from './sandbox';
import { entryScreen } from './ui/entry';
import { LobbyScreen } from './ui/lobby';
import { RoomScreen } from './ui/room';

const app = document.getElementById('app')!;
const net = new Net();
const audio = new Audio();
const status = h('div', { class: 'net-status' });
document.body.append(status);

let meId = '';
let myName = '';
let rooms: RoomSummary[] = [];
let online = 0;
let roomView: RoomView | null = null;
let lobby: LobbyScreen | null = null;
let room: RoomScreen | null = null;
let game: GameView | null = null;

// Browsers only start audio after a user gesture.
for (const ev of ['pointerdown', 'keydown'] as const) document.addEventListener(ev, () => audio.unlock());

function show(el: HTMLElement): void {
  if (app.firstElementChild === el) return;
  clear(app);
  app.append(el);
}

function endGame(): void {
  game?.destroy();
  game = null;
}

function showLobby(): void {
  endGame();
  roomView = null;
  room = null;
  lobby = new LobbyScreen(myName, net, audio);
  lobby.update(rooms, online);
  show(lobby.el);
}

function showRoom(view: RoomView): void {
  if (!room) {
    room = new RoomScreen(meId, net, audio, () => {
      net.send({ t: 'leave' });
      showLobby();
    });
    lobby = null;
  }
  room.update(view);
  if (!game) show(room.el);
}

net.onStatus = (s) => {
  status.textContent = s === 'connecting' ? '連線中…' : s === 'offline' ? '連線中斷，正在重新連線…' : '';
  status.classList.toggle('show', s !== 'online');
};

net.onMessage = (m: S2C) => {
  switch (m.t) {
    case 'welcome':
      if (meId && meId !== m.id) showLobby(); // server restarted: the old room is gone
      meId = m.id;
      myName = m.name;
      break;
    case 'lobby':
      rooms = m.rooms;
      online = m.online;
      if (roomView) break;
      if (lobby) lobby.update(rooms, online);
      else showLobby();
      break;
    case 'room':
      roomView = m.room;
      if (m.room.phase === 'waiting') endGame();
      showRoom(m.room);
      break;
    case 'chat':
      room?.addChat(m.name, m.text);
      game?.addChat(m.name, m.text);
      break;
    case 'start':
      endGame();
      game = new GameView(m.game, meId, net, audio);
      show(game.root);
      break;
    case 'snap':
      game?.onSnap(m.s);
      break;
    case 'end':
      game?.onEnd(m.result);
      break;
    case 'error':
      toast(m.msg, 'error');
      break;
    case 'kicked':
      toast('你被房主請出房間', 'error');
      showLobby();
      break;
    case 'pong':
      break;
  }
};

function enter(name: string): void {
  audio.unlock();
  myName = name;
  show(h('div', { class: 'screen center' }, h('p', { class: 'muted' }, '連線中…')));
  net.connect(name);
}

// Refreshing the page keeps your seat: this tab still has its session token.
let resumable = false;
try {
  resumable = !!sessionStorage.getItem('bnb.token');
} catch {
  /* ignore */
}
const savedName = store.get('bnb.name');
if (new URLSearchParams(location.search).has('sandbox')) startSandbox(app, audio);
else if (resumable && savedName) enter(savedName);
else show(entryScreen(enter, audio));
