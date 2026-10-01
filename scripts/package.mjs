// Assembles the hand-off package for the test machine: release/bnb-server/
// (dist + Windows launcher + deployment notes), plus a zip when the `zip` tool exists.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

if (!existsSync('dist/server/index.js') || !existsSync('dist/public/index.html')) {
  console.error('dist/ is missing: run `npm run build` first');
  process.exit(1);
}

const out = 'release/bnb-server';
rmSync('release', { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('dist', `${out}/dist`, { recursive: true });

// Windows tools expect CRLF; Notepad shows Chinese text reliably with a UTF-8 BOM.
const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
for (const bat of ['start-server.bat', 'open-firewall.bat']) {
  const text = readFileSync(bat, 'utf8');
  // Non-ASCII text in .bat files breaks depending on the PC's code page and the editor's encoding.
  if (/[^\x00-\x7f]/.test(text)) throw new Error(`${bat} must stay plain ASCII`);
  writeFileSync(`${out}/${bat}`, crlf(text));
}
writeFileSync(`${out}/README-DEPLOY.txt`, '﻿' + crlf(readFileSync('deploy/README-DEPLOY.txt', 'utf8')));

try {
  execFileSync('zip', ['-qrX', 'bnb-server.zip', 'bnb-server'], { cwd: 'release' });
  console.log('Package ready: release/bnb-server/ and release/bnb-server.zip');
} catch {
  console.log('Package ready: release/bnb-server/ (no zip tool found)');
}
