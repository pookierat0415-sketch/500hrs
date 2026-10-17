import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const SLATE_950 = '#020617'

// Ships the server scripts with the site at /api/. Secrets stay in
// ohjeyti-config.php, which lives above public_html and is never built.
const SERVER_SCRIPTS = ['_lib.php', 'account.php', 'admin.php', 'ai-polish.php']
const serverScripts = {
  name: 'ohjeyti-server-scripts',
  apply: 'build',
  generateBundle() {
    for (const file of SERVER_SCRIPTS) {
      this.emitFile({ type: 'asset', fileName: `api/${file}`, source: readFileSync(`server/${file}`) })
    }
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    serverScripts,
    VitePWA({
      // A new version waits until the user taps "Reload" (see PwaUpdater in App.jsx),
      // so an update never reloads the page while someone is typing a log.
      registerType: 'prompt',
      injectRegister: null, // registered from React instead
      manifestFilename: 'manifest.json',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ohjeyti',
        short_name: 'ohjeyti',
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
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false }, // no service worker during `npm run dev`
    }),
  ],
})
