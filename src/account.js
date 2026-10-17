import * as db from './db.js'
import { compressImage } from './image.js'

// Optional accounts and online backup (server/account.php).
//
// An account is just a username and full name. Instead of a password the
// student gets a recovery code, needed only to restore on a new phone. Day to
// day the phone uses a token, and backups upload in the background whenever
// it's online. Set VITE_ACCOUNT_API_URL to enable the feature.

const ENDPOINT = import.meta.env.VITE_ACCOUNT_API_URL
const TIMEOUT_MS = 30_000

export const isAccountConfigured = Boolean(ENDPOINT)

export const USERNAME_PATTERN = /^[a-z][a-z0-9._]{2,19}$/
/** Lowercases and drops characters usernames can't contain, as the user types. */
export const cleanUsername = (s) => s.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20)
export const usernameHint = 'Use 3 to 20 characters: lowercase letters, numbers, dots, or underscores, starting with a letter.'

/** The server can't be reached right now (offline, timeout, server busy). Try again later. */
export class AccountUnavailableError extends Error {
  constructor(reason, options) {
    super(reason === 'offline' ? 'You’re offline. Connect to the internet and try again.' : 'Couldn’t reach the server. Please try again.', options)
    this.name = 'AccountUnavailableError'
    this.reason = reason
  }
}

/** The server answered with a problem the user can act on (taken username, wrong code...). */
export class AccountError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'AccountError'
    this.status = status
  }
}

async function request(action, { method = 'GET', query = '', token, json, blob, as = 'json' } = {}) {
  if (!ENDPOINT) throw new AccountUnavailableError('not-configured')
  if (!navigator.onLine) throw new AccountUnavailableError('offline')

  const headers = {}
  if (token) headers['X-Ohjeyti-Token'] = token
  if (json) headers['Content-Type'] = 'application/json'
  if (blob) headers['Content-Type'] = blob.type || 'image/jpeg'

  let res
  try {
    res = await fetch(`${ENDPOINT}?action=${action}${query}`, {
      method,
      headers,
      body: json ? JSON.stringify(json) : blob,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw new AccountUnavailableError('network', { cause: err })
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    // Busy or broken server: try later. (429 from restore is a lockout the user must see.)
    if (res.status >= 500 || (res.status === 429 && action !== 'restore')) {
      throw new AccountUnavailableError(`server-${res.status}`)
    }
    throw new AccountError(data.error || `Request failed (${res.status}).`, res.status)
  }
  return as === 'blob' ? res.blob() : res.json()
}

const enc = encodeURIComponent

export const checkUsername = (username) => request('check', { query: `&username=${enc(username)}` })
export const register = (username, fullName) => request('register', { method: 'POST', json: { username, fullName } })
export const restore = (username, recoveryCode) => request('restore', { method: 'POST', json: { username, recoveryCode } })
export const deleteAccount = (token) => request('delete', { method: 'POST', token })
/** "I lost my recovery code": goes to the admin page (server/admin.php) for a manual check. */
export const sendRecoveryRequest = (details) => request('recovery-request', { method: 'POST', json: details })

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

/** Everything worth restoring, minus photo bytes (uploaded separately, once each). */
export function buildSnapshot({ entries, shifts, profile, customCategories, activeShift }) {
  return {
    version: 1,
    entries: entries.map(({ photos, ...entry }) => ({ ...entry, photos: photos.map(({ id, name }) => ({ id, name })) })),
    shifts,
    profile,
    customCategories: customCategories.map(({ id, label }) => ({ id, label })),
    activeShift,
  }
}

/** Small, fast fingerprint so unchanged data isn't uploaded again (FNV-1a). */
export function fingerprint(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36) + text.length.toString(36)
}

/**
 * Uploads photos the server doesn't have yet, then the snapshot.
 * Returns the ids of every photo now on the server.
 */
export async function backUp({ token, snapshot, fullName, photos, uploadedIds }) {
  const done = new Set(uploadedIds)
  for (const photo of photos) {
    if (done.has(photo.id) || !photo.blob) continue
    const small = await compressImage(photo.blob)
    await request('photo', { method: 'POST', query: `&id=${enc(photo.id)}`, token, blob: small })
    done.add(photo.id)
  }
  await request('backup', { method: 'POST', token, json: { snapshot, fullName } })
  return [...done]
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/**
 * Downloads the account's backup and replaces the data on this device with it.
 * The caller reloads the app afterwards.
 *
 * @param {object} account  { username, fullName, token, recoveryCode }
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<{ missingPhotos: number }>}
 */
export async function restoreToDevice(account, onProgress = () => {}) {
  const { snapshot } = await request('snapshot', { token: account.token })
  const photoRefs = snapshot.entries.flatMap((e) => e.photos ?? [])
  let done = 0
  let missingPhotos = 0
  const blobs = new Map()

  onProgress(0, photoRefs.length)
  for (const { id } of photoRefs) {
    try {
      blobs.set(id, await request('photo', { query: `&id=${enc(id)}`, token: account.token, as: 'blob' }))
    } catch (err) {
      if (err instanceof AccountUnavailableError) throw err // connection dropped: let the user retry
      missingPhotos++ // this one photo wasn't backed up; keep going
    }
    onProgress(++done, photoRefs.length)
  }

  const entries = snapshot.entries.map((entry) => ({
    ...entry,
    photos: (entry.photos ?? []).filter((p) => blobs.has(p.id)).map((p) => ({ ...p, blob: blobs.get(p.id) })),
  }))

  await db.replaceAll({
    entries,
    shifts: snapshot.shifts ?? [],
    meta: {
      seeded: true,
      onboarded: true,
      profile: snapshot.profile,
      customCategories: snapshot.customCategories ?? [],
      activeShift: snapshot.activeShift ?? null,
      account: {
        ...account,
        // Everything restored is already on the server.
        uploadedPhotos: [...blobs.keys()],
        backupHash: fingerprint(JSON.stringify(buildSnapshot({ ...snapshot, entries }))),
        lastBackupAt: Date.now(),
      },
    },
  })
  return { missingPhotos }
}
