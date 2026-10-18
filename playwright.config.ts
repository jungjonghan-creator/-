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
  webServer: { command: 'npm run build && npx vite preview --port 4173', port: 4173, reuseExistingServer: true, timeout: 120000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions } },
    { name: 'mobile', use: { ...devices['Pixel 5'], launchOptions } },
  ],
});
