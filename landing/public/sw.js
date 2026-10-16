// Cleanup service worker for the landing page.
//
// 500hrs.siaysies.com briefly served the app, which installed an offline
// service worker at /sw.js. Browsers keep using an installed service worker
// until a new /sw.js replaces it, so visitors would keep seeing the cached app
// instead of this landing page. This file replaces it: it deletes the app's
// caches, unregisters itself, and reloads open tabs onto the real landing page.

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
      await self.registration.unregister()
      const windows = await self.clients.matchAll({ type: 'window' })
      windows.forEach((client) => client.navigate(client.url))
    })(),
  )
})
