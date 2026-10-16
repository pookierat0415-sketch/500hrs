import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const SLATE_950 = '#020617'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version waits until the user taps "Reload" (see PwaUpdater in App.jsx),
      // so an update never reloads the page while someone is typing a log.
      registerType: 'prompt',
      injectRegister: null, // registered from React instead
      manifestFilename: 'manifest.json',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '500 Hours',
        short_name: '500 Hours',
        description: 'Track OJT hours, daily field logs, and generate your narrative report. Works offline.',
        id: './',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: SLATE_950,
        theme_color: SLATE_950,
        categories: ['education', 'productivity'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole app, including the lazily loaded Word/template exporters,
        // so every feature works on the very first offline launch.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,json}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false }, // no service worker during `npm run dev`
    }),
  ],
})
