import { version as APP_VERSION } from '../package.json'

// Offline-first problem reports.
//
// Reports (and their screenshot) are written to IndexedDB first, so submitting
// works with no connection. A background loop uploads whatever is pending when
// the app opens, when the device comes back online, and on a timer, then
// deletes each report locally once the server has it.
//
// Uploads go to Supabase (see supabase/setup.sql). Set VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY in .env.local; without them reports simply stay queued.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '')
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const TABLE = 'problem_reports'
const BUCKET = 'report-screenshots'

const DB_NAME = '500-hours-reports'
const STORE = 'pending'
const SYNC_INTERVAL_MS = 2 * 60_000
const MAX_ATTEMPTS = 8 // reports the server keeps rejecting are dropped after this
const MAX_SCREENSHOT_EDGE = 1600

export const isReportSyncConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

let dbPromise
function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function tx(mode, run) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = run(t.objectStore(STORE))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

const getAll = () => tx('readonly', (s) => s.getAll())
const put = (record) => tx('readwrite', (s) => s.put(record))
const remove = (id) => tx('readwrite', (s) => s.delete(id))
export const countPendingReports = () => tx('readonly', (s) => s.count())
export const isReportPending = async (id) =>
  (await tx('readonly', (s) => s.getKey(id))) !== undefined

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Works on plain-http LAN addresses too, where crypto.randomUUID is unavailable.
function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// Downscales to a JPEG so queued reports stay small on the device and cheap to upload.
async function compressImage(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SCREENSHOT_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
    return blob ?? file
  } catch {
    return file
  }
}

// ---------------------------------------------------------------------------
// Change notifications
// ---------------------------------------------------------------------------

const listeners = new Set()
async function notify() {
  if (!listeners.size) return
  const count = await countPendingReports().catch(() => 0)
  listeners.forEach((fn) => fn(count))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Saves a report locally. Returns its id. Never needs a connection. */
export async function queueReport({ category, message, screenshot }) {
  const record = {
    id: uuid(),
    category,
    message,
    screenshot: screenshot ? await compressImage(screenshot) : null,
    createdAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    userAgent: navigator.userAgent,
    screen: `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}`,
    attempts: 0,
  }
  await put(record)
  notify()
  return record.id
}

class RetryLater extends Error {}

async function supabaseFetch(path, init) {
  let res
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      ...init,
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, ...init.headers },
    })
  } catch {
    throw new RetryLater('network')
  }
  if (res.ok) return res
  const body = await res.text().catch(() => '')
  // Storage reports an existing object as 409 (sometimes wrapped in a 400).
  // That means an earlier attempt already uploaded it, which is fine.
  if (res.status === 409 || body.includes('"409"') || body.includes('Duplicate')) return res
  if (res.status >= 500 || res.status === 429 || res.status === 408) throw new RetryLater(body)
  throw new Error(`${res.status} ${body}`)
}

async function upload(record) {
  let screenshotPath = null
  if (record.screenshot) {
    screenshotPath = `${record.id}.jpg`
    await supabaseFetch(`/storage/v1/object/${BUCKET}/${screenshotPath}`, {
      method: 'POST',
      headers: { 'Content-Type': record.screenshot.type || 'image/jpeg' },
      body: record.screenshot,
    })
  }
  // The client-generated id makes retries safe: a duplicate insert is ignored.
  await supabaseFetch(`/rest/v1/${TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=ignore-duplicates',
    },
    body: JSON.stringify({
      id: record.id,
      category: record.category,
      message: record.message,
      screenshot_path: screenshotPath,
      app_version: record.appVersion,
      user_agent: record.userAgent,
      screen: record.screen,
      created_at: record.createdAt,
    }),
  })
}

let flushing = null

/** Uploads every pending report. Safe to call often; concurrent calls share one run. */
export function flushReports() {
  flushing ??= (async () => {
    try {
      if (!isReportSyncConfigured || !navigator.onLine) return
      const pending = (await getAll()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      for (const record of pending) {
        try {
          await upload(record)
          await remove(record.id)
        } catch (err) {
          if (err instanceof RetryLater) break // offline or server trouble: try again later
          const attempts = record.attempts + 1
          if (attempts >= MAX_ATTEMPTS) {
            console.warn('[reports] dropping report the server keeps rejecting', record.id, err)
            await remove(record.id)
          } else {
            await put({ ...record, attempts })
          }
        }
      }
    } catch (err) {
      console.warn('[reports] sync failed', err)
    } finally {
      flushing = null
      notify()
    }
  })()
  return flushing
}

/**
 * Starts background syncing and reports the pending count through onCountChange.
 * Returns a cleanup function.
 */
export function startReportSync(onCountChange) {
  if (!('indexedDB' in window)) return () => {}
  if (!isReportSyncConfigured && import.meta.env.DEV) {
    console.info('[reports] Supabase is not configured; problem reports will stay queued.')
  }

  listeners.add(onCountChange)
  const onVisible = () => document.visibilityState === 'visible' && flushReports()

  window.addEventListener('online', flushReports)
  document.addEventListener('visibilitychange', onVisible)
  const timer = setInterval(flushReports, SYNC_INTERVAL_MS)
  flushReports()

  return () => {
    listeners.delete(onCountChange)
    window.removeEventListener('online', flushReports)
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(timer)
  }
}
