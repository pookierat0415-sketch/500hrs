import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { isNativeApp } from './native.js'

// One site, two faces:
//   - a normal browser tab shows the landing page;
//   - the installed app (home screen icon, desktop install, or the Android APK)
//     opens the tracker.
// Adding ?app to the URL opens the tracker in a browser tab too (for laptops).

const isInstalled =
  ['standalone', 'fullscreen', 'minimal-ui'].some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches) ||
  window.navigator.standalone === true // iOS home screen apps

const showApp = isNativeApp || isInstalled || new URLSearchParams(window.location.search).has('app')

// Chrome fires its install prompt early, possibly before the landing page has
// loaded; keep it so the "Install 500 Hours" button can use it.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__installPrompt = e
})

const root = createRoot(document.getElementById('root'))

if (showApp) {
  const { default: App } = await import('./App.jsx')
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} else {
  // The landing page is designed dark-only, whatever theme the app uses.
  document.documentElement.dataset.theme = 'dark'
  document.documentElement.classList.add('landing')
  const [{ default: Landing }, { registerSW }] = await Promise.all([
    import('./Landing.jsx'),
    import('virtual:pwa-register'),
  ])
  root.render(
    <StrictMode>
      <Landing />
    </StrictMode>,
  )
  // Start caching the app now, so it works offline the first time it's
  // opened from the home screen. Updates apply on the next visit.
  if (!isNativeApp) registerSW({ immediate: true })
}
