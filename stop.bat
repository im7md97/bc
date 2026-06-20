@echo off
REM ─── إيقاف بوابة الجودة والأداء ─────────────────────────────────────────────
REM   اضغط دبل-كليك على هذا الملف لإيقاف القاعدة والموقع.

echo Stopping Quality Portal...

REM Kill the windows we started by their title. /T also kills child processes (tsx, node, postgres).
taskkill /FI "WINDOWTITLE eq qc-portal-db*" /T /F 2>nul
taskkill /FI "WINDOWTITLE eq qc-portal-app*" /T /F 2>nul

REM Catch-all: anything still listening on our two ports.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":5000 "') do taskkill /PID %%p /F 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":5433 "') do taskkill /PID %%p /F 2>nul

echo Done.
timeout /t 2 /nobreak >nul
