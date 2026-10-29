import { defineConfig, devices } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';

// 사전 설치된 크로미움이 있으면 사용 (playwright install 불필요 환경)
function findChromium(): string | undefined {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (existsSync(base + '/chromium')) return base + '/chromium';
  if (existsSync(base)) {
    for (const d of readdirSync(base)) {
      for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) { const p = `${base}/${d}/${sub}`; if (d.startsWith('chromium') && existsSync(p)) return p; }
    }
  }
  return undefined;
}
const executablePath = findChromium();
const launchOptions = { executablePath, args: ['--no-sandbox'] };

export default defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'off', launchOptions },
  webServer: [
    { command: 'npm run build && npx vite preview --port 4173', port: 4173, reuseExistingServer: true, timeout: 120000 },
    // 온라인 E2E 용 실제 서버(API + 정적 파일). 매 실행마다 새 DB.
    { command: 'rm -f data/e2e.sqlite* && DB_PATH=data/e2e.sqlite PORT=8787 npx tsx server/node.ts', port: 8787, reuseExistingServer: true, timeout: 60000 },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions } },
    { name: 'mobile', use: { ...devices['Pixel 5'], launchOptions } },
  ],
});
