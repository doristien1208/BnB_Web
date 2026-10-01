@echo off
setlocal EnableExtensions
rem ==========================================================================
rem  Water Balloon Brawl - game server launcher for Windows
rem
rem  Double-click to start.  Another port:  start-server.bat 8080
rem  Keep this file next to the "dist" folder.  Needs Node.js 22.18.0.
rem  Colleagues open  http://<this PC's IP>:<PORT>  in Chrome or Edge.
rem  First time only: right-click open-firewall.bat, "Run as administrator".
rem
rem  Plain ASCII on purpose: it runs the same whatever encoding an editor
rem  saves it in. Every step is written to logs\launcher.log.
rem ==========================================================================

rem ---- settings ------------------------------------------------------------
set "PORT=3000"
rem 1 = restart automatically if the server stops, 0 = do not
set "AUTO_RESTART=1"
rem --------------------------------------------------------------------------

rem Re-run inside "cmd /k" so this window stays open even after an error.
if "%BNB_INNER%"=="1" goto main
set "BNB_INNER=1"
cmd /k ""%~f0" %*"
exit /b

:main
rem pushd also works when the folder is opened as \\server\share\...
pushd "%~dp0" || goto no_folder
if not exist "logs" mkdir "logs"
set "LOG=%CD%\logs\launcher.log"
call :log "=== launcher started in %CD%"
ver >>"%LOG%" 2>&1
chcp >>"%LOG%" 2>&1

if not "%~1"=="" set "PORT=%~1"
set "PORTNUM="
set /a "PORTNUM=%PORT%" >nul 2>&1
if not "%PORTNUM%"=="%PORT%" goto bad_port
if %PORTNUM% LSS 1 goto bad_port
if %PORTNUM% GTR 65535 goto bad_port
title Water Balloon Brawl server - port %PORT%

where node >>"%LOG%" 2>&1 || goto no_node
set "NODE_VERSION="
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VERSION=%%v"
call :log "node version %NODE_VERSION%"
echo Node.js %NODE_VERSION%
if not "%NODE_VERSION%"=="v22.18.0" echo [WARN] This build is tested on Node.js v22.18.0. This PC has %NODE_VERSION%.

if not exist "dist\server\index.js" goto no_dist

netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul && goto port_busy

:run
echo.
echo Starting the game server on port %PORT% ...
echo Close this window or press Ctrl+C to stop. Output is also saved in logs\server.log
call :log "starting server on port %PORT%"
call node dist\server\index.js
call :log "server exited with code %ERRORLEVEL%"
if not "%AUTO_RESTART%"=="1" goto stopped
echo.
echo [WARN] The server stopped. Restarting in 5 seconds ...
ping -n 6 127.0.0.1 >nul
goto run

:log
>>"%LOG%" echo [%date% %time%] %~1
exit /b 0

:stopped
echo The server stopped.
goto done

:no_folder
echo [ERROR] Cannot open the folder of this file: "%~dp0"
goto done

:bad_port
call :log "error: bad port %PORT%"
echo [ERROR] Port must be a number from 1 to 65535. Got: %PORT%
goto done

:no_node
call :log "error: node not found"
echo [ERROR] Node.js was not found. Install Node.js 22.18.0 from https://nodejs.org/
echo         then close this window and run this file again.
goto done

:no_dist
call :log "error: dist\server\index.js missing"
echo [ERROR] dist\server\index.js was not found. Keep this file next to the "dist" folder.
goto done

:port_busy
call :log "error: port %PORT% already in use"
echo [ERROR] Port %PORT% is already in use. Stop the program using it, or run: start-server.bat 8080
goto done

:done
popd
endlocal
exit /b 1
