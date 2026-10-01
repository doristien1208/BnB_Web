import type { C2S, S2C } from '../shared/protocol';

export type NetStatus = 'connecting' | 'online' | 'offline';

const TOKEN_KEY = 'bnb.token';

function readToken(): string | undefined {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** WebSocket client: same-origin URL, automatic reconnect that resumes the session. */
export class Net {
  rtt = 0;
  onMessage: (m: S2C) => void = () => {};
  onStatus: (s: NetStatus) => void = () => {};
  private ws: WebSocket | null = null;
  private token = readToken();
  private name = '';
  private retry = 0;
  private pingTimer = 0;

  connect(name: string): void {
    this.name = name;
    this.open();
    if (!this.pingTimer) {
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', c: performance.now(), r: this.rtt }), 2000);
    }
  }

  send(m: C2S): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private open(): void {
    // Derived from the page URL, so the game works on any host, port or sub-path.
    const base = new URL('.', location.href);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(new URL('ws', base));
    this.ws = ws;
    this.onStatus('connecting');
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify({ t: 'hello', name: this.name, token: this.token } satisfies C2S));
      this.onStatus('online');
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as S2C;
      if (m.t === 'pong') {
        this.rtt = Math.round(performance.now() - m.c);
        return;
      }
      if (m.t === 'welcome') {
        this.token = m.token;
        try {
          sessionStorage.setItem(TOKEN_KEY, m.token);
        } catch {
          /* ignore */
        }
      }
      this.onMessage(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onStatus('offline');
      const delay = Math.min(5000, 500 * 2 ** this.retry++);
      window.setTimeout(() => this.open(), delay);
    };
  }
}
