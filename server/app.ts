import fs from 'node:fs';
import http from 'node:http';
import sirv from 'sirv';
import { WebSocketServer } from 'ws';
import { Hub } from './hub';

/** Browsers send Origin; it must match the host they connected to (blocks cross-site sockets). */
function sameOrigin(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** HTTP server for the built client plus the game WebSocket at /ws, on one port. */
export function createApp(publicDir: string | null): { server: http.Server; hub: Hub } {
  // the page is always checked again (an update must not leave anyone on the old client); the scripts and
  // styles it loads have the build hash in their names, so they can be kept for good
  const serveStatic =
    publicDir && fs.existsSync(publicDir)
      ? sirv(publicDir, {
          etag: true,
          setHeaders: (res, pathname) =>
            res.setHeader(
              'cache-control',
              pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
            ),
        })
      : null;
  const hub = new Hub();

  const server = http.createServer((req, res) => {
    if ((req.url ?? '/').startsWith('/healthz')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(hub.health()));
      return;
    }
    if (!serveStatic) {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('開發模式：遊戲畫面請開 http://localhost:5173');
      return;
    }
    serveStatic(req, res, () => {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('找不到頁面');
    });
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname !== '/ws' || !sameOrigin(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => hub.connect(ws));
  });
  server.on('close', () => {
    hub.close();
    wss.close();
  });

  return { server, hub };
}
