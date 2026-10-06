import { COLS, TILE } from '../../shared/constants';

/**
 * 程式碼空間: the six regions of the floor are editor panes showing real code. Each pane gets a random
 * snippet (no two panes the same) scrolled to a random line, and loads another one after each of its
 * errors. While a region errors its lines get red squiggles and the pane prints the language's own crash
 * message. Panes are drawn at the screen's real resolution so the text stays sharp.
 */
type Lang = 'py' | 'js' | 'ts' | 'c' | 'cpp' | 'go' | 'rust' | 'java' | 'sql' | 'sh' | 'lua' | 'css';

interface Snippet {
  lang: Lang;
  file: string;
  code: string;
}

const MONO = 'Menlo, Consolas, "Courier New", monospace';
const FONT_PX = 10;
const LINE_H = TILE / 3; // three lines per tile row
const GUTTER = 22; // line numbers

/** Syntax colours, muted on the dark floor so players, balloons and items stand out. */
const INK = {
  plain: '#8a93b1',
  kw: '#a587d1',
  fn: '#6f9fdf',
  str: '#92bc72',
  num: '#d79b67',
  com: '#4f5a7a',
  type: '#d4b56b',
  punct: '#69728f',
} as const;
type Ink = keyof typeof INK;

const words = (s: string) => new Set(s.split(' '));
const C_WORDS = 'int char void return if else for while const static struct unsigned long sizeof break continue NULL include define';
const JS_WORDS =
  'function return if else for of in const let var new async await throw try catch class extends import export from default null undefined true false this while break continue typeof';
const KEYWORDS: Record<Lang, Set<string>> = {
  py: words('def return if elif else for while in not and or import from as class with try except raise lambda None True False pass break continue yield self'),
  js: words(JS_WORDS),
  ts: words(`${JS_WORDS} interface type enum implements readonly private public number string boolean void`),
  c: words(C_WORDS),
  cpp: words(`${C_WORDS} std auto class public private template typename namespace using bool true false`),
  go: words('func return if else for range var const type struct package import map chan go defer nil true false any'),
  rust: words('fn let mut return if else for in while match enum struct impl pub use self Self true false loop break'),
  java: words('public private protected class static final void return if else for while new boolean int import extends implements true false null this'),
  sql: words('SELECT FROM WHERE JOIN ON GROUP BY ORDER LIMIT AS AND OR NOT IN COUNT DESC ASC DATE INSERT INTO VALUES UPDATE SET LEFT'),
  sh: words('if then fi for in do done echo set export local function return while case esac'),
  lua: words('local function return if then else elseif end for in do while nil true false and or not'),
  css: words('@keyframes from to infinite alternate linear ease none'),
};
const COMMENT: Record<Lang, string> = {
  py: '#', js: '//', ts: '//', c: '//', cpp: '//', go: '//', rust: '//', java: '//', sql: '--', sh: '#', lua: '--', css: '/*',
};

/** What each language prints when it falls over: shown on an erroring pane and in the crash dialog. */
const CRASH: Record<Lang, readonly string[]> = {
  py: ["TypeError: 'NoneType' object is not subscriptable", 'IndexError: list index out of range', 'ZeroDivisionError: division by zero', "KeyError: 'power'"],
  js: ["TypeError: Cannot read properties of undefined (reading 'x')", 'RangeError: Maximum call stack size exceeded', 'ReferenceError: balloon is not defined'],
  ts: ["error TS2339: Property 'pow' does not exist on type 'Player'.", "TypeError: Cannot read properties of null (reading 'fuse')"],
  c: ['Segmentation fault (core dumped)', 'free(): double free detected in tcache 2', 'Bus error (core dumped)'],
  cpp: ["terminate called after throwing an instance of 'std::out_of_range'", 'Segmentation fault (core dumped)'],
  go: ['panic: runtime error: index out of range [5] with length 3', 'panic: runtime error: invalid memory address or nil pointer dereference', 'fatal error: all goroutines are asleep - deadlock!'],
  rust: ["thread 'main' panicked: called `Option::unwrap()` on a `None` value", 'error[E0382]: borrow of moved value: `player`'],
  java: ['Exception in thread "main" java.lang.NullPointerException', 'java.lang.ArrayIndexOutOfBoundsException: Index 4 out of bounds for length 4'],
  sql: ['ERROR: syntax error at or near "FROM"', 'ERROR: column "kills" does not exist', 'ERROR: deadlock detected'],
  sh: ['bash: npm: command not found', 'bash: ./deploy.sh: Permission denied', "gzip: dist/*.js: No such file or directory"],
  lua: ["attempt to index a nil value (local 'player')", 'stack overflow'],
  css: ["Unexpected token '}'", "Invalid property value: 'wobble'"],
};

const SNIPPETS: readonly Snippet[] = [
  {
    lang: 'py',
    file: 'splash.py',
    code: `# where a balloon's stream reaches: four arms, stopped by walls
def splash(grid, x, y, power):
    hit = [(x, y)]
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        for step in range(1, power + 1):
            nx, ny = x + dx * step, y + dy * step
            tile = grid[ny][nx]
            if tile == '#':
                break
            hit.append((nx, ny))
            if tile == 'x':  # a crate soaks it up
                break
    return hit`,
  },
  {
    lang: 'py',
    file: 'sort.py',
    code: `def quicksort(xs):
    if len(xs) <= 1:
        return xs
    pivot, *rest = xs
    left = [x for x in rest if x < pivot]
    right = [x for x in rest if x >= pivot]
    return quicksort(left) + [pivot] + quicksort(right)


if __name__ == '__main__':
    scores = [42, 7, 19, 88, 3, 56]
    print(quicksort(scores))`,
  },
  {
    lang: 'js',
    file: 'loop.js',
    code: `let last = performance.now();

function frame(now) {
  const dt = Math.min(now - last, 50);
  last = now;
  for (const p of players) p.update(dt);
  balloons = balloons.filter((b) => !b.popped);
  draw(ctx, world);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);`,
  },
  {
    lang: 'js',
    file: 'rooms.js',
    code: `async function loadRooms() {
  const res = await fetch('/api/rooms');
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  const rooms = await res.json();
  return rooms
    .filter((r) => r.players < 4)
    .sort((a, b) => b.players - a.players);
}

loadRooms()
  .then(render)
  .catch((err) => console.error(err));`,
  },
  {
    lang: 'ts',
    file: 'fuse.ts',
    code: `interface Balloon {
  x: number;
  y: number;
  fuse: number;
}

export function tick(list: Balloon[]): Balloon[] {
  return list
    .map((b) => ({ ...b, fuse: b.fuse - 1 }))
    .filter((b) => b.fuse > 0);
}

const ready = tick(balloons).length;`,
  },
  {
    lang: 'c',
    file: 'search.c',
    code: `#include <stdio.h>

int find(const int *a, int n, int key) {
    int lo = 0, hi = n - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] == key) return mid;
        if (a[mid] < key) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;
}`,
  },
  {
    lang: 'cpp',
    file: 'bfs.cpp',
    code: `std::vector<int> bfs(const Graph& g, int start) {
    std::vector<int> dist(g.size(), -1);
    std::queue<int> q;
    dist[start] = 0;
    q.push(start);
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        for (int v : g[u])
            if (dist[v] < 0) dist[v] = dist[u] + 1, q.push(v);
    }
    return dist;
}`,
  },
  {
    lang: 'go',
    file: 'health.go',
    code: `package main

func health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"ok":      true,
		"rooms":   len(hub.rooms),
		"players": hub.Online(),
	})
}

func main() {
	http.HandleFunc("/healthz", health)
	log.Fatal(http.ListenAndServe(":3000", nil))
}`,
  },
  {
    lang: 'rust',
    file: 'items.rs',
    code: `enum Item {
    Balloon,
    Potion,
    Skate,
}

fn apply(p: &mut Player, item: Item) {
    match item {
        Item::Balloon => p.bal = (p.bal + 1).min(10),
        Item::Potion => p.pow = (p.pow + 1).min(7),
        Item::Skate => p.spd += 1,
    }
}`,
  },
  {
    lang: 'java',
    file: 'Room.java',
    code: `public class Room {
    private final List<Player> seats = new ArrayList<>();

    public boolean join(Player p) {
        if (seats.size() >= 4) return false;
        seats.add(p);
        return true;
    }

    public boolean ready() {
        return seats.size() >= 2;
    }
}`,
  },
  {
    lang: 'sql',
    file: 'top10.sql',
    code: `-- most kills this season
SELECT p.name, COUNT(*) AS kills
FROM kills k
JOIN players p ON p.id = k.player_id
WHERE k.at >= DATE '2026-01-01'
GROUP BY p.name
ORDER BY kills DESC
LIMIT 10;`,
  },
  {
    lang: 'sh',
    file: 'deploy.sh',
    code: `#!/usr/bin/env bash
set -euo pipefail

npm ci
npm run build

for f in dist/*.js; do
  echo "packing $f"
  gzip -k "$f"
done

echo "done"`,
  },
  {
    lang: 'lua',
    file: 'respawn.lua',
    code: `local function respawn(player, x, y)
  player.x, player.y = x, y
  player.invuln = 1.5
  player.alive = true
  return player
end

for _, p in ipairs(players) do
  if not p.alive and p.timer <= 0 then
    respawn(p, p.deathX, p.deathY)
  end
end`,
  },
  {
    lang: 'css',
    file: 'balloon.css',
    code: `.balloon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: radial-gradient(#8fd0ff, #1e88e5);
  animation: wobble 0.6s infinite alternate;
}

@keyframes wobble {
  from { transform: scale(1); }
  to { transform: scale(1.08); }
}`,
  },
];

const TOKEN = /\s+|"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`[^`]*`?|\d[\w.]*|[A-Za-z_$@][\w$]*|./y;

/** Splits a line into coloured tokens; good enough for the snippets above. */
function highlight(line: string, lang: Lang): [string, Ink][] {
  const out: [string, Ink][] = [];
  const kw = KEYWORDS[lang];
  const com = COMMENT[lang];
  let at = 0;
  while (at < line.length) {
    if (line.startsWith(com, at)) {
      out.push([line.slice(at), 'com']);
      break;
    }
    TOKEN.lastIndex = at;
    const t = TOKEN.exec(line)?.[0] ?? line[at]!;
    at += t.length;
    let ink: Ink = 'punct';
    if (/^\s/.test(t)) ink = 'plain';
    else if (/^["'`]/.test(t)) ink = 'str';
    else if (/^\d/.test(t)) ink = 'num';
    else if (/^[A-Za-z_$@]/.test(t)) {
      const next = line.slice(at).trimStart()[0];
      if (kw.has(t)) ink = 'kw';
      else if (next === '(' || (lang === 'css' && next === ':')) ink = 'fn';
      else if (/^[A-Z]/.test(t) && lang !== 'sql') ink = 'type';
      else ink = 'plain';
    }
    out.push([t, ink]);
  }
  return out;
}

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

function shuffled<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

interface Pane {
  x: number;
  y: number;
  w: number;
  h: number;
  snippet: Snippet;
  /** first line shown (0-based): a pane shows a scrolled part of a longer snippet */
  from: number;
  crash: string;
  canvas: HTMLCanvasElement | null;
  /** drawn width of each visible line, for the error squiggles */
  widths: number[];
}

export class CodeFloor {
  private readonly panes: Pane[];
  private scale = 0;

  constructor(regionTiles: readonly (readonly number[])[]) {
    const order = shuffled(SNIPPETS);
    this.panes = regionTiles.map((tiles, k) => {
      const cols = tiles.map((i) => i % COLS);
      const rows = tiles.map((i) => Math.floor(i / COLS));
      const x = Math.min(...cols) * TILE;
      const y = Math.min(...rows) * TILE;
      const pane: Pane = {
        x,
        y,
        w: (Math.max(...cols) + 1) * TILE - x,
        h: (Math.max(...rows) + 1) * TILE - y,
        snippet: order[k % order.length]!,
        from: 0,
        crash: '',
        canvas: null,
        widths: [],
      };
      this.show(pane, pane.snippet);
      return pane;
    });
  }

  private show(pane: Pane, snippet: Snippet): void {
    pane.snippet = snippet;
    const lines = snippet.code.split('\n').length;
    const fit = Math.floor(pane.h / LINE_H);
    pane.from = lines > fit ? Math.floor(Math.random() * (lines - fit + 1)) : 0;
    pane.crash = pick(CRASH[snippet.lang]);
    pane.canvas = null;
  }

  /** The region's error is over: it comes back with other code (the hotfix), code no other pane shows. */
  reload(region: number): void {
    const pane = this.panes[region];
    if (!pane) return;
    const shown = new Set(this.panes.map((p) => p.snippet));
    const choices = SNIPPETS.filter((s) => !shown.has(s));
    this.show(pane, pick(choices.length ? choices : SNIPPETS));
  }

  /** The message a region's code crashes with. */
  crashOf(region: number): string {
    return this.panes[region]?.crash ?? 'Segmentation fault (core dumped)';
  }

  /** Draws the code of every pane; `scale` is device pixels per field pixel. */
  draw(ctx: CanvasRenderingContext2D, scale: number): void {
    if (scale !== this.scale) {
      this.scale = scale;
      for (const pane of this.panes) pane.canvas = null;
    }
    for (const pane of this.panes) {
      pane.canvas ??= this.render(pane);
      ctx.drawImage(pane.canvas, pane.x, pane.y, pane.w, pane.h);
    }
  }

  private render(pane: Pane): HTMLCanvasElement {
    const s = this.scale;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(pane.w * s);
    canvas.height = Math.ceil(pane.h * s);
    const c = canvas.getContext('2d')!;
    c.scale(s, s);
    c.font = `${FONT_PX}px ${MONO}`;
    c.textBaseline = 'middle';
    const lines = pane.snippet.code.replace(/\t/g, '    ').split('\n');
    const fit = Math.floor(pane.h / LINE_H);
    pane.widths = [];
    for (let k = 0; k < fit; k++) {
      const n = pane.from + k;
      const line = lines[n];
      if (line === undefined) break;
      const y = (k + 0.5) * LINE_H;
      c.textAlign = 'right';
      c.fillStyle = '#3a4260';
      c.fillText(String(n + 1), GUTTER - 6, y);
      c.textAlign = 'left';
      let x = GUTTER;
      for (const [t, ink] of highlight(line, pane.snippet.lang)) {
        c.fillStyle = INK[ink];
        c.fillText(t, x, y);
        x += c.measureText(t).width;
      }
      pane.widths.push(Math.min(x, pane.w) - GUTTER);
    }
    // the file's name in the top-right corner, like an editor tab
    const tab = c.measureText(pane.snippet.file).width + 10;
    c.fillStyle = '#161a26';
    c.fillRect(pane.w - tab, 0, tab, LINE_H);
    c.textAlign = 'right';
    c.fillStyle = '#6b7494';
    c.fillText(pane.snippet.file, pane.w - 5, LINE_H / 2);
    return canvas;
  }

  /**
   * A region throwing an error: red wash, red squiggles under its code, a torn line now and then, and the
   * crash message printed across the bottom of the pane.
   */
  drawError(ctx: CanvasRenderingContext2D, region: number, now: number): void {
    const pane = this.panes[region];
    if (!pane) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(pane.x, pane.y, pane.w, pane.h);
    ctx.clip();
    ctx.fillStyle = `rgba(255,40,70,${0.2 + 0.07 * Math.sin(now / 45)})`;
    ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
    // a slice of the code jumps sideways for a moment
    const tear = Math.floor(now / 90);
    if (pane.canvas && tear % 3 === 0) {
      const ty = ((tear * 37) % Math.max(1, pane.h - 12)) | 0;
      const s = this.scale;
      ctx.drawImage(pane.canvas, 0, ty * s, pane.w * s, 10 * s, pane.x + (tear % 2 ? 5 : -5), pane.y + ty, pane.w, 10);
    }
    ctx.strokeStyle = 'rgba(255,82,100,0.95)';
    ctx.lineWidth = 1.2;
    pane.widths.forEach((w, k) => {
      if (w <= 0) return;
      const y = pane.y + (k + 0.5) * LINE_H + 6;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) ctx.lineTo(pane.x + GUTTER + x, y + ((x / 3) % 2 ? -1.5 : 1));
      ctx.stroke();
    });
    // the crash message runs along the last line, scrolling when it is wider than the pane
    const y = pane.y + pane.h - LINE_H;
    ctx.fillStyle = 'rgba(90,0,20,0.85)';
    ctx.fillRect(pane.x, y, pane.w, LINE_H);
    ctx.font = `bold ${FONT_PX}px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const text = `✖ ${pane.crash}`;
    const tw = ctx.measureText(text).width;
    const room = pane.w - 8;
    const shift = tw > room ? ((now / 25) % (tw + 40)) : 0;
    ctx.fillStyle = '#ffd6dd';
    ctx.fillText(text, pane.x + 4 - shift, y + LINE_H / 2);
    if (shift) ctx.fillText(text, pane.x + 4 - shift + tw + 40, y + LINE_H / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}

// ---------------------------------------------------------------- crashed screen

const NOISE = ['#07090f', '#0d1019', '#161b2a', '#222a40', '#323b58', '#4a5577'];
const noiseCache: HTMLCanvasElement[] = [];

/** A few tiles of pixel static, made once. */
function noiseTile(k: number): HTMLCanvasElement {
  if (!noiseCache.length) {
    for (let n = 0; n < 4; n++) {
      const c = document.createElement('canvas');
      c.width = 20;
      c.height = 20;
      const x = c.getContext('2d')!;
      for (let i = 0; i < 400; i++) {
        const r = Math.random();
        x.fillStyle = r > 0.985 ? '#ff3b5c' : r > 0.97 ? '#3cf2ff' : NOISE[Math.floor(Math.random() * NOISE.length)]!;
        x.fillRect(i % 20, Math.floor(i / 20), 1, 1);
      }
      noiseCache.push(c);
    }
  }
  return noiseCache[k % noiseCache.length]!;
}

const GLYPHS = ['0xDEAD', 'NaN', 'null', 'ERR', '}{', '0x00', '???', '//', 'EOF', '!!'];

/**
 * The screen of a player an error just caught: the field is covered by glitching tiles that clear one by
 * one, with a crash dialog over the middle. `k` runs from 0 (just crashed) to 1 (screen back).
 */
export function drawCrash(
  ctx: CanvasRenderingContext2D,
  k: number,
  release: Float32Array,
  message: string,
  now: number,
  width: number,
  height: number,
  font: string,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const flick = Math.floor(now / 50);
  ctx.font = `bold 9px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < release.length; i++) {
    if (k >= release[i]!) continue;
    const x = (i % COLS) * TILE;
    const y = Math.floor(i / COLS) * TILE;
    ctx.drawImage(noiseTile(i + flick), x, y, TILE, TILE);
    if ((i * 7 + flick) % 11 === 0) {
      ctx.fillStyle = (i + flick) % 3 ? '#ff5c7a' : '#3cf2ff';
      ctx.fillText(GLYPHS[(i + flick) % GLYPHS.length]!, x + TILE / 2, y + TILE / 2);
    }
  }
  // tearing bands across the whole field while it is at its worst
  if (k < 0.6) {
    for (let b = 0; b < 3; b++) {
      const y = ((flick * 53 + b * 197) % height) | 0;
      ctx.fillStyle = b % 2 ? 'rgba(60,242,255,0.22)' : 'rgba(255,59,92,0.25)';
      ctx.fillRect(0, y, width, 4 + ((flick + b) % 3) * 4);
    }
  }
  if (k < 0.75) {
    const w = 330;
    const h = 92;
    const x = (width - w) / 2 + (flick % 4 === 0 ? 3 : 0);
    const y = (height - h) / 2;
    ctx.fillStyle = '#141826';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ff5c7a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#ff3b5c';
    ctx.fillRect(x, y, w, 20);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = `bold 12px ${font}`;
    ctx.fillText('✖ 程式當機了', x + 8, y + 10.5);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 8, y + 24, w - 16, h - 28);
    ctx.clip();
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = '#ffd6dd';
    ctx.fillText(message, x + 10, y + 38);
    ctx.restore();
    ctx.font = `bold 11px ${font}`;
    ctx.fillStyle = '#8a93b1';
    ctx.fillText('畫面重新載入中…', x + 10, y + 60);
    ctx.fillStyle = '#2b3248';
    ctx.fillRect(x + 10, y + 72, w - 20, 8);
    ctx.fillStyle = '#3cf2ff';
    ctx.fillRect(x + 10, y + 72, (w - 20) * Math.min(1, k / 0.75), 8);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

/** When each tile of a crashed screen clears: everything stays covered for a while, then it goes tile by tile. */
export function crashRelease(count: number): Float32Array {
  const r = new Float32Array(count);
  for (let i = 0; i < count; i++) r[i] = 0.35 + Math.random() * 0.65;
  return r;
}
