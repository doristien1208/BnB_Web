import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Package root: the bundle runs from dist/server/, the dev server from server/.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.basename(path.dirname(here)) === 'dist' ? path.resolve(here, '../..') : path.resolve(here, '..');
export const LOG_FILE = path.join(root, 'logs', 'server.log');
const MAX_BYTES = 5 * 1024 * 1024;
const quiet = !!process.env.VITEST;

/** Prints to the console and appends to logs/server.log, which stays on the test machine for troubleshooting. */
export function log(message: string): void {
  if (quiet) return;
  console.log(message);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_BYTES) fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // logging must never take the server down
  }
}
