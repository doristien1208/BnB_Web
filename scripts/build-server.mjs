// Bundles the server and its dependencies into one file, so the test machine
// only needs `dist/` and Node.js 22 — no `npm install` there.
import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';

await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/server/index.js',
  sourcemap: true,
  // Optional native speedups for `ws`; it falls back to pure JS when they are missing.
  external: ['bufferutil', 'utf-8-validate'],
  banner: {
    js: "import { createRequire as __bnbCreateRequire } from 'node:module'; const require = __bnbCreateRequire(import.meta.url);",
  },
  logLevel: 'info',
});

// dist/ is copied to the test machine without the project's package.json; mark the bundle as ESM explicitly.
writeFileSync('dist/server/package.json', '{ "type": "module" }\n');
