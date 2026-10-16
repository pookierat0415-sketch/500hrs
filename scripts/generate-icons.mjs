// Generates every app icon from the sun logo.
//   node scripts/generate-icons.mjs
//
// Web (public/): PWA icons, a maskable icon for Android home screens, and the
// iOS apple-touch-icon. Android (android/, once `npx cap add android` has run):
// launcher icons for every density and the splash screens.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const SLATE_950 = '#020617'

// The sun from the in-app header, drawn in a 24-unit box.
const SUN = `
  <circle cx="12" cy="12" r="4" />
  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />`

const GRADIENT = `
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fcd34d" /><stop offset="1" stop-color="#d98e04" />
  </linearGradient>`

/**
 * @param {object} o
 * @param {number} o.size        output size in px
 * @param {number} o.sun         sun width as a fraction of the canvas
 * @param {number} [o.radius]    corner radius as a fraction (0 = full bleed square)
 * @param {boolean} [o.background] draw the yellow tile (false = transparent, for adaptive foregrounds)
 */
function iconSvg({ size, sun, radius = 0, background = true }) {
  const s = 100
  const sunSize = s * sun
  const offset = (s - sunSize) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${s} ${s}">
    <defs>${GRADIENT}</defs>
    ${background ? `<rect width="${s}" height="${s}" rx="${s * radius}" fill="url(#g)" />` : ''}
    <g transform="translate(${offset} ${offset}) scale(${sunSize / 24})" fill="none" stroke="#0f172a"
       stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${SUN}</g>
  </svg>`
}

const png = (svg, file) => sharp(Buffer.from(svg)).png().toFile(file)

// --- Web / PWA -------------------------------------------------------------------
const pub = join(root, 'public')
await Promise.all([
  // "any" purpose: rounded tile on transparent corners.
  png(iconSvg({ size: 192, sun: 0.56, radius: 0.22 }), join(pub, 'pwa-192x192.png')),
  png(iconSvg({ size: 512, sun: 0.56, radius: 0.22 }), join(pub, 'pwa-512x512.png')),
  // "maskable": full bleed, sun inside the central safe zone; Android crops it to a circle/squircle.
  png(iconSvg({ size: 512, sun: 0.46 }), join(pub, 'maskable-512x512.png')),
  // iOS rounds the corners itself and turns transparency black, so this is full bleed.
  png(iconSvg({ size: 180, sun: 0.56 }), join(pub, 'apple-touch-icon.png')),
])
console.log('web icons -> public/')

// --- Android (Capacitor) ---------------------------------------------------------
const res = join(root, 'android', 'app', 'src', 'main', 'res')
if (!existsSync(res)) {
  console.log('android/ not found; run `npx cap add android`, then this script again for launcher icons')
  process.exit(0)
}

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const jobs = []
for (const [name, scale] of Object.entries(densities)) {
  const dir = join(res, `mipmap-${name}`)
  if (!existsSync(dir)) continue
  const legacy = Math.round(48 * scale)
  // Older launchers: the full tile.
  jobs.push(png(iconSvg({ size: legacy, sun: 0.56, radius: 0.22 }), join(dir, 'ic_launcher.png')))
  jobs.push(png(iconSvg({ size: legacy, sun: 0.56, radius: 0.5 }), join(dir, 'ic_launcher_round.png')))
  // Adaptive icon foreground (108dp, only the middle ~66dp is guaranteed visible).
  jobs.push(png(iconSvg({ size: Math.round(108 * scale), sun: 0.36, background: false }), join(dir, 'ic_launcher_foreground.png')))
}

// Splash screens: keep each existing file's size, slate background, logo tile centered.
for (const dir of readdirSync(res).filter((d) => d.startsWith('drawable'))) {
  const file = join(res, dir, 'splash.png')
  if (!existsSync(file)) continue
  jobs.push(
    (async () => {
      const { width, height } = await sharp(file).metadata()
      const tile = Math.round(Math.min(width, height) * 0.22)
      const logo = await sharp(Buffer.from(iconSvg({ size: tile, sun: 0.56, radius: 0.22 }))).png().toBuffer()
      const out = await sharp({ create: { width, height, channels: 4, background: SLATE_950 } })
        .composite([{ input: logo, gravity: 'center' }])
        .png()
        .toBuffer()
      await sharp(out).toFile(file)
    })(),
  )
}
await Promise.all(jobs)
console.log(`android icons + splash screens -> android/ (${jobs.length} files)`)
