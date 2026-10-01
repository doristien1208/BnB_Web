水球大亂鬥 伺服器部署說明
==========================

這個資料夾就是完整的伺服器，不需要 npm install，也不需要 nginx。

  dist\               遊戲本體（網頁與伺服器）
  start-server.bat    啟動伺服器
  open-firewall.bat   開放防火牆（第一次用，需要系統管理員）
  README-DEPLOY.txt   本說明
  logs\               執行後自動產生：launcher.log（啟動器每一步）、server.log（伺服器輸出）


一、需求
--------
- Windows，已安裝 Node.js 22.18.0
  （命令提示字元輸入 node -v，應顯示 v22.18.0）


二、第一次啟動
--------------
1. 在 open-firewall.bat 上按右鍵，選「以系統管理員身分執行」，看到 Done 就完成。
   這一步是讓其他電腦連得進來（開放 TCP 3000），只要做一次。
2. 雙擊 start-server.bat。
3. 視窗出現下列文字就代表啟動成功：
     水球大亂鬥伺服器已啟動（Node v22.18.0）
       同事：http://<這台電腦的 IP>:3000
4. 把「同事：」那一行的網址給大家，用 Chrome 或 Edge 開啟即可遊玩。
5. 檢查服務：瀏覽器開 http://<IP>:3000/healthz ，看到 {"ok":true,"version":"0.2.0",...} 就是正常；
   version 是目前跑的版本（暱稱畫面下方也會顯示）。

啟動器發生任何錯誤時，視窗會停在錯誤訊息，不會自己關掉。
請不要修改兩個 bat 檔的編碼；它們刻意只用英文字元，任何編碼存檔都一樣。


三、日常操作
------------
- 停止：關閉伺服器視窗，或在視窗按 Ctrl+C。
- 當掉時會在 5 秒後自動重新啟動。
- 不要在黑色視窗裡點選文字：Windows 的「快速編輯」會讓輸出暫停；若不小心點到，按 Esc 即可恢復。
- 換埠：執行 start-server.bat 8080，或用記事本修改 start-server.bat 裡的 set "PORT=3000"。
  換埠後也要用系統管理員身分執行一次 open-firewall.bat 8080。


四、開機自動啟動（選用）
------------------------
1. 以系統管理員身分開啟命令提示字元，執行（路徑換成實際位置）：
     schtasks /create /tn "Water Balloon Brawl" /tr "D:\games\BnB\start-server.bat" /sc onstart /ru SYSTEM
2. 取消自動啟動：
     schtasks /delete /tn "Water Balloon Brawl" /f
背景執行時看不到視窗，伺服器輸出一樣會寫在 logs\server.log。


五、更新版本
------------
1. 停止伺服器（關閉伺服器視窗）。
2. 用新版的 dist 資料夾整個覆蓋舊的。
3. 重新執行 start-server.bat。
覆蓋後一定要重新啟動：舊的伺服器還在跑時，新開的網頁會載入失敗。


六、問題排除
------------
- 先看 logs\launcher.log 與 logs\server.log，裡面會記錄卡在哪一步。
- 「Node.js was not found」：安裝 Node.js 22.18.0 後，關掉視窗重新執行。
- 「Port 3000 is already in use」：有其他程式占用 3000，改用 start-server.bat 8080。
- 同事連不上：
  1. 先在伺服器本機開 http://localhost:3000/healthz 確認服務有在跑。
  2. 再從同事電腦開 http://<IP>:3000/healthz；本機可以、同事不行，通常是防火牆沒開，
     請用系統管理員身分執行 open-firewall.bat，或請 IT 開放該 TCP 埠。
- 遊戲畫面一直顯示「連線中」：確認網址的 IP 與埠正確，且中間沒有會擋 WebSocket 的代理伺服器。
