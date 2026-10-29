@echo off
echo ===== POKER ARENA deploy (Cloudflare free) =====
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install LTS from https://nodejs.org then close this window and run again.
  pause
  exit /b 1
)
if not exist package.json (
  echo package.json not found. Unzip the project first, then run this file inside the unzipped folder.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 (
  echo npm install failed
  pause
  exit /b 1
)
call npx --yes wrangler@4 whoami 2>&1 | findstr /i "not authenticated" >nul
if not errorlevel 1 (
  echo A browser will open. Log in to Cloudflare and click Allow.
  call npx --yes wrangler@4 login
)
call npm run deploy:cf
echo.
echo If you see a line "https://...workers.dev" above, send that address to your family.
echo If there is an error, take a screenshot of this window ^(no passwords/tokens^) and show it to Claude.
pause
