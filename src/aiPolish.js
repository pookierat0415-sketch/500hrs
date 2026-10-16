// Optional AI polishing: turns rough daily notes into a formal OJT narrative paragraph.
//
// The app never calls an LLM provider directly. An API key bundled into a PWA or
// APK can be extracted by anyone, so requests go to our own endpoint
// (server/ai-polish.php on Hostinger), which holds the key and calls the model.
// Set VITE_AI_POLISH_URL in .env.local to enable the feature.

const ENDPOINT = import.meta.env.VITE_AI_POLISH_URL
const TIMEOUT_MS = 55_000 // the server may try two models at up to 25s each
const MAX_NOTES = 2000

export const isAiConfigured = Boolean(ENDPOINT)

/** The AI step can't run right now (offline, not configured, server busy). Try again later. */
export class AiUnavailableError extends Error {
  constructor(reason, options) {
    super(`AI polishing unavailable: ${reason}`, options)
    this.name = 'AiUnavailableError'
    this.reason = reason
  }
}

/** The server refused this request; retrying the same notes won't help. */
export class AiRejectedError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'AiRejectedError'
  }
}

/**
 * Rewrites rough notes into a narrative paragraph.
 * Throws AiUnavailableError (retry later) or AiRejectedError (give up).
 *
 * @param {{ notes: string, category?: string, date?: string, signal?: AbortSignal }} input
 * @returns {Promise<string>}
 */
export async function polishNotes({ notes, category, date, signal }) {
  if (!ENDPOINT) throw new AiUnavailableError('not-configured')
  if (!navigator.onLine) throw new AiUnavailableError('offline')

  const trimmed = notes.trim().slice(0, MAX_NOTES)
  if (!trimmed) throw new AiRejectedError('Nothing to polish.')

  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const combined = signal && AbortSignal.any ? AbortSignal.any([signal, timeout]) : timeout

  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: trimmed, category, date }),
      signal: combined,
    })
  } catch (err) {
    if (signal?.aborted) throw err // caller cancelled; let them handle it
    // Lost connection, DNS failure, timeout, or a CORS rejection.
    throw new AiUnavailableError(timeout.aborted ? 'timeout' : 'network', { cause: err })
  }

  const body = await res.json().catch(() => null)

  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      throw new AiUnavailableError(`server-${res.status}`)
    }
    throw new AiRejectedError(body?.error || `Request failed (${res.status}).`)
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) throw new AiUnavailableError('empty-response')
  return text
}

/**
 * Never throws for offline or server problems: falls back to the raw notes.
 * Use this when you just need "the best text available right now".
 *
 * @returns {Promise<{ text: string, polished: boolean, error?: Error }>}
 */
export async function polishOrRaw(input) {
  try {
    return { text: await polishNotes(input), polished: true }
  } catch (error) {
    if (input.signal?.aborted) throw error
    return { text: input.notes.trim(), polished: false, error }
  }
}
