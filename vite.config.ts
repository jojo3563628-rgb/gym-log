/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages 專案頁位於 /gym-log/ 子路徑
export default defineConfig({
  base: '/gym-log/',
  plugins: [
    react(),
    VitePWA({
      // 不自動重載：訓練中途不可被更新打斷（Arch 6.4）
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '重訓紀錄',
        short_name: '重訓紀錄',
        lang: 'zh-TW',
        start_url: '/gym-log/',
        scope: '/gym-log/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#111111',
        theme_color: '#111111',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/gym-log/index.html',
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
});
