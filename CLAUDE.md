# 水球大亂鬥 (BnB web remake)

Web remake of Crazy Arcade BnB (爆爆王) rules: 2–4 player WebSocket battles, lobby + waiting room, 11 maps + random, 6 characters with colour swaps, computer players (3 levels). Every round also has the shrink (from 55 s left), supply drops (every 30 s) and 1 s of invulnerability after losing a mount. Design doc (Claude Doc): https://claude.ai/code/artifact/9270377b-274a-4b60-b7df-350ee3facc7d — keep it in sync when rules or protocol change.

## Constraints
- Node.js 22.18.0 everywhere: the test machine runs exactly this (`nvm use` reads `.nvmrc`). Don't rely on newer Node APIs.
- Test machine: Windows; the game runs on its own port (`PORT`, default 3000) and colleagues open `http://<ip>:<port>` directly; nginx exists there but is not used. Its IP, SMB share and the ports other games use there are in `CLAUDE.local.md` (gitignored: the GitHub repo is public).
- Deploy: `npm run package`, then copy `release/bnb-server` to the `BnB` folder on the test machine's SMB share with `ditto --norsrc --noextattr --noacl`; the engineer runs `start-server.bat` there (first time `open-firewall.bat` as Administrator). Never touch the other projects in that share.
- `start-server.bat` / `open-firewall.bat` stay plain ASCII with CRLF (`scripts/package.mjs` enforces both). A UTF-8 version with `chcp 65001` closed instantly on the test machine and the engineer re-saved it as Big5, so never put Chinese in them; Chinese text goes in `deploy/README-DEPLOY.txt`.
- The launcher writes `logs/launcher.log` and the server writes `logs/server.log` next to `dist/`; read them over SMB when something fails on the test machine.
- Nickname only: no accounts, leaderboard, shop or touch controls.
- Art and names are original (Q-style pixel art drawn in code); never use Nexon or Gamania assets, names or trademarks.
- Values the original never published live in `RULES` in `shared/constants.ts` (marked 暫定 in the doc).
- The four original terrain mechanics (water channel, ice, portal, night) are intentional; the user chose to keep them.

## Commands
- `npm run dev` — server on :3000 + Vite on :5173
- `npm test` — rules, maps (symmetry / spawn safety / connectivity) and a real WebSocket round
- `npm run typecheck`, `npm run build`, `npm start`

## Layout
- `shared/sim/game.ts` — authoritative simulation; the server steps it at 60 Hz and streams full snapshots
- `shared/sim/bot.ts` — computer players: read the simulation, predict streams (chains, belts, ice slides), set inputs like a keyboard; `server/room.ts` runs them before each step
- `server/hub.ts` sessions + lobby, `server/room.ts` waiting room + game loop, `server/app.ts` HTTP + `/ws` with Origin check
- `client/main.ts` screens, `client/game/view.ts` canvas renderer + interpolation, `client/game/playback.ts` jitter-adaptive playback clock (stutter fix; `tests/playback.test.ts` simulates Windows timers + Wi-Fi jitter), `client/sandbox.ts` offline practice (`?sandbox&map=0..10&n=1..4&mode=team&ai=0..2&watch&time=60`)
- `VERSION` in `shared/constants.ts` shows on the entry screen and in `/healthz`; bump it with `package.json` for each release
