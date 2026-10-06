# 水球大亂鬥

照爆爆王（Crazy Arcade BnB）規則重製的網頁版 2–4 人連線對戰：大廳、候機室、13 張地圖加隨機、6 名角色可換色，玩家只要輸入暱稱。房主可以選生存或死鬥規則，並加入電腦玩家（簡單／普通／困難）補滿座位。

每局的共通規則：剩 55 秒起每 10 秒縮一圈（最多 4 圈，前 3 秒閃紅示警，還站在圈上就被壓扁）；每 30 秒空投 2 個補給（水球、藥水或溜冰鞋）；坐騎被打掉後無敵 1 秒。

死鬥：時間內擊殺數最多的一方獲勝（同分時死亡數少的勝，再同分就平手）；被淘汰 3 秒後在原地復活，復活後無敵 1.5 秒。

按鍵：移動固定用方向鍵或 W A S D；放水球、使用道具、聊天、靜音可以在「設定」裡改（只能單鍵，不能組合鍵或滑鼠），存在這個瀏覽器。

企劃書：<https://claude.ai/code/artifact/9270377b-274a-4b60-b7df-350ee3facc7d>

## 環境

Node.js 22.18.0（與測試機相同）。用 nvm 的話，在專案資料夾執行 `nvm use` 會讀 `.nvmrc`。

```bash
npm install
```

## 本機試玩

```bash
npm run build
```

```bash
npm start
```

開 <http://localhost:3000>。同一台電腦開兩個分頁，就能當兩位玩家（每個分頁各自是一位玩家）。

離線練習（不用開房）：<http://localhost:3000/?sandbox&map=0>

- `map=0`–`12`：地圖編號（0 陽光村莊 … 10 水球工廠、11 野戰前線、12 程式碼空間）
- `n=1`–`4`：人數
- `mode=team`：團隊戰
- `dm`：死鬥規則
- `ai=0`–`2`：其他角色改由電腦操作（0 簡單、1 普通、2 困難）；不加的話其他角色站著不動
- `watch`：全部由電腦操作，你在旁邊看
- `time=30`–`300`：每局秒數（預設 300）

## 開發

```bash
npm run dev
```

伺服器跑在 3000，畫面開 <http://localhost:5173>（Vite，改程式自動重新整理）。

```bash
npm test
```

```bash
npm run typecheck
```

## 部署到測試機

測試機是 Windows，遊戲放在它共享資料夾裡的 `BnB/`，用獨立的埠（預設 3000）。測試機 IP 與共享資料夾路徑記在本機的 `CLAUDE.local.md`（不進 git）。

1. 打包：產出 `release/bnb-server/`（`dist/`、`start-server.bat`、`open-firewall.bat`、`README-DEPLOY.txt`）與同名 zip

   ```bash
   npm run package
   ```

2. 測試機上的遊戲由 Game Hub（另一個專案）啟動與看管，所以先請它停下這個遊戲：在共享資料夾的 `BnB/` 放一個 `maintenance.txt`，等 hub 的 `/api/status` 顯示 `bnb` 為 `maintenance`（它會等進行中的對局打完，最多 15 分鐘）
3. 複製到測試機（`ditto` 不會帶上 Mac 的 `._` 隱藏檔），再刪掉 `maintenance.txt`，hub 就會啟動新版

   ```bash
   ditto --norsrc --noextattr --noacl release/bnb-server /Volumes/<共享資料夾>/BnB
   ```

4. 同事開 `http://<測試機 IP>:3000`；`/healthz` 可看版本、房間數與線上人數
5. 出問題時看 `BnB\logs\server.log`（伺服器輸出）與 hub 自己的 logs；Mac 上可直接讀共享資料夾

不用 hub 時（例如另一台電腦）：第一次先用「以系統管理員身分執行」`BnB\open-firewall.bat`（開放 TCP 3000），再雙擊 `BnB\start-server.bat`；啟動器每一步記在 `BnB\logs\launcher.log`。兩個 bat 刻意只用英文字元：先前的 UTF-8 中文版在測試機上會閃退。

測試機只需要 Node.js 22.18.0，不必 `npm install`。詳細操作、換埠、開機自動啟動與問題排除見 `deploy/README-DEPLOY.txt`（會一起放進套件）。

## 調整數值

| 想改的東西 | 檔案 |
| --- | --- |
| 引爆秒數、被困秒數、各種速度、縮圈／補給／水球機／error 區塊時程、死鬥復活等規則數值 | `shared/constants.ts` 的 `RULES` |
| 預設按鍵、不能設定的鍵 | `client/keys.ts` |
| 電腦玩家各難度的反應、攻擊性 | `shared/sim/bot.ts` 的 `PROFILES` |
| 道具效果說明、掉落權重 | `shared/items.ts` |
| 角色能力值 | `shared/characters.ts` |
| 地圖配置、地圖專屬掉落率 | `shared/maps.ts`（改完跑 `npm test` 會檢查對稱、出生點安全與連通） |
| 美術配色 | `client/game/themes.ts`、`client/game/art.ts` |

## 專案結構

```text
shared/   規則常數、角色、道具、地圖、通訊協定、遊戲模擬（前後端共用）
server/   HTTP + WebSocket、大廳、候機室與遊戲迴圈
client/   介面、Canvas 繪圖、程式繪製的像素美術、音效
tests/    規則、地圖、伺服器整合測試（Vitest）
```
