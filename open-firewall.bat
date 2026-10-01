@echo off
setlocal EnableExtensions
rem ==========================================================================
rem  Opens the game port in Windows Firewall so other PCs can join.
rem  Right-click this file and choose "Run as administrator" (only once).
rem  Default port 3000.  Another port:  open-firewall.bat 8080
rem ==========================================================================
set "PORT=3000"
if not "%~1"=="" set "PORT=%~1"
set "RULE=Water Balloon Brawl TCP %PORT%"

net session >nul 2>&1 && goto admin_ok
fltmc >nul 2>&1 && goto admin_ok
goto not_admin

:admin_ok
netsh advfirewall firewall show rule name="%RULE%" >nul 2>&1 && goto exists
netsh advfirewall firewall add rule name="%RULE%" dir=in action=allow protocol=TCP localport=%PORT% >nul || goto failed
echo Done. Windows Firewall now allows inbound TCP %PORT%.
goto end

:exists
echo The firewall rule "%RULE%" already exists. Nothing to do.
goto end

:not_admin
echo [ERROR] Not running as administrator.
echo         Right-click open-firewall.bat and choose "Run as administrator".
goto end

:failed
echo [ERROR] Could not add the firewall rule. Ask IT to allow inbound TCP %PORT%.

:end
echo.
pause
endlocal
