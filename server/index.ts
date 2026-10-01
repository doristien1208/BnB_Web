import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { LOG_FILE, log } from './log';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

process.on('uncaughtException', (err) => {
  log(`[錯誤] 伺服器發生未預期的錯誤：${err.stack ?? String(err)}`);
  process.exit(1);
});
process.on('unhandledRejection', (err) => log(`[錯誤] 未處理的 Promise 錯誤：${String(err)}`));

// After `npm run build` this file lives in dist/server/ and the client in dist/public/.
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const { server } = createApp(publicDir);

server.on('error', (err: NodeJS.ErrnoException) => {
  log(
    err.code === 'EADDRINUSE'
      ? `[錯誤] 埠 ${PORT} 已經有程式在用，請關掉那個程式，或用 PORT 換一個埠`
      : `[錯誤] 伺服器無法啟動：${err.message}`,
  );
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => `http://${a!.address}:${PORT}`);
  log(`水球大亂鬥伺服器已啟動（Node ${process.version}）`);
  log(`  本機：http://localhost:${PORT}`);
  for (const url of lan) log(`  同事：${url}`);
  log(`  紀錄檔：${LOG_FILE}`);
});
