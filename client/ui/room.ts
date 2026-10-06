import { CHARACTERS } from '../../shared/characters';
import { COLORS, TEAMS } from '../../shared/colors';
import { MAX_PLAYERS, TIME_OPTIONS } from '../../shared/constants';
import { MAPS } from '../../shared/maps';
import { BOT_LEVELS, RULE_NAMES, type BotLevel, type RoomMember, type RoomView } from '../../shared/protocol';
import type { Audio } from '../audio';
import { clear, h, isSubmitKey } from '../dom';
import type { Net } from '../net';
import { mapPreview, portrait, settingsModal, stars } from './common';

function statBar(label: string, [lo, hi]: readonly [number, number]): HTMLElement {
  return h(
    'div',
    { class: 'stat' },
    h('span', null, label),
    h(
      'div',
      { class: 'bar' },
      h('i', { class: 'max', style: { width: `${hi * 10}%` } }),
      h('i', { class: 'base', style: { width: `${lo * 10}%` } }),
    ),
    h('em', null, `${lo}→${hi}`),
  );
}

function segmented<T extends string | number>(
  options: { value: T; label: string }[],
  current: T,
  enabled: boolean,
  onPick: (v: T) => void,
): HTMLElement {
  return h(
    'div',
    { class: 'seg' },
    ...options.map((o) =>
      h(
        'button',
        { class: o.value === current ? 'on' : '', disabled: !enabled, onclick: () => o.value !== current && onPick(o.value) },
        o.label,
      ),
    ),
  );
}

export class RoomScreen {
  readonly el: HTMLElement;
  private view: RoomView | null = null;
  private myColor = -1;
  private readonly keys = new Map<string, string>();
  private readonly pingEls = new Map<string, HTMLElement>();
  private readonly title = h('h2', { class: 'grow' });
  private readonly slots = h('div', { class: 'slots' });
  private readonly charCards: { card: HTMLElement; face: HTMLElement }[] = [];
  private readonly swatches: HTMLButtonElement[] = [];
  private readonly teamBox = h('div', { class: 'team-box' });
  private readonly mapCards = new Map<number, HTMLElement>();
  private readonly mapInfo = h('div', { class: 'map-info' });
  private readonly rules = h('div', { class: 'rules' });
  private readonly action = h('div', { class: 'action' });
  private readonly log = h('div', { class: 'chat-log' });
  private readonly chatInput: HTMLInputElement;

  constructor(
    private readonly meId: string,
    private readonly net: Net,
    private readonly audio: Audio,
    onLeave: () => void,
  ) {
    const chars = h('div', { class: 'chars' });
    for (const c of CHARACTERS) {
      const face = h('span', { class: 'face' });
      const card = h(
        'button',
        { class: 'char-card', onclick: () => this.net.send({ t: 'pick', char: c.id }) },
        face,
        h('strong', null, `${c.animal}「${c.name}」`),
        h('span', { class: 'role' }, `${c.role}：${c.desc}`),
        statBar('水球', c.bal),
        statBar('水柱', c.pow),
        statBar('速度', c.spd),
      );
      this.charCards.push({ card, face });
      chars.append(card);
    }
    const palette = h('div', { class: 'palette' });
    for (const col of COLORS) {
      const sw = h('button', {
        class: 'swatch',
        title: col.name,
        style: { background: col.main },
        onclick: () => this.net.send({ t: 'pick', color: col.id }),
      });
      this.swatches.push(sw);
      palette.append(sw);
    }
    const maps = h('div', { class: 'maps' });
    for (const id of [-1, ...MAPS.map((m) => m.id)]) {
      const m = MAPS[id];
      const card = h(
        'button',
        { class: 'map-card', onclick: () => this.net.send({ t: 'config', map: id }) },
        mapPreview(id),
        h('span', null, m ? `${id + 1}. ${m.name}` : `${MAPS.length + 1}. 隨機`),
        h('em', null, m ? stars(m.stars) : '每局抽一張'),
      );
      this.mapCards.set(id, card);
      maps.append(card);
    }
    this.chatInput = h('input', { class: 'input', maxLength: 100, placeholder: '說點什麼…（Enter 送出）' });
    const send = () => {
      const text = this.chatInput.value.trim();
      if (text) this.net.send({ t: 'chat', text });
      this.chatInput.value = '';
    };
    // with a Chinese IME, the first Enter only confirms the composition; sending then would leave the
    // confirmed text behind in the box
    this.chatInput.addEventListener('keydown', (e) => isSubmitKey(e) && send());

    this.el = h(
      'div',
      { class: 'screen room' },
      h(
        'header',
        { class: 'topbar' },
        this.title,
        h('button', { class: 'btn ghost', onclick: () => settingsModal(this.audio) }, '設定'),
        h('button', { class: 'btn ghost', onclick: onLeave }, '離開房間'),
      ),
      h(
        'div',
        { class: 'room-body' },
        h('section', { class: 'panel players' }, h('h3', null, '玩家'), this.slots),
        h(
          'section',
          { class: 'panel pick' },
          h('h3', null, '選擇角色'),
          chars,
          h('h3', null, '顏色'),
          h('p', { class: 'muted small' }, '同一個角色不能同色；灰掉的顏色已被同角色的玩家使用。'),
          palette,
          this.teamBox,
        ),
        h(
          'section',
          { class: 'panel setup' },
          h('h3', null, '地圖'),
          maps,
          this.mapInfo,
          h('h3', null, '規則'),
          this.rules,
        ),
        h(
          'section',
          { class: 'panel chat' },
          this.log,
          h('div', { class: 'row' }, this.chatInput, h('button', { class: 'btn', onclick: send }, '送出')),
        ),
        h('section', { class: 'panel go' }, this.action),
      ),
    );
  }

  private get me(): RoomMember | undefined {
    return this.view?.members.find((m) => m.id === this.meId);
  }

  update(view: RoomView): void {
    this.view = view;
    const me = this.me;
    const host = !!me?.host;
    const cfg = view.config;
    this.title.textContent = `#${view.id} ${view.name}`;
    if (view.locked) this.title.append(h('span', { class: 'badge' }, '密碼'));

    // players (sections are only rebuilt when their data changed, so buttons don't vanish mid-click)
    const slotData = view.members.map((m) => ({ ...m, ping: 0 }));
    if (this.changed('slots', [slotData, cfg.mode, cfg.assign, view.phase, host])) this.renderSlots(view, host);
    for (const m of view.members) {
      const el = this.pingEls.get(m.id);
      if (el) el.textContent = m.connected ? `${m.ping} ms` : '斷線中';
    }

    // character + colour
    const myColor = me?.color ?? 0;
    this.charCards.forEach(({ card, face }, id) => {
      card.classList.toggle('on', me?.char === id);
      if (this.myColor !== myColor || !face.firstChild) {
        clear(face);
        face.append(portrait(id, myColor, 2));
      }
    });
    this.myColor = myColor;
    this.swatches.forEach((sw, id) => {
      const taken = view.members.some((m) => m.id !== this.meId && m.char === me?.char && m.color === id);
      sw.disabled = taken;
      sw.classList.toggle('on', me?.color === id);
    });

    if (this.changed('team', [cfg.mode, cfg.assign, me?.team])) this.renderTeam(view);
    for (const [id, card] of this.mapCards) {
      card.classList.toggle('on', cfg.map === id);
      (card as HTMLButtonElement).disabled = !host;
    }
    if (this.changed('mapInfo', cfg.map)) this.renderMapInfo(cfg.map);
    if (this.changed('rules', [cfg, host])) this.renderRules(view, host);
    const others = view.members.filter((m) => !m.host && m.bot === undefined);
    const ready = others.filter((m) => m.ready).length;
    if (this.changed('action', [host, me?.ready, ready, others.length, view.members.length, cfg.mode])) {
      this.renderAction(view, host, ready, others.length);
    }
  }

  private changed(part: string, data: unknown): boolean {
    const key = JSON.stringify(data);
    if (this.keys.get(part) === key) return false;
    this.keys.set(part, key);
    return true;
  }

  private renderSlots(view: RoomView, host: boolean): void {
    const cfg = view.config;
    clear(this.slots);
    this.pingEls.clear();
    const full = view.members.length >= MAX_PLAYERS;
    for (let slot = 0; slot < 4; slot++) {
      const m = view.members.find((x) => x.slot === slot);
      if (!m) {
        this.slots.append(
          h(
            'div',
            { class: 'slot empty' },
            h('span', { class: 'pnum' }, `P${slot + 1}`),
            h('span', null, '等待玩家加入…'),
            host && !full && view.phase === 'waiting'
              ? h('button', { class: 'btn tiny add-bot', onclick: () => this.net.send({ t: 'addBot', level: 1 }) }, '＋ 加入電腦')
              : null,
          ),
        );
        continue;
      }
      if (m.bot !== undefined) {
        this.slots.append(this.botSlot(view, m, m.bot, host));
        continue;
      }
      const ch = CHARACTERS[m.char]!;
      const team = cfg.mode === 'team' ? TEAMS[m.team] : undefined;
      const ping = h('span', { class: 'muted small' });
      this.pingEls.set(m.id, ping);
      this.slots.append(
        h(
          'div',
          { class: `slot ${m.id === this.meId ? 'mine' : ''}`, style: { borderColor: COLORS[m.color]?.main ?? '#ccc' } },
          h('span', { class: 'pnum' }, `P${slot + 1}`),
          portrait(m.char, m.color, 3),
          h(
            'div',
            { class: 'slot-info' },
            h('strong', null, m.name, m.id === this.meId ? '（你）' : ''),
            h('span', { class: 'muted' }, `${ch.animal}「${ch.name}」· ${COLORS[m.color]?.name ?? ''}色`),
            h(
              'div',
              { class: 'row' },
              m.host
                ? h('span', { class: 'badge host' }, '房主')
                : h('span', { class: `badge ${m.ready ? 'ready' : 'wait'}` }, m.ready ? '準備好了' : '準備中…'),
              team ? h('span', { class: 'badge team', style: { background: team.ring } }, team.label) : null,
              ping,
            ),
          ),
          host && !m.host
            ? h('button', { class: 'btn tiny', onclick: () => this.net.send({ t: 'kick', id: m.id }) }, '踢出')
            : null,
        ),
      );
    }
  }

  /** A computer player's seat; the host picks its character, colour, team and difficulty here. */
  private botSlot(view: RoomView, m: RoomMember, level: BotLevel, host: boolean): HTMLElement {
    const ch = CHARACTERS[m.char]!;
    const cfg = view.config;
    const team = cfg.mode === 'team' ? TEAMS[m.team] : undefined;
    const set = (patch: { char?: number; color?: number; team?: number; level?: BotLevel }) =>
      this.net.send({ t: 'setBot', id: m.id, ...patch });
    const nextColor = () => {
      const taken = (c: number) => view.members.some((o) => o.id !== m.id && o.char === m.char && o.color === c);
      for (let k = 1; k <= COLORS.length; k++) {
        const c = (m.color + k) % COLORS.length;
        if (!taken(c)) return c;
      }
      return m.color;
    };
    const controls = host
      ? h(
          'div',
          { class: 'row bot-controls' },
          h(
            'select',
            { class: 'mini', title: '角色', onchange: (e: Event) => set({ char: Number((e.target as HTMLSelectElement).value) }) },
            CHARACTERS.map((c) => h('option', { value: String(c.id), selected: c.id === m.char }, `${c.animal}${c.name}`)),
          ),
          h('button', { class: 'btn tiny', title: '換顏色', onclick: () => set({ color: nextColor() }) }, '換色'),
          h(
            'select',
            { class: 'mini', title: '難度', onchange: (e: Event) => set({ level: Number((e.target as HTMLSelectElement).value) as BotLevel }) },
            BOT_LEVELS.map((name, k) => h('option', { value: String(k), selected: k === level }, name)),
          ),
          team && cfg.assign === 'free'
            ? h('button', { class: 'btn tiny', title: '換隊', onclick: () => set({ team: 1 - m.team }) }, '換隊')
            : null,
        )
      : null;
    return h(
      'div',
      { class: 'slot bot', style: { borderColor: COLORS[m.color]?.main ?? '#ccc' } },
      h('span', { class: 'pnum' }, `P${m.slot + 1}`),
      portrait(m.char, m.color, 3),
      h(
        'div',
        { class: 'slot-info' },
        h('strong', null, m.name),
        h('span', { class: 'muted' }, `${ch.animal}「${ch.name}」· ${COLORS[m.color]?.name ?? ''}色`),
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'badge bot' }, `電腦 · ${BOT_LEVELS[level]}`),
          team ? h('span', { class: 'badge team', style: { background: team.ring } }, team.label) : null,
        ),
        controls,
      ),
      host ? h('button', { class: 'btn tiny', onclick: () => this.net.send({ t: 'kick', id: m.id }) }, '移除') : null,
    );
  }

  private renderTeam(view: RoomView): void {
    const cfg = view.config;
    clear(this.teamBox);
    if (cfg.mode !== 'team') return;
    this.teamBox.append(h('h3', null, '隊伍'));
    if (cfg.assign === 'random') {
      this.teamBox.append(h('p', { class: 'muted small' }, '開局時隨機分隊'));
      return;
    }
    this.teamBox.append(
      segmented(
        TEAMS.map((t, k) => ({ value: k, label: t.label })),
        this.me?.team ?? 0,
        true,
        (team) => this.net.send({ t: 'pick', team }),
      ),
    );
  }

  private renderMapInfo(id: number): void {
    const map = MAPS[id];
    clear(this.mapInfo);
    this.mapInfo.append(
      map
        ? h('div', null, h('strong', null, `${map.name}（${map.tag}）`), h('span', { class: 'muted' }, `　${map.desc}`))
        : h('div', null, h('strong', null, '隨機'), h('span', { class: 'muted' }, `　開局時從 ${MAPS.length} 張地圖抽一張，不與上一局重複`)),
    );
  }

  private renderRules(view: RoomView, host: boolean): void {
    const cfg = view.config;
    clear(this.rules);
    this.rules.append(
      h('label', null, '規則'),
      segmented(
        [
          { value: 'survival' as const, label: RULE_NAMES.survival },
          { value: 'deathmatch' as const, label: RULE_NAMES.deathmatch },
        ],
        cfg.rule,
        host,
        (rule) => this.net.send({ t: 'config', rule }),
      ),
      h(
        'p',
        { class: 'muted small' },
        cfg.rule === 'deathmatch' ? '時間內擊殺最多者獲勝；死後 3 秒原地復活，無敵 1.5 秒' : '撐到最後的一方獲勝',
      ),
      h('label', null, '模式'),
      segmented(
        [
          { value: 'ffa' as const, label: '個人戰' },
          { value: 'team' as const, label: '團隊戰' },
        ],
        cfg.mode,
        host,
        (mode) => this.net.send({ t: 'config', mode }),
      ),
    );
    if (cfg.mode === 'team') {
      this.rules.append(
        h('label', null, '分隊'),
        segmented(
          [
            { value: 'free' as const, label: '自由選隊' },
            { value: 'random' as const, label: '隨機分隊' },
          ],
          cfg.assign,
          host,
          (assign) => this.net.send({ t: 'config', assign }),
        ),
      );
    }
    this.rules.append(
      h('label', null, '時間'),
      segmented(
        TIME_OPTIONS.map((s) => ({ value: s as number, label: `${s / 60} 分鐘` })),
        cfg.time,
        host,
        (time) => this.net.send({ t: 'config', time }),
      ),
    );
    if (!host) this.rules.append(h('p', { class: 'muted small' }, '地圖與規則由房主設定'));
  }

  private renderAction(view: RoomView, host: boolean, ready: number, others: number): void {
    const me = this.me;
    clear(this.action);
    if (host) {
      this.action.append(
        h('button', { class: 'btn primary big', onclick: () => this.net.send({ t: 'start' }) }, '開始遊戲'),
        h(
          'p',
          { class: 'muted small' },
          view.members.length < 2 ? '至少要 2 人，可以按「＋ 加入電腦」' : others ? `已準備 ${ready}/${others}` : '可以開始了',
          view.config.mode === 'team' ? '；團隊戰需 3–4 人' : '',
        ),
      );
    } else {
      this.action.append(
        h(
          'button',
          { class: `btn big ${me?.ready ? '' : 'primary'}`, onclick: () => this.net.send({ t: 'ready', ready: !me?.ready }) },
          me?.ready ? '取消準備' : '準備',
        ),
        h('p', { class: 'muted small' }, '全員準備後由房主開始'),
      );
    }
  }

  addChat(name: string, text: string): void {
    this.log.append(
      name ? h('div', null, h('strong', null, `${name}：`), text) : h('div', { class: 'system' }, text),
    );
    while (this.log.childElementCount > 80) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }
}
