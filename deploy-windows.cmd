@echo off
chcp 65001 >nul
echo ===== POKER ARENA 고정 주소 배포 (Cloudflare 무료) =====
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 가 없습니다. https://nodejs.org 에서 LTS 설치 후 다시 실행하세요. & pause & exit /b 1)
call npm install || (echo npm install 실패 & pause & exit /b 1)
call npx --yes wrangler@4 whoami | findstr /i "not authenticated" >nul && (
  echo 브라우저가 열리면 Cloudflare 로그인 후 [Allow] 를 눌러 주세요.
  call npx --yes wrangler@4 login
)
call npm run deploy:cf
echo.
echo 위에 "고정 주소: https://..." 가 보이면 그 주소를 가족에게 보내세요. 오류가 나면 이 창의 내용을 Claude 에게 보여 주세요(비밀번호/토큰 제외).
pause
