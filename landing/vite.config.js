import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// The marketing site for 500 Hours. Builds to landing/dist: plain static files
// you can upload as-is (e.g. to Hostinger's public_html).
//   npm run dev:landing     preview while editing
//   npm run build:landing   build for upload
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './', // relative asset paths, so the folder works at any URL
  plugins: [tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5180 },
})
