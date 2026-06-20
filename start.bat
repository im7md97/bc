@echo off
REM ─── تشغيل بوابة الجودة والأداء ─────────────────────────────────────────────
REM   اضغط دبل-كليك على هذا الملف. تنتظر الشاشة لين القاعدة والموقع يكونون
REM   جاهزين فعلاً، وبعدها يفتح المتصفح. عشان توقف الموقع، شغّل stop.bat

setlocal
cd /d "%~dp0"

echo.
echo ================================================================
echo   Quality Portal launcher
echo ================================================================
echo.

REM ─── 1) Database ────────────────────────────────────────────────
echo [1/3] Starting embedded PostgreSQL...
start "qc-portal-db" /min cmd /c "npm run db:start"

REM Poll until port 5433 accepts connections (up to ~60 seconds on cold boot).
powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 60;$i++){ try{ $t=New-Object Net.Sockets.TcpClient; $t.Connect('127.0.0.1',5433); $t.Close(); $ok=$true; break }catch{ Start-Sleep -Seconds 1 } } if(-not $ok){ Write-Host '   Database did not respond within 60s'; exit 1 } else { Write-Host '   Database is ready' }"
if errorlevel 1 (
  echo.
  echo Could not start the database. Open the qc-portal-db window and check the log.
  pause
  exit /b 1
)

REM ─── 2) App ─────────────────────────────────────────────────────
echo.
echo [2/3] Starting the web server...
start "qc-portal-app" /min cmd /c "npm run dev"

REM Poll until port 5000 accepts connections (up to ~120 seconds — first run does
REM Vite cold-start + drizzle schema push + seed which is slow).
powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 120;$i++){ try{ $t=New-Object Net.Sockets.TcpClient; $t.Connect('127.0.0.1',5000); $t.Close(); $ok=$true; break }catch{ Start-Sleep -Seconds 1 } } if(-not $ok){ Write-Host '   Web server did not respond within 120s'; exit 1 } else { Write-Host '   Web server is ready' }"
if errorlevel 1 (
  echo.
  echo Could not start the web server. Open the qc-portal-app window and check the log.
  pause
  exit /b 1
)

REM ─── 3) Browser ─────────────────────────────────────────────────
echo.
echo [3/3] Opening browser...
start "" http://localhost:5000

echo.
echo ================================================================
echo   The portal is running at http://localhost:5000
echo   To stop it, run stop.bat
echo ================================================================
echo.
echo You can close this window now.
timeout /t 6 /nobreak >nul
