@echo off
REM ─── تشغيل بوابة الجودة والأداء ─────────────────────────────────────────────
REM   اضغط دبل-كليك على هذا الملف. يفتح نافذتين خلف الكواليس (قاعدة + موقع)
REM   وبعدها يفتح المتصفح على الموقع.
REM   عشان توقف الموقع، شغّل stop.bat

setlocal
cd /d "%~dp0"

echo Launching Quality Portal...

REM Start the embedded PostgreSQL in its own minimized window, titled so stop.bat can find it.
start "qc-portal-db" /min cmd /c "npm run db:start"

REM Wait ~8 seconds for the database to be ready before the app tries to connect.
timeout /t 8 /nobreak >nul

REM Start the Express + Vite dev server.
start "qc-portal-app" /min cmd /c "npm run dev"

REM Give the app a moment to bind to port 5000 before opening the browser.
timeout /t 10 /nobreak >nul

start "" http://localhost:5000

echo.
echo The portal is running at http://localhost:5000
echo To stop it, run stop.bat
echo You can close this window.
pause
