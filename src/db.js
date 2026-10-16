// On-device storage for the app's data (IndexedDB), so everything survives
// closing the app and works with no connection.
//
//   entries  - daily log entries, including photos stored as Blobs
//   shifts   - completed shifts and manually entered hours
//   meta     - single values: activeShift, profile, customCategories, seeded

const DB_NAME = '500-hours'
const DB_VERSION = 1
const STORES = ['entries', 'shifts', 'meta']

let dbPromise
function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('shifts')) db.createObjectStore('shifts', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

// Runs fn against the named stores in one transaction and resolves when it commits.
async function transact(storeNames, mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode)
    const stores = Object.fromEntries(storeNames.map((n) => [n, tx.objectStore(n)]))
    const result = fn(stores)
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

// Photos live in memory as { id, name, blob, url }; the object URL is only valid
// for this session, so it is dropped on save and recreated on load.
const toStoredEntry = (entry) => ({
  ...entry,
  photos: entry.photos.map(({ url: _url, ...photo }) => photo),
})
const fromStoredEntry = (entry) => ({
  ...entry,
  photos: (entry.photos ?? []).map((p) => ({ ...p, url: URL.createObjectURL(p.blob) })),
})

export async function loadAll() {
  const db = await openDb()
  const tx = db.transaction(STORES, 'readonly')
  const metaStore = tx.objectStore('meta')
  const [entries, shifts, metaKeys, metaValues] = await Promise.all([
    request(tx.objectStore('entries').getAll()),
    request(tx.objectStore('shifts').getAll()),
    request(metaStore.getAllKeys()),
    request(metaStore.getAll()),
  ])
  return {
    entries: entries.map(fromStoredEntry),
    shifts,
    meta: Object.fromEntries(metaKeys.map((k, i) => [k, metaValues[i]])),
  }
}

export const saveEntry = (entry) =>
  transact(['entries'], 'readwrite', ({ entries }) => entries.put(toStoredEntry(entry)))

export const deleteEntry = (id) =>
  transact(['entries', 'shifts'], 'readwrite', ({ entries, shifts }) => {
    entries.delete(id)
    // Remove hours that were typed into this entry.
    shifts.openCursor().onsuccess = (e) => {
      const cursor = e.target.result
      if (!cursor) return
      if (cursor.value.entryId === id) cursor.delete()
      cursor.continue()
    }
  })

export const saveShift = (shift) =>
  transact(['shifts'], 'readwrite', ({ shifts }) => shifts.put(shift))

export const deleteShift = (id) =>
  transact(['shifts'], 'readwrite', ({ shifts }) => shifts.delete(id))

export const setMeta = (key, value) =>
  transact(['meta'], 'readwrite', ({ meta }) => meta.put(value, key))

/** Writes a whole data set at once (used for the first-run sample data). */
export const saveAll = ({ entries = [], shifts = [], meta = {} }) =>
  transact(STORES, 'readwrite', (stores) => {
    entries.forEach((e) => stores.entries.put(toStoredEntry(e)))
    shifts.forEach((s) => stores.shifts.put(s))
    Object.entries(meta).forEach(([k, v]) => stores.meta.put(v, k))
  })

/** Replaces everything on this device with a restored backup. */
export const replaceAll = ({ entries = [], shifts = [], meta = {} }) =>
  transact(STORES, 'readwrite', (stores) => {
    STORES.forEach((name) => stores[name].clear())
    entries.forEach((e) => stores.entries.put(toStoredEntry({ ...e, photos: e.photos ?? [] })))
    shifts.forEach((s) => stores.shifts.put(s))
    Object.entries(meta).forEach(([k, v]) => stores.meta.put(v, k))
  })
