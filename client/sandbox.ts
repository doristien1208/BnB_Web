import { TICK_MS } from '../shared/constants';
import { MAPS } from '../shared/maps';
import type { C2S, GameStartInfo, Mode } from '../shared/protocol';
import { Game } from '../shared/sim/game';
import type { Audio } from './audio';
import { GameView, type Link } from './game/view';

/**
 * Offline practice for trying maps alone (and for visual checks):
 * `?sandbox&map=3&n=2&mode=team` runs the simulation in the browser; the other players stand still.
 */
export function startSandbox(app: HTMLElement, audio: Audio): void {
  const q = new URLSearchParams(location.search);
  const map = Math.max(0, Math.min(MAPS.length - 1, Math.round(Number(q.get('map') ?? 0)) || 0));
  const n = Math.max(1, Math.min(4, Math.round(Number(q.get('n') ?? 2)) || 2));
  const mode: Mode = q.get('mode') === 'team' ? 'team' : 'ffa';
  const info: GameStartInfo = {
    map,
    mode,
    time: 300,
    players: Array.from({ length: n }, (_, k) => ({
      id: `p${k}`,
      name: k === 0 ? '我' : `木頭人${k}`,
      char: k % 6,
      color: k,
      team: mode === 'team' ? k % 2 : -1,
      slot: k,
    })),
  };
  const game = new Game(MAPS[map]!, info.players, { mode, time: info.time, seed: Date.now() & 0x7fffffff });
  const link: Link = {
    rtt: 0,
    send(m: C2S) {
      if (m.t === 'in') game.setInput('p0', m.d, m.d2);
      else if (m.t === 'act') game.pushAction('p0', m.a);
      else if (m.t === 'chat') view.addChat('我', m.text);
    },
  };
  const view = new GameView(info, 'p0', link, audio);
  app.replaceChildren(view.root);
  let next = performance.now();
  const timer = window.setInterval(() => {
    const now = performance.now();
    while (now >= next) {
      game.step();
      view.onSnap(game.snapshot());
      next += TICK_MS;
      if (game.phase === 'over' && game.result) {
        window.clearInterval(timer);
        view.onEnd(game.result);
        return;
      }
    }
  }, 4);
}
