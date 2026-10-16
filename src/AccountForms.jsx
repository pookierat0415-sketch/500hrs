import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Copy, KeyRound, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { checkUsername, cleanUsername, USERNAME_PATTERN, usernameHint } from './account.js'
import { cleanInitial, cleanName, cleanNameParts, composeName, MAX_NAME, nameIsComplete } from './name.js'
import { fieldClass, primaryButtonClass } from './ui.js'

// Forms for creating and restoring an ohjeyti account. Used by the first-run
// onboarding and by Settings.

const label = 'mb-1.5 block text-sm font-semibold text-slate-200'

function ErrorText({ children }) {
  if (!children) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-red-400/20">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Name
// ---------------------------------------------------------------------------

/** First name / M.I. / Last name. `value` is { firstName, middleInitial, lastName }. */
export function NameFields({ value, onChange, showErrors, autoFocus = false }) {
  const missingFirst = !cleanName(value.firstName)
  const missingLast = !cleanName(value.lastName)
  const set = (key) => (e) =>
    onChange({ ...value, [key]: key === 'middleInitial' ? cleanInitial(e.target.value) : e.target.value })

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="ob-first" className={label}>
          First name
        </label>
        <input
          id="ob-first"
          autoFocus={autoFocus}
          value={value.firstName}
          maxLength={MAX_NAME}
          autoComplete="given-name"
          autoCapitalize="words"
          onChange={set('firstName')}
          placeholder="e.g. Juan"
          aria-invalid={showErrors && missingFirst}
          className={`${fieldClass} ${showErrors && missingFirst ? 'border-red-400/60' : ''}`}
        />
      </div>
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <div>
          <label htmlFor="ob-mi" className={label}>
            M.I.
          </label>
          <input
            id="ob-mi"
            value={value.middleInitial}
            maxLength={3}
            autoComplete="additional-name"
            autoCapitalize="characters"
            onChange={set('middleInitial')}
            placeholder="D"
            className={`${fieldClass} text-center`}
          />
        </div>
        <div>
          <label htmlFor="ob-last" className={label}>
            Last name
          </label>
          <input
            id="ob-last"
            value={value.lastName}
            maxLength={MAX_NAME}
            autoComplete="family-name"
            autoCapitalize="words"
            onChange={set('lastName')}
            placeholder="e.g. Dela Cruz"
            aria-invalid={showErrors && missingLast}
            className={`${fieldClass} ${showErrors && missingLast ? 'border-red-400/60' : ''}`}
          />
        </div>
      </div>
      {showErrors && (missingFirst || missingLast) ? (
        <p role="alert" className="text-sm text-red-300">
          Please enter your {missingFirst && missingLast ? 'first and last name' : missingFirst ? 'first name' : 'last name'}.
          M.I. is optional.
        </p>
      ) : (
        <p className="text-xs text-slate-500">M.I. is optional. You can change your name later in the Report tab.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Username
// ---------------------------------------------------------------------------

/** Username input with a live "is it taken?" check against the server. */
function UsernameField({ value, onChange, showErrors, autoFocus }) {
  const [remote, setRemote] = useState({ for: '', status: 'idle', message: '' })
  const latest = useRef(value)
  const valid = USERNAME_PATTERN.test(value)

  useEffect(() => {
    latest.current = value
    if (!valid || !navigator.onLine) return
    const t = setTimeout(async () => {
      setRemote({ for: value, status: 'checking', message: '' })
      try {
        const { available, error } = await checkUsername(value)
        if (latest.current !== value) return // the user kept typing
        setRemote({ for: value, status: available ? 'available' : 'taken', message: error ?? '' })
      } catch {
        if (latest.current === value) setRemote({ for: value, status: 'idle', message: '' })
      }
    }, 450)
    return () => clearTimeout(t)
  }, [value, valid])

  const status = remote.for === value ? remote.status : 'idle'
  let hint = <span className="text-slate-500">{usernameHint}</span>
  if (value && !valid && (showErrors || value.length >= 3)) hint = <span className="text-red-300">{usernameHint}</span>
  else if (status === 'checking') hint = <span className="text-slate-400">Checking…</span>
  else if (status === 'available') hint = <span className="flex items-center gap-1 text-emerald-400"><Check className="size-3.5" strokeWidth={3} /> @{value} is available</span>
  else if (status === 'taken') hint = <span className="flex items-center gap-1 text-red-300"><X className="size-3.5" strokeWidth={3} /> {remote.message || `@${value} is already taken`}</span>

  return (
    <div>
      <label htmlFor="ob-username" className={label}>
        Username
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-slate-500">@</span>
        <input
          id="ob-username"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(cleanUsername(e.target.value))}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          placeholder="juan.dc"
          aria-invalid={(showErrors && !valid) || status === 'taken'}
          aria-describedby="ob-username-hint"
          className={`${fieldClass} pl-9 ${(showErrors && !valid) || status === 'taken' ? 'border-red-400/60' : ''}`}
        />
      </div>
      <p id="ob-username-hint" className="mt-1.5 text-xs" aria-live="polite">
        {hint}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * @param {object} props
 * @param {object} props.initialName  { firstName, middleInitial, lastName }
 * @param {(values) => Promise<void>} props.onCreate  throws AccountError / AccountUnavailableError
 * @param {boolean} props.online
 * @param {React.ReactNode} [props.footer]  extra links under the button
 * @param {string} [props.submitLabel]
 */
export function CreateAccountForm({ initialName, onCreate, online, footer, submitLabel = 'Create account' }) {
  const [username, setUsername] = useState('')
  const [name, setName] = useState({
    firstName: initialName?.firstName ?? '',
    middleInitial: initialName?.middleInitial ?? '',
    lastName: initialName?.lastName ?? '',
  })
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setTouched(true)
    if (!USERNAME_PATTERN.test(username) || !nameIsComplete(name)) return
    setBusy(true)
    setError('')
    try {
      await onCreate({ username, ...cleanNameParts(name) })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const preview = composeName(name)

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {!online && (
        <ErrorText>You’re offline. Creating an account needs the internet, once. Everything else works offline.</ErrorText>
      )}
      <UsernameField value={username} onChange={setUsername} showErrors={touched} autoFocus />
      <NameFields value={name} onChange={setName} showErrors={touched} />
      {preview && username && (
        <div className="rounded-2xl bg-slate-800/50 p-4 ring-1 ring-line/5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your account</p>
          <p className="mt-1 text-lg font-bold">{preview}</p>
          <p className="text-sm text-slate-400">@{username}</p>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={busy || !online} className={primaryButtonClass}>
        {busy ? <LoaderCircle className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
        {busy ? 'Creating…' : submitLabel}
      </button>
      {footer}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/** "ett2srkg95my" -> "ETT2-SRKG-95MY" */
const formatCode = (s) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16)
    .replace(/(.{4})(?=.)/g, '$1-')

/**
 * @param {object} props
 * @param {(values, onProgress) => Promise<void>} props.onRestore
 * @param {boolean} props.online
 * @param {boolean} [props.replacesData]  warn that local data will be replaced
 * @param {React.ReactNode} [props.footer]
 */
export function RestoreAccountForm({ onRestore, online, replacesData, footer }) {
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null) // { done, total }
  const [error, setError] = useState('')

  const ready = USERNAME_PATTERN.test(username) && code.replace(/-/g, '').length === 16

  const submit = async (e) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      await onRestore({ username, recoveryCode: code }, (done, total) => setProgress({ done, total }))
    } catch (err) {
      setError(err.message)
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {!online && <ErrorText>You’re offline. Restoring needs the internet.</ErrorText>}
      <div>
        <label htmlFor="rs-username" className={label}>
          Username
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-slate-500">@</span>
          <input
            id="rs-username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(cleanUsername(e.target.value))}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            placeholder="juan.dc"
            className={`${fieldClass} pl-9`}
          />
        </div>
      </div>
      <div>
        <label htmlFor="rs-code" className={label}>
          Recovery code
        </label>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
          <input
            id="rs-code"
            value={code}
            onChange={(e) => setCode(formatCode(e.target.value))}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            className={`${fieldClass} pl-12 font-mono tracking-wider`}
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">The code you saved when you created your account.</p>
      </div>

      {replacesData && (
        <p className="rounded-2xl bg-sun-400/10 px-4 py-3 text-sm text-accent ring-1 ring-sun-400/20">
          Restoring replaces the logs on this phone with your backup.
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={!ready || busy || !online} className={primaryButtonClass}>
        {busy ? <LoaderCircle className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
        {busy
          ? progress?.total
            ? `Restoring photos ${progress.done} of ${progress.total}…`
            : 'Restoring…'
          : 'Restore my logs'}
      </button>
      {footer}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Recovery code
// ---------------------------------------------------------------------------

export function RecoveryCodeCard({ username, code }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`ohjeyti account @${username}\nRecovery code: ${code}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('Copy your recovery code:', code)
    }
  }

  return (
    <div className="rounded-3xl border border-sun-400/30 bg-sun-400/5 p-5 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">@{username} · recovery code</p>
      <p className="mt-3 select-all break-all font-mono text-2xl font-bold tracking-wider text-accent sm:text-3xl">{code}</p>
      <button
        type="button"
        onClick={copy}
        className="mx-auto mt-4 flex h-10 items-center gap-2 rounded-xl bg-slate-800 px-4 text-sm font-semibold text-slate-200 active:scale-95"
      >
        {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
        {copied ? 'Copied' : 'Copy code'}
      </button>
    </div>
  )
}

/** Shown once, right after creating an account. */
export function SaveRecoveryCode({ username, code, onDone }) {
  const [saved, setSaved] = useState(false)
  return (
    <div className="space-y-5">
      <RecoveryCodeCard username={username} code={code} />
      <ul className="space-y-2 text-sm leading-relaxed text-slate-400">
        <li>📸 Take a screenshot, or write it down somewhere safe.</li>
        <li>🔑 It’s the only way to get your logs back if you delete the app or change phones.</li>
        <li>🙈 Don’t share it. Anyone with your username and this code can see your logs.</li>
        <li>⚙ You can view it again later in Settings, on this phone.</li>
      </ul>
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-slate-800/60 p-4 ring-1 ring-line/5">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="size-5 shrink-0 accent-sun-400"
        />
        <span className="text-sm font-semibold">I’ve saved my recovery code</span>
      </label>
      <button type="button" onClick={onDone} disabled={!saved} className={primaryButtonClass}>
        Continue
        <ArrowRight className="size-5" />
      </button>
    </div>
  )
}
