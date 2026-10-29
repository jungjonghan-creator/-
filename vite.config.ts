import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: { name: 'POKER ARENA 5.0', short_name: 'PokerArena', theme_color: '#0a1428', background_color: '#05090f', display: 'standalone', icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }] },
    workbox: { globPatterns: ['**/*.{js,css,html,svg}'], maximumFileSizeToCacheInBytes: 4_000_000, navigateFallbackDenylist: [/^\/api\//] },
  })],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  preview: { proxy: { '/api': 'http://localhost:8787' } },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60000 },
});
