// ---------------------------------------------------------------------------
// Edit these before uploading.
// ---------------------------------------------------------------------------
const CONFIG = {
  // Where the Android APK is hosted. A relative path works if you upload the
  // APK next to this page, e.g. public_html/downloads/500-hours.apk
  apkUrl: './downloads/500-hours.apk',
  apkVersion: '1.0.0',
  apkSize: '', // e.g. '8 MB'; leave empty to hide

  // Where the web app (PWA) is hosted.
  appUrl: 'https://app.yourdomain.com/',
}

// ---------------------------------------------------------------------------

document.querySelectorAll('[data-apk-link]').forEach((a) => {
  a.href = CONFIG.apkUrl
  a.setAttribute('download', '500-hours.apk')
})
document.querySelectorAll('[data-app-link]').forEach((a) => (a.href = CONFIG.appUrl))
document.querySelectorAll('[data-apk-meta]').forEach((el) => {
  el.textContent = ['Version ' + CONFIG.apkVersion, CONFIG.apkSize, 'Android 8.0 or newer'].filter(Boolean).join(' · ')
})
document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()))

// --- Platform detection: open the right install tab ---------------------------
const ua = navigator.userAgent
// iPadOS reports itself as a Mac, so also check for a touch screen.
const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
// On iOS only Safari offers "Add to Home Screen" reliably; in-app browsers and
// other browsers identify themselves with these markers.
const isIOSNotSafari = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line\/|Messenger/.test(ua)

const tabs = [...document.querySelectorAll('[role="tab"]')]

function selectTab(name, { focus = false } = {}) {
  for (const tab of tabs) {
    const selected = tab.dataset.tab === name
    tab.setAttribute('aria-selected', String(selected))
    tab.tabIndex = selected ? 0 : -1
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected
    if (selected && focus) tab.focus()
  }
}

tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab))
  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    selectTab(next.dataset.tab, { focus: true })
  })
})

selectTab(isIOS ? 'ios' : 'android')

if (isIOSNotSafari) {
  document.querySelectorAll('[data-not-safari]').forEach((el) => el.classList.remove('hidden'))
}

// --- Copy link (for opening the page in Safari) -------------------------------
document.querySelectorAll('[data-copy-link]').forEach((button) => {
  const label = button.querySelector('[data-copy-label]')
  button.addEventListener('click', async () => {
    const url = CONFIG.appUrl
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Older in-app browsers block the clipboard API: fall back to a prompt.
      window.prompt('Copy this link, then paste it into Safari:', url)
      return
    }
    label.textContent = 'Copied! Now paste it in Safari'
    setTimeout(() => (label.textContent = 'Copy link'), 3000)
  })
})
