import { CHARACTERS } from '../../shared/characters';
import { COLS, ROWS } from '../../shared/constants';
import { MAPS } from '../../shared/maps';
import type { Audio } from '../audio';
import { h, isSubmitKey } from '../dom';
import { characterSprite } from '../game/art';
import { THEMES } from '../game/themes';
import { keyEditor } from './keys';

export function portrait(char: number, color: number, scale = 2): HTMLCanvasElement {
  const ch = CHARACTERS[char] ?? CHARACTERS[0]!;
  const cv = h('canvas', { class: 'portrait', width: 20 * scale, height: 24 * scale });
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(characterSprite(ch.key, color, 2, 0), 0, 0, 20 * scale, 24 * scale);
  return cv;
}

const previews = new Map<number, string>();

/** Small top-down preview of a map (or the "random" card for id -1), cached as a data URL. */
export function mapPreview(id: number): HTMLImageElement {
  let url = previews.get(id);
  if (!url) {
    const px = 8;
    const cv = document.createElement('canvas');
    cv.width = COLS * px;
    cv.height = ROWS * px;
    const ctx = cv.getContext('2d')!;
    const map = MAPS[id];
    if (!map) {
      const g = ctx.createLinearGradient(0, 0, cv.width, cv.height);
      g.addColorStop(0, '#7c4dff');
      g.addColorStop(1, '#00b0ff');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 64px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', cv.width / 2, cv.height / 2 + 4);
    } else {
      const t = THEMES[map.key];
      const color: Record<string, string> = {
        '#': t.preview?.hard ?? t.hardDark,
        x: t.preview?.soft ?? t.softMain,
        '*': t.bush,
        o: '#a1693c',
        '~': '#3a8ee0',
        '=': '#bfe8f7',
        '<': '#4f5a63',
        '>': '#4f5a63',
        '^': '#4f5a63',
        v: '#4f5a63',
        '@': '#7e57c2',
        M: '#4f8fc0',
      };
      map.grid.forEach((row, r) =>
        [...row].forEach((ch, c) => {
          ctx.fillStyle = color[ch] ?? ((r + c) % 2 ? t.floorA : t.floorB);
          ctx.fillRect(c * px, r * px, px, px);
          if ('1234'.includes(ch)) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(c * px + 2, r * px + 2, px - 4, px - 4);
          }
        }),
      );
      if (map.night) {
        ctx.fillStyle = 'rgba(10,14,40,0.35)';
        ctx.fillRect(0, 0, cv.width, cv.height);
      }
    }
    url = cv.toDataURL();
    previews.set(id, url);
  }
  return h('img', { class: 'map-preview', src: url, alt: '' });
}

export function stars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
}

/** Simple modal dialog with text fields. */
export function modal(
  title: string,
  fields: { label: string; value?: string; placeholder?: string; type?: string; max?: number }[],
  okText: string,
  onOk: (values: string[]) => void,
): void {
  const inputs = fields.map((f) =>
    h('input', {
      class: 'input',
      value: f.value ?? '',
      placeholder: f.placeholder ?? '',
      type: f.type ?? 'text',
      maxLength: f.max ?? 20,
    }),
  );
  const close = () => back.remove();
  const ok = () => {
    close();
    onOk(inputs.map((i) => i.value));
  };
  for (const i of inputs) {
    i.addEventListener('keydown', (e) => {
      if (isSubmitKey(e)) ok();
      if (e.key === 'Escape') close();
    });
  }
  const back = h(
    'div',
    { class: 'modal-back', onclick: (e: Event) => e.target === back && close() },
    h(
      'div',
      { class: 'modal' },
      h('h3', null, title),
      ...fields.map((f, k) => h('label', { class: 'field' }, h('span', null, f.label), inputs[k])),
      h(
        'div',
        { class: 'row end' },
        h('button', { class: 'btn', onclick: close }, '取消'),
        h('button', { class: 'btn primary', onclick: ok }, okText),
      ),
    ),
  );
  document.body.append(back);
  inputs[0]?.focus();
}

/** Sound switches and the key settings; `onClose` runs when the dialog goes (e.g. to refresh key hints). */
export function settingsModal(audio: Audio, onClose?: () => void): void {
  const sfx = h('button', { class: 'btn' });
  const music = h('button', { class: 'btn' });
  const paint = () => {
    sfx.textContent = `音效：${audio.sfxOn ? '開' : '關'}`;
    music.textContent = `音樂：${audio.musicOn ? '開' : '關'}`;
  };
  sfx.onclick = () => {
    audio.toggleSfx();
    paint();
  };
  music.onclick = () => {
    audio.toggleMusic();
    paint();
  };
  paint();
  const close = () => {
    back.remove();
    onClose?.();
  };
  const back = h(
    'div',
    { class: 'modal-back', onclick: (e: Event) => e.target === back && close() },
    h(
      'div',
      { class: 'modal wide' },
      h('h3', null, '設定'),
      h('div', { class: 'row' }, sfx, music),
      h('h4', null, '按鍵'),
      keyEditor(),
      h('p', { class: 'muted small' }, '同一個動作的鍵都有效。Mac 的 Ctrl + 方向鍵會切換桌面，Mac 玩家可改用 Z 放道具。'),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: close }, '完成')),
    ),
  );
  document.body.append(back);
}
