import { MAPS } from '../../shared/maps';
import type { RoomSummary } from '../../shared/protocol';
import type { Audio } from '../audio';
import { clear, h } from '../dom';
import type { Net } from '../net';
import { modal, settingsModal } from './common';

const PHASE = { waiting: '等待中', playing: '遊戲中', results: '結算中' } as const;

export class LobbyScreen {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly online: HTMLElement;

  constructor(
    private readonly name: string,
    private readonly net: Net,
    private readonly audio: Audio,
  ) {
    this.list = h('div', { class: 'room-list' });
    this.online = h('span', { class: 'muted' });
    this.el = h(
      'div',
      { class: 'screen lobby' },
      h(
        'header',
        { class: 'topbar' },
        h('h1', { class: 'logo small' }, '水球大亂鬥'),
        h('span', { class: 'grow' }),
        h('span', null, `玩家：${name}`),
        this.online,
        h('button', { class: 'btn ghost', onclick: () => settingsModal(this.audio) }, '設定'),
      ),
      h(
        'div',
        { class: 'lobby-body' },
        h(
          'div',
          { class: 'row' },
          h('h2', { class: 'grow' }, '大廳'),
          h('button', { class: 'btn', onclick: () => this.net.send({ t: 'quick' }) }, '快速加入'),
          h('button', { class: 'btn primary', onclick: () => this.create() }, '建立房間'),
        ),
        this.list,
      ),
    );
  }

  update(rooms: RoomSummary[], online: number): void {
    this.online.textContent = `線上 ${online} 人`;
    clear(this.list);
    if (!rooms.length) {
      this.list.append(h('div', { class: 'empty' }, '目前沒有房間，建立一間找同事來玩吧！'));
      return;
    }
    for (const r of rooms) {
      const open = r.phase === 'waiting' && r.players < 4;
      this.list.append(
        h(
          'div',
          { class: `room-row ${open ? '' : 'closed'}` },
          h('span', { class: 'room-no' }, `#${r.id}`),
          h('span', { class: 'room-name grow' }, r.name, r.locked ? h('span', { class: 'badge' }, '密碼') : null),
          h('span', { class: 'muted' }, `房主 ${r.host}`),
          h(
            'span',
            null,
            r.map >= 0 ? (MAPS[r.map]?.name ?? '') : '隨機地圖',
            r.rule === 'deathmatch' ? h('span', { class: 'badge' }, '死鬥') : null,
          ),
          h('span', { class: 'count' }, `${r.players}/4`, r.bots ? h('span', { class: 'muted small' }, ` 含電腦 ${r.bots}`) : null),
          h('span', { class: `phase ${r.phase}` }, PHASE[r.phase]),
          h('button', { class: 'btn small', disabled: !open, onclick: () => this.join(r) }, '加入'),
        ),
      );
    }
  }

  private create(): void {
    modal(
      '建立房間',
      [
        { label: '房間名稱', value: `${this.name} 的房間`, max: 20 },
        { label: '密碼（可留空）', placeholder: '不設密碼就留空', max: 16 },
      ],
      '建立',
      ([name, password]) => this.net.send({ t: 'create', name: name ?? '', password: password || undefined }),
    );
  }

  private join(r: RoomSummary): void {
    if (!r.locked) {
      this.net.send({ t: 'join', room: r.id });
      return;
    }
    modal('輸入房間密碼', [{ label: '密碼', type: 'password', max: 16 }], '加入', ([password]) =>
      this.net.send({ t: 'join', room: r.id, password: password ?? '' }),
    );
  }
}
