import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Bug,
  Building2,
  CalendarCheck,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CloudUpload,
  CloudOff,
  Clock,
  Code,
  Cpu,
  Download,
  FileCheck2,
  FileText,
  FileType,
  FileUp,
  GraduationCap,
  Hourglass,
  Info,
  ImagePlus,
  LayoutDashboard,
  Lightbulb,
  LoaderCircle,
  MessageSquareWarning,
  Monitor,
  Moon,
  NotebookPen,
  Palette,
  Play,
  RotateCcw,
  Plus,
  Search,
  Send,
  Settings as SettingsIcon,
  Sparkles,
  Square,
  Sun,
  Tag,
  Timer,
  Trash2,
  TrendingUp,
  Undo2,
  UserRound,
  User,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { version as APP_VERSION } from '../package.json'
import { AiUnavailableError, isAiConfigured, polishNotes } from './aiPolish.js'
import {
  AccountError,
  AccountUnavailableError,
  backUp,
  buildSnapshot,
  deleteAccount,
  fingerprint,
  isAccountConfigured,
  register as registerAccount,
  restore as restoreAccountApi,
  restoreToDevice,
} from './account.js'
import { CreateAccountForm, RecoveryCodeCard, RestoreAccountForm, SaveRecoveryCode } from './AccountForms.jsx'
import * as db from './db.js'
import { composeName, MAX_NAME, splitName } from './name.js'
import { isNativeApp, saveFile, syncSystemBars } from './native.js'
import Onboarding from './Onboarding.jsx'
import { flushReports, isReportPending, queueReport, startReportSync } from './reportQueue.js'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GOAL_HOURS = 500
// Pre-fills a few weeks of sample shifts and entries so every screen has data.
// Development only: real users must start with 0 hours, not fake ones.
const SEED_DEMO_DATA = import.meta.env.DEV
const MAX_DESCRIPTION = 1000
const MAX_PHOTOS = 6
const MAX_CATEGORY_LABEL = 24
const MAX_REPORT_MESSAGE = 2000

const CATEGORIES = [
  {
    id: 'development',
    label: 'Development',
    icon: Code,
    chip: 'bg-sky-500/15 text-sky-300 ring-sky-400/30',
    print: 'text-sky-700',
    docx: '0369A1',
  },
  {
    id: 'documentation',
    label: 'Documentation',
    icon: FileText,
    chip: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
    print: 'text-emerald-700',
    docx: '047857',
  },
  {
    id: 'hardware',
    label: 'Hardware',
    icon: Cpu,
    chip: 'bg-orange-500/15 text-orange-300 ring-orange-400/30',
    print: 'text-orange-700',
    docx: 'C2410C',
  },
  {
    id: 'meeting',
    label: 'Meeting',
    icon: Users,
    chip: 'bg-violet-500/15 text-violet-300 ring-violet-400/30',
    print: 'text-violet-700',
    docx: '6D28D9',
  },
  {
    id: 'training',
    label: 'Training',
    icon: GraduationCap,
    chip: 'bg-pink-500/15 text-pink-300 ring-pink-400/30',
    print: 'text-pink-700',
    docx: 'BE185D',
  },
]
const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))

// User-created categories share one look so they stand apart from the built-ins.
const CUSTOM_CATEGORY_STYLE = {
  icon: Tag,
  chip: 'bg-teal-500/15 text-teal-300 ring-teal-400/30',
  print: 'text-teal-700',
  docx: '0F766E',
}

const CategoriesContext = createContext({ list: CATEGORIES, map: CATEGORY_MAP })
const useCategories = () => useContext(CategoriesContext)

const TABS = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'timer', label: 'Timer', icon: Timer },
  { id: 'log', label: 'New Log', icon: NotebookPen },
  { id: 'logs', label: 'Field Logs', icon: ClipboardList },
  { id: 'report', label: 'Report', icon: FileText },
]

// ---------------------------------------------------------------------------
// Date & formatting helpers (all dates are local, keyed as YYYY-MM-DD)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

const pad = (n) => String(n).padStart(2, '0')
const toDateKey = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromDateKey = (key) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const addDays = (date, n) => {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}
const isWeekday = (d) => d.getDay() !== 0 && d.getDay() !== 6
const startOfWeek = (date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // Monday
  return d
}
const addWorkdays = (from, n) => {
  let d = new Date(from)
  let added = 0
  while (added < n) {
    d = addDays(d, 1)
    if (isWeekday(d)) added++
  }
  return d
}

const fmtDate = (key, opts = { month: 'short', day: 'numeric' }) =>
  fromDateKey(key).toLocaleDateString(undefined, opts)
const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const fmtHours = (h) => {
  const mins = Math.round(h * 60)
  const hh = Math.floor(mins / 60)
  const mm = mins % 60
  if (!hh) return `${mm}m`
  return mm ? `${hh}h ${mm}m` : `${hh}h`
}
const fmtClock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
const joinList = (items) =>
  items.length <= 2
    ? items.join(' and ')
    : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`

const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const sum = (arr, fn) => arr.reduce((acc, x) => acc + fn(x), 0)

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

function buildSeedData() {
  if (!SEED_DEMO_DATA) return { shifts: [], entries: [] }

  const samples = [
    ['development', 'Built the CRUD screens for the inventory module using React and the existing REST endpoints.'],
    ['documentation', 'Drafted the user manual for the helpdesk ticketing system and updated the project README.'],
    ['hardware', 'Crimped and tested CAT6 cables for the new 2nd floor network drops with the IT team.'],
    ['meeting', 'Attended sprint planning, took minutes, and was assigned two tickets for the employee portal.'],
    ['development', 'Fixed form validation bugs reported by QA in the employee portal and opened a pull request.'],
    ['hardware', 'Reimaged six workstations and installed the standard software bundle for new hires.'],
    ['training', 'Completed the onboarding module on data privacy and the company security policy.'],
    ['documentation', 'Prepared the network topology diagram used for the server room audit.'],
  ]

  const shifts = []
  const entries = []
  let day = addDays(new Date(), -1)
  let count = 0
  while (count < 18) {
    if (isWeekday(day)) {
      const date = toDateKey(day)
      const start = new Date(day)
      start.setHours(8, count % 3 === 0 ? 5 : 0, 0, 0)
      const hours = count % 5 === 0 ? 7.5 : 8
      const end = start.getTime() + hours * HOUR_MS
      shifts.push({ id: uid(), date, start: start.getTime(), end, hours, entryId: null })
      const [category, description] = samples[count % samples.length]
      entries.push({
        id: uid(),
        date,
        category,
        description,
        photos: [],
        createdAt: end,
        polishState: 'raw',
        polished: null,
      })
      count++
    }
    day = addDays(day, -1)
  }
  return { shifts, entries }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

// The text that represents an entry everywhere (cards, search, report):
// the AI-polished paragraph when there is one, otherwise the user's own notes.
const entryText = (e) => (e.polishState === 'polished' && e.polished) || e.description

const DEFAULT_PROFILE = {
  name: '', // composed from the parts below, used on reports
  firstName: '',
  middleInitial: '',
  lastName: '',
  course: 'BS Information Technology',
  company: '',
  supervisor: '',
}

// Older saves only had `name`; split it so the name fields can be edited.
const hydrateProfile = (saved = {}) => {
  const profile = { ...DEFAULT_PROFILE, ...saved }
  if (profile.name && !profile.firstName && !profile.lastName) Object.assign(profile, splitName(profile.name))
  return profile
}

const hydrateCategory = ({ id, label }) => ({ id, label, custom: true, ...CUSTOM_CATEGORY_STYLE })

// Loads saved data, seeding sample data on the very first run. Memoized so React
// StrictMode's double mount in development can't seed twice.
let initialLoad
function loadInitialData() {
  initialLoad ??= (async () => {
    const data = await db.loadAll()
    if (data.meta.seeded) return data
    const seed = buildSeedData()
    await db.saveAll({ ...seed, meta: { seeded: true } })
    return { entries: seed.entries, shifts: seed.shifts, meta: { ...data.meta, seeded: true } }
  })()
  return initialLoad
}

function useStoredFlag(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored === null ? defaultValue : stored === 'on'
    } catch {
      return defaultValue
    }
  })
  const update = (next) => {
    setValue(next)
    try {
      localStorage.setItem(key, next ? 'on' : 'off')
    } catch {
      // Storage unavailable (private mode): the choice still applies this session.
    }
  }
  return [value, update]
}

const AI_RETRY_MS = 60_000

/**
 * Background AI polishing. Picks up entries whose polishState is 'queued' one at a
 * time whenever the device is online. Offline or a busy server leaves the entry
 * queued (it keeps showing the raw notes) and retries after AI_RETRY_MS.
 * Returns the id of the entry currently being polished, if any.
 */
function useAutoPolish({ entries, online, categoryMap, onPolished, onFailed }) {
  const [activeId, setActiveId] = useState(null)
  const [retryTick, setRetryTick] = useState(0)
  const busy = useRef(false)
  const blockedUntil = useRef(0)
  const retryTimer = useRef(null)
  const latest = useRef({ categoryMap, onPolished, onFailed })

  useEffect(() => {
    latest.current = { categoryMap, onPolished, onFailed }
  })

  useEffect(() => () => clearTimeout(retryTimer.current), [])

  useEffect(() => {
    if (!isAiConfigured || !online || busy.current || Date.now() < blockedUntil.current) return
    const next = entries.find((e) => e.polishState === 'queued')
    if (!next) return

    const run = async () => {
      busy.current = true
      setActiveId(next.id)
      try {
        const text = await polishNotes({
          notes: next.description,
          category: latest.current.categoryMap[next.category]?.label,
          date: next.date,
        })
        latest.current.onPolished(next.id, text)
      } catch (err) {
        if (err instanceof AiUnavailableError) {
          blockedUntil.current = Date.now() + AI_RETRY_MS
          clearTimeout(retryTimer.current)
          retryTimer.current = setTimeout(() => setRetryTick((t) => t + 1), AI_RETRY_MS)
        } else {
          console.warn('[ai] polishing rejected', err)
          latest.current.onFailed(next.id, err.message)
        }
      } finally {
        busy.current = false
        setActiveId(null)
      }
    }
    run()
  }, [entries, online, retryTick])

  // Coming back online should retry right away instead of waiting out the backoff.
  useEffect(() => {
    if (online) blockedUntil.current = 0
  }, [online])

  return activeId
}

const AiContext = createContext({ configured: false, online: true, activeId: null })

const BACKUP_DELAY_MS = 8_000 // wait for typing to settle before uploading
const BACKUP_RETRY_MS = 60_000

/**
 * Online backup. Whenever the data changes and the phone is online, uploads new
 * photos (shrunk) and the latest snapshot to the student's account. Offline or a
 * busy server just means it tries again later; nothing is lost.
 * Returns { state, backupNow } where state is one of
 * 'none' | 'saved' | 'pending' | 'saving' | 'offline' | 'error' | 'signed-out'.
 */
function useCloudBackup({ ready, account, setAccount, online, entries, shifts, profile, customCategories, activeShift }) {
  const [activity, setActivity] = useState('idle') // idle | saving | error
  const [tick, setTick] = useState(0)
  const busy = useRef(false)
  const force = useRef(false)
  const retryTimer = useRef(null)

  const snapshot = useMemo(
    () => buildSnapshot({ entries, shifts, profile, customCategories, activeShift }),
    [entries, shifts, profile, customCategories, activeShift],
  )
  const hash = useMemo(() => fingerprint(JSON.stringify(snapshot)), [snapshot])
  const photos = useMemo(() => entries.flatMap((e) => e.photos), [entries])
  const latest = useRef({})

  useEffect(() => {
    latest.current = { snapshot, hash, photos, account }
  })
  useEffect(() => () => clearTimeout(retryTimer.current), [])

  const token = account?.token
  const signedOut = Boolean(account?.signedOut)
  const uploaded = account?.uploadedPhotos
  const upToDate =
    Boolean(account) && account.backupHash === hash && photos.every((ph) => uploaded?.includes(ph.id))

  useEffect(() => {
    if (!ready || !token || signedOut || !isAccountConfigured || !online || (upToDate && !force.current)) return
    const delay = force.current ? 0 : BACKUP_DELAY_MS
    force.current = false
    const t = setTimeout(async () => {
      if (busy.current) {
        retryTimer.current = setTimeout(() => setTick((n) => n + 1), 3000)
        return
      }
      busy.current = true
      setActivity('saving')
      const current = latest.current
      try {
        const ids = await backUp({
          token,
          snapshot: current.snapshot,
          fullName: current.snapshot.profile?.name,
          photos: current.photos,
          uploadedIds: current.account?.uploadedPhotos ?? [],
        })
        setAccount((a) => a && { ...a, uploadedPhotos: ids, backupHash: current.hash, lastBackupAt: Date.now() })
        setActivity('idle')
      } catch (err) {
        if (err instanceof AccountError && err.status === 401) {
          setAccount((a) => a && { ...a, signedOut: true })
          setActivity('idle')
        } else {
          console.warn('[backup]', err)
          setActivity(err instanceof AccountUnavailableError ? 'idle' : 'error')
          clearTimeout(retryTimer.current)
          retryTimer.current = setTimeout(() => setTick((n) => n + 1), BACKUP_RETRY_MS)
        }
      } finally {
        busy.current = false
      }
    }, delay)
    return () => clearTimeout(t)
  }, [ready, token, signedOut, online, hash, upToDate, tick, setAccount])

  let state = 'none'
  if (account) {
    if (signedOut) state = 'signed-out'
    else if (activity === 'saving') state = 'saving'
    else if (upToDate) state = 'saved'
    else if (!online) state = 'offline'
    else if (activity === 'error') state = 'error'
    else state = 'pending'
  }

  const backupNow = () => {
    force.current = true
    setActivity('idle')
    setTick((n) => n + 1)
  }

  return { state, backupNow }
}

/** "XXXXXXXXXXXXXXXX" or any spacing -> "XXXX-XXXX-XXXX-XXXX" */
const formatRecoveryCode = (code) =>
  code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/(.{4})(?=.)/g, '$1-')

const fmtAgo = (ts) => {
  if (!ts) return ''
  const mins = Math.round((Date.now() - ts) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const THEME_KEY = '500h-theme'
const THEME_COLORS = { light: '#f3f5f8', dark: '#020617' }

function readThemePreference() {
  try {
    return localStorage.getItem(THEME_KEY) ?? 'system'
  } catch {
    return 'system'
  }
}

// 'system' | 'light' | 'dark'. The resolved theme lives on <html data-theme>,
// which index.html also sets before first paint to avoid a flash.
function useTheme() {
  const [preference, setPreference] = useState(readThemePreference)

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, preference)
    } catch {
      // Storage can be unavailable (private mode); the choice still applies this session.
    }
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      const theme = preference === 'system' ? (media.matches ? 'light' : 'dark') : preference
      document.documentElement.dataset.theme = theme
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
      syncSystemBars()
    }
    apply()
    if (preference !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preference])

  return [preference, setPreference]
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [ready, setReady] = useState(false)
  const [onboarding, setOnboarding] = useState(null) // null | { askName }
  const [loadFailed, setLoadFailed] = useState(false)
  const [tab, setTab] = useState('dashboard')
  const [shifts, setShifts] = useState([])
  const [entries, setEntries] = useState([])
  const [activeShift, setActiveShift] = useState(null) // { start: timestamp }
  const [profile, setProfile] = useState(DEFAULT_PROFILE)
  const [customCategories, setCustomCategories] = useState([])
  const [reportTemplate, setReportTemplate] = useState(null) // { name, size, uploadedAt, blob }
  const [aiEnabled, setAiEnabled] = useStoredFlag('500h-ai-polish', false)
  const online = useOnline()
  const entriesRef = useRef(entries)
  const [toast, setToast] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useTheme()
  const [pendingReports, setPendingReports] = useState(0)
  const [account, setAccount] = useState(null) // { username, fullName, token, recoveryCode, uploadedPhotos, backupHash, lastBackupAt, signedOut? }
  const [accountSheet, setAccountSheet] = useState(null) // null | 'create' | 'restore'
  const toastTimer = useRef(null)

  const now = useNow(activeShift ? 1000 : 60_000)
  const today = toDateKey(new Date(now))

  const showToast = (message, tone = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ message, tone, id: uid() })
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // Saving runs in the background; tell the user if the device refuses (e.g. storage full).
  const persist = (promise) =>
    promise.catch((err) => {
      console.error('[db]', err)
      showToast("Couldn't save on this device. Check your free storage.", 'info')
    })

  // ----- load saved data -----
  useEffect(() => {
    let cancelled = false
    loadInitialData()
      .then(({ entries, shifts, meta }) => {
        if (cancelled) return
        setEntries(entries)
        setShifts(shifts)
        setActiveShift(meta.activeShift ?? null)
        setProfile(hydrateProfile(meta.profile))
        if (!meta.onboarded) setOnboarding({ askName: true })
        setCustomCategories((meta.customCategories ?? []).map(hydrateCategory))
        setReportTemplate(meta.reportTemplate ?? null)
        setAccount(meta.account ?? null)
        // After a restore the app reloads; say welcome back once it's up.
        let restored = null
        try {
          restored = JSON.parse(sessionStorage.getItem('ohjeyti-restored') ?? 'null')
          sessionStorage.removeItem('ohjeyti-restored')
        } catch {
          // sessionStorage unavailable: skip the message
        }
        if (restored) {
          showToast(
            restored.missingPhotos
              ? `Welcome back! Restored your logs (${restored.missingPhotos} photo${restored.missingPhotos > 1 ? 's' : ''} weren't backed up).`
              : 'Welcome back! Your logs are restored.',
          )
        }
        setReady(true)
        // Ask the browser not to evict our data when the device runs low on space.
        navigator.storage?.persist?.().catch(() => {})
      })
      .catch((err) => {
        console.error('[db] could not load saved data', err)
        // Don't start the app on empty state: the save effects below would
        // overwrite the user's real data with defaults.
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Small single values are mirrored to storage whenever they change.
  useEffect(() => {
    if (ready) persist(db.setMeta('activeShift', activeShift))
  }, [ready, activeShift])
  useEffect(() => {
    if (ready) persist(db.setMeta('profile', profile))
  }, [ready, profile])
  useEffect(() => {
    if (ready) persist(db.setMeta('customCategories', customCategories.map(({ id, label }) => ({ id, label }))))
  }, [ready, customCategories])
  useEffect(() => {
    if (ready) persist(db.setMeta('reportTemplate', reportTemplate))
  }, [ready, reportTemplate])
  useEffect(() => {
    if (ready) persist(db.setMeta('account', account))
  }, [ready, account])

  useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  // Uploads queued problem reports in the background whenever a connection is available.
  useEffect(() => startReportSync(setPendingReports), [])

  const changeTab = (id) => {
    setTab(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const categories = useMemo(() => {
    const list = [...CATEGORIES, ...customCategories]
    return { list, map: Object.fromEntries(list.map((c) => [c.id, c])) }
  }, [customCategories])

  // ----- derived stats -----
  const stats = useMemo(() => {
    const runningHours = activeShift ? Math.max(0, now - activeShift.start) / HOUR_MS : 0
    const loggedHours = sum(shifts, (s) => s.hours)
    const totalHours = loggedHours + runningHours

    const hoursByDate = {}
    for (const s of shifts) hoursByDate[s.date] = (hoursByDate[s.date] ?? 0) + s.hours

    const daysWorked = Object.keys(hoursByDate).length
    const avgPerDay = daysWorked ? loggedHours / daysWorked : 0
    const remaining = Math.max(0, GOAL_HOURS - totalHours)
    const percent = Math.min(100, (totalHours / GOAL_HOURS) * 100)
    const eta =
      remaining === 0
        ? new Date(now)
        : avgPerDay > 0
          ? addWorkdays(new Date(now), Math.ceil(remaining / avgPerDay))
          : null

    const weekStart = startOfWeek(new Date(now))
    const week = Array.from({ length: 7 }, (_, i) => {
      const key = toDateKey(addDays(weekStart, i))
      const hours = (hoursByDate[key] ?? 0) + (key === today ? runningHours : 0)
      return { key, hours, isToday: key === today }
    })

    return {
      runningHours,
      totalHours,
      hoursByDate,
      daysWorked,
      avgPerDay,
      remaining,
      percent,
      eta,
      week,
      weekHours: sum(week, (d) => d.hours),
      todayHours: (hoursByDate[today] ?? 0) + runningHours,
    }
  }, [shifts, activeShift, now, today])

  const sortedEntries = useMemo(
    () =>
      [...entries].sort((a, b) =>
        a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1,
      ),
    [entries],
  )

  // ----- actions -----
  const clockIn = () => {
    setActiveShift({ start: Date.now() })
    showToast('Clocked in. Have a productive shift!')
  }

  const clockOut = () => {
    if (!activeShift) return
    const end = Date.now()
    const hours = (end - activeShift.start) / HOUR_MS
    setActiveShift(null)
    if (hours < 1 / 60) {
      showToast('Shift was under a minute, so it was not recorded.', 'info')
      return
    }
    const shift = {
      id: uid(),
      date: toDateKey(new Date(activeShift.start)),
      start: activeShift.start,
      end,
      hours,
      entryId: null,
    }
    setShifts((prev) => [...prev, shift])
    persist(db.saveShift(shift))
    showToast(`Clocked out: ${fmtHours(hours)} added.`)
  }

  const deleteShift = (id) => {
    setShifts((prev) => prev.filter((s) => s.id !== id))
    persist(db.deleteShift(id))
    showToast('Shift removed.', 'info')
  }

  const addEntry = ({ date, category, description, photos, manualHours }) => {
    const willPolish = aiEnabled && isAiConfigured
    const entry = {
      id: uid(),
      date,
      category,
      description,
      photos,
      createdAt: Date.now(),
      polishState: willPolish ? 'queued' : 'raw',
      polished: null,
    }
    setEntries((prev) => [entry, ...prev])
    persist(db.saveEntry(entry))
    if (manualHours > 0) {
      const shift = { id: uid(), date, start: null, end: null, hours: manualHours, entryId: entry.id }
      setShifts((prev) => [...prev, shift])
      persist(db.saveShift(shift))
    }
    if (willPolish && !navigator.onLine) {
      showToast("Entry saved. It'll be polished with AI when you're online.", 'info')
    } else {
      showToast(
        manualHours > 0 ? `Entry saved with ${fmtHours(manualHours)}.` : 'Entry saved to Field Logs.',
      )
    }
  }

  // Applies a change to one entry in memory and on the device.
  const updateEntry = (id, patch) => {
    const current = entriesRef.current.find((e) => e.id === id)
    if (!current) return // deleted in the meantime
    const next = { ...current, ...patch }
    entriesRef.current = entriesRef.current.map((e) => (e.id === id ? next : e))
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
    persist(db.saveEntry(next))
  }

  const backup = useCloudBackup({
    ready,
    account,
    setAccount,
    online,
    entries,
    shifts,
    profile,
    customCategories,
    activeShift,
  })

  const polishingId = useAutoPolish({
    entries,
    online,
    categoryMap: categories.map,
    onPolished: (id, text) => updateEntry(id, { polishState: 'polished', polished: text }),
    onFailed: (id) => updateEntry(id, { polishState: 'failed' }),
  })

  const ai = {
    configured: isAiConfigured,
    online,
    activeId: polishingId,
    polish: (id) => updateEntry(id, { polishState: 'queued' }),
    revert: (id) => {
      updateEntry(id, { polishState: 'raw', polished: null })
      showToast('Restored your original notes.', 'info')
    },
  }

  // Returns the id of the new category, or of an existing one with the same name.
  const addCategory = (rawLabel) => {
    const label = rawLabel.trim().replace(/\s+/g, ' ').slice(0, MAX_CATEGORY_LABEL)
    if (!label) return null
    const existing = categories.list.find((c) => c.label.toLowerCase() === label.toLowerCase())
    if (existing) {
      showToast(`"${existing.label}" already exists, so it was selected.`, 'info')
      return existing.id
    }
    const category = { id: `custom-${uid()}`, label, custom: true, ...CUSTOM_CATEGORY_STYLE }
    setCustomCategories((prev) => [...prev, category])
    showToast(`Category "${label}" added.`)
    return category.id
  }

  const submitReport = async (report) => {
    const id = await queueReport(report)
    await flushReports()
    if (!(await isReportPending(id))) showToast('Thanks! Your report was sent.')
    else if (!navigator.onLine) showToast("Report saved. It'll send when you're back online.", 'info')
    else showToast("Report saved. We'll keep trying to send it.", 'info')
  }

  const saveName = (parts) =>
    setProfile((p) => ({ ...p, ...parts, name: composeName(parts) }))

  // Creates the account with the server, then saves the name and account locally.
  const createAccount = async ({ username, firstName, middleInitial, lastName }) => {
    const parts = { firstName, middleInitial, lastName }
    const res = await registerAccount(username, composeName(parts))
    saveName(parts)
    setAccount({
      username: res.username,
      fullName: res.fullName,
      token: res.token,
      recoveryCode: res.recoveryCode,
      uploadedPhotos: [],
      backupHash: null,
      lastBackupAt: null,
    })
    return { username: res.username, recoveryCode: res.recoveryCode }
  }

  // Checks the code, then replaces this phone's data with the backup and reloads.
  const restoreAccount = async ({ username, recoveryCode }, onProgress) => {
    const res = await restoreAccountApi(username, recoveryCode)
    const restored = {
      username: res.username,
      fullName: res.fullName,
      token: res.token,
      recoveryCode: formatRecoveryCode(recoveryCode),
      uploadedPhotos: [],
      backupHash: null,
      lastBackupAt: null,
    }
    if (!res.hasBackup) {
      // The account exists but never finished a backup: keep this phone's data and back it up now.
      setAccount(restored)
      if (!profile.firstName && !profile.lastName) saveName(splitName(res.fullName))
      setAccountSheet(null)
      if (onboarding) finishOnboarding()
      showToast(`Signed in as @${res.username}. Backing up this phone’s logs.`)
      return
    }
    const { missingPhotos } = await restoreToDevice(restored, onProgress)
    try {
      sessionStorage.setItem('ohjeyti-restored', JSON.stringify({ missingPhotos }))
    } catch {
      // only affects the welcome-back message
    }
    window.location.reload()
    await new Promise(() => {}) // keep the form busy until the page reloads
  }

  const removeOnlineBackup = async () => {
    try {
      await deleteAccount(account.token)
      setAccount(null)
      showToast('Online backup deleted. Your logs are still on this phone.', 'info')
    } catch (err) {
      showToast(err.message, 'info')
    }
  }

  const finishOnboarding = () => {
    setOnboarding(null)
    persist(db.setMeta('onboarded', true))
    changeTab('dashboard')
  }

  const deleteEntry = (id) => {
    const entry = entries.find((e) => e.id === id)
    entry?.photos.forEach((p) => URL.revokeObjectURL(p.url))
    setEntries((prev) => prev.filter((e) => e.id !== id))
    setShifts((prev) => prev.filter((s) => s.entryId !== id))
    persist(db.deleteEntry(id))
    showToast('Entry deleted.', 'info')
  }

  const screens = {
    dashboard: (
      <Dashboard
        stats={stats}
        activeShift={activeShift}
        now={now}
        recent={sortedEntries.slice(0, 3)}
        onClockIn={clockIn}
        onClockOut={clockOut}
        onNavigate={changeTab}
        onOpenPhoto={setLightbox}
      />
    ),
    timer: (
      <ShiftTimer
        activeShift={activeShift}
        now={now}
        today={today}
        shifts={shifts}
        todayHours={stats.todayHours}
        onClockIn={clockIn}
        onClockOut={clockOut}
        onDeleteShift={deleteShift}
      />
    ),
    log: (
      <DailyLogForm
        today={today}
        timerHoursToday={stats.todayHours}
        aiEnabled={aiEnabled && isAiConfigured}
        onAddCategory={addCategory}
        onSubmit={(data) => {
          addEntry(data)
          changeTab('logs')
        }}
      />
    ),
    logs: (
      <FieldLogs
        entries={sortedEntries}
        hoursByDate={stats.hoursByDate}
        onDelete={deleteEntry}
        onOpenPhoto={setLightbox}
        onNavigate={changeTab}
      />
    ),
    report: (
      <ExportReport
        entries={sortedEntries}
        shifts={shifts}
        stats={stats}
        profile={profile}
        today={today}
        onProfileChange={setProfile}
        template={reportTemplate}
        onTemplateChange={setReportTemplate}
        onToast={showToast}
      />
    ),
  }

  if (loadFailed) {
    return (
      <div className="grid min-h-svh place-items-center bg-slate-950 px-6 text-center text-slate-100">
        <div className="max-w-xs">
          <h1 className="text-lg font-bold">Couldn&apos;t open your saved data</h1>
          <p className="mt-2 text-sm text-slate-400">
            Your logs are still on this device. Close other tabs of ohjeyti and try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 h-12 rounded-2xl bg-sun-400 px-6 font-bold text-ink active:scale-95"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="grid min-h-svh place-items-center bg-slate-950">
        <div className="grid size-14 animate-pulse place-items-center rounded-2xl bg-gradient-to-br from-sun-300 to-sun-600">
          <Sun className="size-7 text-ink" strokeWidth={2.5} />
        </div>
      </div>
    )
  }

  return (
    <CategoriesContext.Provider value={categories}>
      <AiContext.Provider value={ai}>
        <div className="min-h-svh bg-slate-950 bg-[radial-gradient(ellipse_at_top,rgba(245,179,11,0.10),transparent_55%)] text-slate-100 print:bg-white print:bg-none">
          <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col print:max-w-none">
            <Header
              activeShift={activeShift}
              now={now}
              onOpenTimer={() => changeTab('timer')}
              onOpenSettings={() => setSettingsOpen(true)}
            />
            <main key={tab} className="animate-[fadeUp_.25s_ease-out] flex-1 px-4 pb-32 pt-2 print:p-0">
              {screens[tab]}
            </main>
          </div>

          <BottomNav tab={tab} onChange={changeTab} />
          <Toast toast={toast} />
          {!isNativeApp && <PwaUpdater />}
          <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />
          {settingsOpen && (
            <SettingsSheet
              theme={theme}
              onThemeChange={setTheme}
              aiEnabled={aiEnabled}
              onAiEnabledChange={setAiEnabled}
              pendingReports={pendingReports}
              onReport={() => {
                setSettingsOpen(false)
                setReportOpen(true)
              }}
              onReplayTour={() => {
                setSettingsOpen(false)
                setOnboarding({ askName: false })
              }}
              account={account}
              backupState={backup.state}
              onBackupNow={backup.backupNow}
              onOpenAccount={(mode) => {
                setSettingsOpen(false)
                setAccountSheet(mode)
              }}
              onDeleteBackup={removeOnlineBackup}
              onClose={() => setSettingsOpen(false)}
            />
          )}
          {accountSheet && (
            <AccountSheet
              mode={accountSheet}
              online={online}
              profile={profile}
              hasLocalData={entries.length > 0 || shifts.length > 0}
              onModeChange={setAccountSheet}
              onCreate={createAccount}
              onRestore={restoreAccount}
              onClose={() => setAccountSheet(null)}
            />
          )}
          {onboarding && (
            <Onboarding
              initialName={profile}
              askName={onboarding.askName}
              aiAvailable={isAiConfigured}
              accountsAvailable={isAccountConfigured}
              online={online}
              onSaveName={saveName}
              onCreateAccount={createAccount}
              onRestoreAccount={restoreAccount}
              onFinish={finishOnboarding}
            />
          )}
          {reportOpen && (
            <ReportProblemModal
              pendingCount={pendingReports}
              onSubmit={submitReport}
              onClose={() => setReportOpen(false)}
            />
          )}
        </div>
      </AiContext.Provider>
    </CategoriesContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function Header({ activeShift, now, onOpenTimer, onOpenSettings }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line/5 bg-slate-950/80 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl print:hidden">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-sun-300 to-sun-600 shadow-lg shadow-sun-500/20">
          <Sun className="size-5 text-ink" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight tracking-tight">ohjeyti</h1>
          <p className="text-xs text-slate-400">
            {new Date(now).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {activeShift ? (
          <button
            type="button"
            onClick={onOpenTimer}
            className="flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/30 active:scale-95"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            <span className="font-mono tabular-nums">{fmtClock(now - activeShift.start)}</span>
          </button>
        ) : (
          <span className="rounded-full bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-400 ring-1 ring-line/5">
            Off shift
          </span>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
          className="grid size-10 place-items-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 active:scale-90"
        >
          <SettingsIcon className="size-5" />
        </button>
      </div>
    </header>
  )
}

function BottomNav({ tab, onChange }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/5 bg-slate-950/90 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur-xl print:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5 px-2">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          if (id === 'log') {
            return (
              <li key={id} className="flex justify-center">
                <button
                  type="button"
                  onClick={() => onChange(id)}
                  aria-label={label}
                  aria-current={active ? 'page' : undefined}
                  className={`-mt-6 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-sun-300 to-sun-500 text-ink shadow-xl shadow-sun-500/30 ring-4 ring-slate-950 transition active:scale-90 ${active ? 'rotate-0' : ''}`}
                >
                  <NotebookPen className="size-6" strokeWidth={2.4} />
                </button>
              </li>
            )
          }
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition active:scale-95 ${active ? 'text-accent' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <span
                  className={`grid h-7 w-12 place-items-center rounded-full transition ${active ? 'bg-sun-400/15' : ''}`}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                </span>
                {label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// Tells the user when a new version of the web app is ready, and when the app
// has finished caching itself for offline use. Not used in the Android app,
// which ships its files inside the APK.
function PwaUpdater() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (!offlineReady) return
    const t = setTimeout(() => setOfflineReady(false), 4000)
    return () => clearTimeout(t)
  }, [offlineReady, setOfflineReady])

  if (!offlineReady && !needRefresh) return null
  return (
    <div role="status" className="fixed inset-x-0 bottom-28 z-50 flex justify-center px-4 print:hidden">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-slate-800 p-3 pl-4 text-sm shadow-2xl ring-1 ring-line/10">
        <span className="min-w-0 flex-1 font-medium text-slate-100">
          {needRefresh ? 'A new version of ohjeyti is ready.' : 'Ready to work offline.'}
        </span>
        {needRefresh ? (
          <>
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              className="h-9 rounded-xl px-3 font-semibold text-slate-400 hover:text-slate-200"
            >
              Later
            </button>
            <button
              type="button"
              onClick={() => updateServiceWorker(true)}
              className="h-9 rounded-xl bg-sun-400 px-4 font-bold text-ink active:scale-95"
            >
              Reload
            </button>
          </>
        ) : (
          <Check className="size-5 shrink-0 text-accent" />
        )}
      </div>
    </div>
  )
}

function Toast({ toast }) {
  if (!toast) return null
  const tone =
    toast.tone === 'info'
      ? 'bg-slate-800 text-slate-100 ring-line/10'
      : 'bg-sun-400 text-ink ring-sun-300'
  return (
    <div
      key={toast.id}
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center px-4 print:hidden"
    >
      <div
        className={`animate-[fadeUp_.2s_ease-out] rounded-2xl px-4 py-3 text-sm font-semibold shadow-2xl ring-1 ${tone}`}
      >
        {toast.message}
      </div>
    </div>
  )
}

function Lightbox({ photo, onClose }) {
  useEffect(() => {
    if (!photo) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photo, onClose])

  if (!photo) return null
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm print:hidden"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={photo.name}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] grid size-11 place-items-center rounded-full bg-white/10 text-white active:scale-90"
      >
        <X className="size-5" />
      </button>
      <img
        src={photo.url}
        alt={photo.name}
        className="max-h-full max-w-full rounded-2xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

function BottomSheet({ title, subtitle, onClose, footer, children, as: Container = 'div', ...rest }) {
  const titleId = useId()
  // App re-renders every second during a shift, so onClose changes identity;
  // reading it through a ref keeps the mount/unmount effect below from re-running.
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  // Lock page scroll and close on Escape while open.
  useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center print:hidden">
      <div
        className="absolute inset-0 animate-[fadeIn_.2s_ease-out] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <Container
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[92svh] w-full max-w-lg animate-[sheetUp_.28s_cubic-bezier(.2,.9,.3,1)] flex-col rounded-t-3xl border border-line/10 bg-slate-900 shadow-2xl sm:m-4 sm:rounded-3xl"
        {...rest}
      >
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-slate-700 sm:hidden" />

        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div>
            <h2 id={titleId} className="text-xl font-bold tracking-tight">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-800 text-slate-300 active:scale-90"
          >
            <X className="size-5" />
          </button>
        </div>

        <div
          className={`mt-4 flex-1 space-y-5 overflow-y-auto px-5 ${footer ? 'pb-5' : 'pb-[calc(env(safe-area-inset-bottom)+1.5rem)]'}`}
        >
          {children}
        </div>

        {footer && (
          <div className="border-t border-line/5 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
            {footer}
          </div>
        )}
      </Container>
    </div>
  )
}

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition ${checked ? 'bg-sun-400' : 'bg-slate-600'}`}
    >
      <span
        className={`absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : ''}`}
      />
    </button>
  )
}

const THEME_OPTIONS = [
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
]

const BACKUP_STATUS = {
  saved: { text: (a) => `Backed up ${fmtAgo(a.lastBackupAt)}`, tone: 'text-emerald-400' },
  saving: { text: () => 'Backing up…', tone: 'text-accent' },
  pending: { text: () => 'Changes waiting to back up', tone: 'text-slate-400' },
  offline: { text: () => 'Offline. Backs up when you’re connected.', tone: 'text-slate-400' },
  error: { text: () => 'Backup failed. Retrying soon.', tone: 'text-red-300' },
  'signed-out': { text: () => 'This phone was signed out.', tone: 'text-red-300' },
}

function AccountSection({ account, state, onBackupNow, onOpen, onDelete }) {
  const [showCode, setShowCode] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const heading = <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Account &amp; backup</h3>
  const smallButton =
    'flex h-10 items-center justify-center gap-1.5 rounded-xl bg-slate-700/60 px-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 active:scale-95 disabled:opacity-50'

  if (!account) {
    return (
      <section>
        {heading}
        <div className="rounded-2xl bg-slate-800/60 p-4 ring-1 ring-line/5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sun-400/15 text-accent">
              <CloudUpload className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">Back up your logs online</span>
              <span className="block text-xs leading-relaxed text-slate-400">
                Get them back if you delete the app or change phones. Just a username, no password.
              </span>
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onOpen('create')} className={`${smallButton} bg-sun-400 text-ink hover:bg-sun-300`}>
              Create account
            </button>
            <button type="button" onClick={() => onOpen('restore')} className={smallButton}>
              Restore
            </button>
          </div>
        </div>
      </section>
    )
  }

  const status = BACKUP_STATUS[state] ?? BACKUP_STATUS.pending
  return (
    <section>
      {heading}
      <div className="rounded-2xl bg-slate-800/60 p-4 ring-1 ring-line/5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sun-400/15 text-accent">
            <UserRound className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{account.fullName}</span>
            <span className="block truncate text-sm text-slate-400">@{account.username}</span>
          </span>
        </div>
        <p className={`mt-3 flex items-center gap-1.5 text-xs font-medium ${status.tone}`}>
          {state === 'saving' ? <LoaderCircle className="size-3.5 animate-spin" /> : <CloudUpload className="size-3.5" />}
          {status.text(account)}
        </p>

        {state === 'signed-out' ? (
          <button type="button" onClick={() => onOpen('restore')} className={`${smallButton} mt-3 w-full`}>
            Restore my account on this phone
          </button>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={onBackupNow} disabled={state === 'saving' || state === 'offline'} className={smallButton}>
              Back up now
            </button>
            <button type="button" onClick={() => setShowCode((v) => !v)} className={smallButton} aria-expanded={showCode}>
              {showCode ? 'Hide code' : 'Recovery code'}
            </button>
          </div>
        )}

        {showCode && (
          <div className="mt-3">
            {account.recoveryCode ? (
              <RecoveryCodeCard username={account.username} code={account.recoveryCode} />
            ) : (
              <p className="text-xs text-slate-400">The recovery code isn’t stored on this phone.</p>
            )}
          </div>
        )}

        <div className="mt-3 border-t border-line/5 pt-3 text-center">
          {confirmDelete ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">
                Deletes your account and online backup. Logs on this phone stay. This can’t be undone.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setConfirmDelete(false)} className={smallButton}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  className="h-10 rounded-xl bg-red-500/15 px-3 text-sm font-bold text-red-300 ring-1 ring-red-400/40 active:scale-95"
                >
                  Delete backup
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs font-medium text-slate-500 hover:text-red-300">
              Delete my online backup
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

/** Create or restore an account from Settings (after onboarding). */
function AccountSheet({ mode, online, profile, hasLocalData, onModeChange, onCreate, onRestore, onClose }) {
  const [created, setCreated] = useState(null)
  const switchLink = 'text-sm font-semibold text-accent underline-offset-4 hover:underline'

  if (created) {
    return (
      <BottomSheet title="Save your recovery code" onClose={onClose}>
        <SaveRecoveryCode username={created.username} code={created.recoveryCode} onDone={onClose} />
      </BottomSheet>
    )
  }

  return mode === 'create' ? (
    <BottomSheet title="Create your account" subtitle="Your logs back up automatically. No password needed." onClose={onClose}>
      <CreateAccountForm
        initialName={profile}
        online={online}
        onCreate={async (values) => setCreated(await onCreate(values))}
        footer={
          <p className="text-center">
            <button type="button" onClick={() => onModeChange('restore')} className={switchLink}>
              I already have an account
            </button>
          </p>
        }
      />
    </BottomSheet>
  ) : (
    <BottomSheet title="Restore your account" subtitle="Bring back your logs and photos from your online backup." onClose={onClose}>
      <RestoreAccountForm
        online={online}
        replacesData={hasLocalData}
        onRestore={onRestore}
        footer={
          <p className="text-center">
            <button type="button" onClick={() => onModeChange('create')} className={switchLink}>
              Create a new account instead
            </button>
          </p>
        }
      />
    </BottomSheet>
  )
}

function SettingsSheet({
  theme,
  onThemeChange,
  aiEnabled,
  onAiEnabledChange,
  pendingReports,
  onReport,
  onReplayTour,
  account,
  backupState,
  onBackupNow,
  onOpenAccount,
  onDeleteBackup,
  onClose,
}) {
  return (
    <BottomSheet title="Settings" onClose={onClose}>
      {isAccountConfigured && (
        <AccountSection
          account={account}
          state={backupState}
          onBackupNow={onBackupNow}
          onOpen={onOpenAccount}
          onDelete={onDeleteBackup}
        />
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Appearance</h3>
        <div
          role="radiogroup"
          aria-label="Theme"
          className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-800/60 p-1 ring-1 ring-line/5"
        >
          {THEME_OPTIONS.map(({ id, label, icon: Icon }) => {
            const active = theme === id
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onThemeChange(id)}
                className={`flex h-16 flex-col items-center justify-center gap-1 rounded-xl text-sm font-semibold transition active:scale-[0.97] ${
                  active ? 'bg-slate-700 text-accent shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="size-5" />
                {label}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">System follows your phone&apos;s light or dark setting.</p>
      </section>

      {isAiConfigured && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            AI writing assistant
          </h3>
          <div className="rounded-2xl bg-slate-800/60 p-3 ring-1 ring-line/5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sun-400/15 text-accent">
                <Sparkles className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Polish new entries</span>
                <span className="block text-xs text-slate-400">
                  Turns rough notes into report-ready paragraphs when you&apos;re online.
                </span>
              </span>
              <Switch checked={aiEnabled} onChange={onAiEnabledChange} label="Polish new entries with AI" />
            </div>
            <p className="mt-3 border-t border-line/5 pt-3 text-xs leading-relaxed text-slate-500">
              When on, the text of each new entry is sent to Google Gemini to be rewritten. Photos and
              hours are never sent, and your original notes are always kept.
            </p>
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Help</h3>
        <button
          type="button"
          onClick={onReport}
          className="flex w-full items-center gap-3 rounded-2xl bg-slate-800/60 p-3 text-left ring-1 ring-line/5 transition hover:bg-slate-800 active:scale-[0.99]"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sun-400/15 text-accent">
            <MessageSquareWarning className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Report a problem</span>
            <span className="block text-xs text-slate-400">
              {pendingReports > 0
                ? `${pendingReports} waiting to upload`
                : 'Bugs, glitches, or ideas. Works offline.'}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-slate-500" />
        </button>
        <button
          type="button"
          onClick={onReplayTour}
          className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-slate-800/60 p-3 text-left ring-1 ring-line/5 transition hover:bg-slate-800 active:scale-[0.99]"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sun-400/15 text-accent">
            <Info className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Replay walkthrough</span>
            <span className="block text-xs text-slate-400">A quick tour of every feature.</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-slate-500" />
        </button>
      </section>

      <p className="pt-2 text-center text-xs text-slate-500">
        ohjeyti v{APP_VERSION} · Works offline
      </p>
    </BottomSheet>
  )
}

const REPORT_TYPES = [
  { id: 'bug', label: 'Something broke', icon: Bug },
  { id: 'display', label: 'Looks wrong', icon: Palette },
  { id: 'idea', label: 'Suggestion', icon: Lightbulb },
  { id: 'other', label: 'Other', icon: MessageSquareWarning },
]

function ReportProblemModal({ pendingCount, onSubmit, onClose }) {
  const online = useOnline()
  const [type, setType] = useState('bug')
  const [message, setMessage] = useState('')
  const [screenshot, setScreenshot] = useState(null) // { file, url }
  const [sending, setSending] = useState(false)
  const fileInput = useRef(null)
  const screenshotRef = useRef(null)

  useEffect(() => {
    screenshotRef.current = screenshot
  }, [screenshot])

  // Free the preview URL when the modal closes.
  useEffect(
    () => () => {
      if (screenshotRef.current) URL.revokeObjectURL(screenshotRef.current.url)
    },
    [],
  )

  const pickScreenshot = (input) => {
    const file = input.files?.[0]
    input.value = ''
    if (!file?.type.startsWith('image/')) return
    if (screenshot) URL.revokeObjectURL(screenshot.url)
    setScreenshot({ file, url: URL.createObjectURL(file) })
  }

  const clearScreenshot = () => {
    URL.revokeObjectURL(screenshot.url)
    setScreenshot(null)
  }

  const trimmedLength = message.trim().length
  const canSubmit = trimmedLength >= 10 && !sending

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setSending(true)
    try {
      await onSubmit({ category: type, message: message.trim(), screenshot: screenshot?.file ?? null })
      onClose()
    } catch (err) {
      console.error(err)
      setSending(false)
    }
  }

  return (
    <BottomSheet
      as="form"
      onSubmit={handleSubmit}
      title="Report a problem"
      subtitle="Tell us what went wrong. A screenshot helps a lot."
      onClose={onClose}
      footer={
        <>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sun-400 text-base font-bold text-ink shadow-lg shadow-sun-500/20 transition hover:bg-sun-300 active:scale-[0.98] disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
          >
            {sending ? <LoaderCircle className="size-5 animate-spin" /> : <Send className="size-5" />}
            {sending ? 'Saving…' : online ? 'Send report' : 'Save report'}
          </button>
          {trimmedLength > 0 && trimmedLength < 10 && (
            <p className="mt-2 text-center text-xs text-slate-500">Please add a little more detail.</p>
          )}
        </>
      }
    >
      {!online && (
        <div className="flex items-start gap-3 rounded-2xl bg-sun-400/10 px-4 py-3 text-sm text-accent ring-1 ring-sun-400/20">
          <WifiOff className="mt-0.5 size-4 shrink-0" />
          <p>You&apos;re offline. Your report will be saved and sent automatically once you reconnect.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Problem type">
        {REPORT_TYPES.map(({ id, label, icon: Icon }) => {
          const active = type === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setType(id)}
              className={`flex h-12 items-center gap-2 rounded-2xl border px-3 text-sm font-semibold transition active:scale-[0.97] ${
                active
                  ? 'border-sun-400/60 bg-sun-400/10 text-accent'
                  : 'border-line/10 bg-slate-800/40 text-slate-300'
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </div>

      <Field label="What happened?" htmlFor="report-msg" hint={`${message.length}/${MAX_REPORT_MESSAGE}`}>
        <textarea
          id="report-msg"
          rows={5}
          maxLength={MAX_REPORT_MESSAGE}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. When I tap Clock Out, the timer keeps running and my hours don't update."
          className={`${inputClass} resize-none leading-relaxed`}
        />
      </Field>

      <Field label="Screenshot" hint="optional">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickScreenshot(e.target)}
        />
        {screenshot ? (
          <div className="relative overflow-hidden rounded-2xl bg-black ring-1 ring-line/10">
            <img src={screenshot.url} alt="Screenshot preview" className="mx-auto max-h-64 object-contain" />
            <div className="absolute right-2 top-2 flex gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="h-9 rounded-full bg-black/70 px-3 text-xs font-semibold text-white backdrop-blur active:scale-95"
              >
                Change
              </button>
              <button
                type="button"
                onClick={clearScreenshot}
                aria-label="Remove screenshot"
                className="grid size-9 place-items-center rounded-full bg-black/70 text-white backdrop-blur active:scale-90"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line/10 text-slate-400 transition hover:border-sun-400/40 hover:text-accent active:scale-[0.98]"
          >
            <ImagePlus className="size-6" />
            <span className="text-sm font-semibold">Attach a screenshot</span>
          </button>
        )}
      </Field>

      <p className="text-xs leading-relaxed text-slate-500">
        We&apos;ll also include your app version and device type to help us fix it. Your hours and logs
        are never sent.
        {pendingCount > 0 && (
          <span className="mt-1 block text-slate-400">
            {pendingCount} earlier {pendingCount === 1 ? 'report is' : 'reports are'} waiting to upload.
          </span>
        )}
      </p>
    </BottomSheet>
  )
}

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------

function Card({ className = '', children }) {
  return (
    <section
      className={`rounded-3xl border border-edge bg-card p-5 shadow-(--shadow-card) ${className}`}
    >
      {children}
    </section>
  )
}

function SectionTitle({ children, action }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{children}</h2>
      {action}
    </div>
  )
}

function PageTitle({ title, subtitle }) {
  return (
    <div className="mb-5 mt-3 print:hidden">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
    </div>
  )
}

function CategoryChip({ id }) {
  const cat = useCategories().map[id]
  if (!cat) return null
  const Icon = cat.icon
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${cat.chip}`}
    >
      <Icon className="size-3.5" />
      {cat.label}
    </span>
  )
}

function ClockButton({ active, onClockIn, onClockOut, size = 'lg' }) {
  const base =
    size === 'lg'
      ? 'h-16 w-full rounded-2xl text-lg'
      : 'h-12 rounded-xl px-5 text-sm'
  return active ? (
    <button
      type="button"
      onClick={onClockOut}
      className={`${base} flex items-center justify-center gap-2 bg-red-500 font-bold text-white shadow-lg shadow-red-500/25 transition hover:bg-red-400 active:scale-[0.97]`}
    >
      <Square className="size-5 fill-current" />
      Clock Out
    </button>
  ) : (
    <button
      type="button"
      onClick={onClockIn}
      className={`${base} flex items-center justify-center gap-2 bg-sun-400 font-bold text-ink shadow-lg shadow-sun-500/25 transition hover:bg-sun-300 active:scale-[0.97]`}
    >
      <Play className="size-5 fill-current" />
      Clock In
    </button>
  )
}

function ConfirmDelete({ onConfirm, label }) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])

  return armed ? (
    <button
      type="button"
      onClick={onConfirm}
      className="h-9 shrink-0 rounded-xl bg-red-500/15 px-3 text-xs font-bold text-red-300 ring-1 ring-red-400/40 active:scale-95"
    >
      Tap to delete
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setArmed(true)}
      aria-label={label}
      className="grid size-9 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 active:scale-90"
    >
      <Trash2 className="size-4" />
    </button>
  )
}

function PhotoStrip({ photos, onOpen }) {
  if (!photos.length) return null
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {photos.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onOpen(p)}
          className="size-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-line/10 active:scale-95"
          aria-label={`View ${p.name}`}
        >
          <img src={p.url} alt="" className="size-full object-cover" />
        </button>
      ))}
    </div>
  )
}

function EntryCard({ entry, onOpenPhoto, onDelete, showDate = false }) {
  const [showOriginal, setShowOriginal] = useState(false)
  const isPolished = entry.polishState === 'polished' && Boolean(entry.polished)
  const text = isPolished && !showOriginal ? entry.polished : entry.description

  return (
    <article className="rounded-2xl border border-edge bg-raised p-4 shadow-(--shadow-tile)">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip id={entry.category} />
          {showDate && <span className="text-xs text-slate-500">{fmtDate(entry.date)}</span>}
        </div>
        {onDelete && <ConfirmDelete onConfirm={() => onDelete(entry.id)} label="Delete entry" />}
      </div>
      <p className="mt-2.5 whitespace-pre-line text-[15px] leading-relaxed text-slate-200">{text}</p>
      <PhotoStrip photos={entry.photos} onOpen={onOpenPhoto} />
      <PolishBar
        entry={entry}
        isPolished={isPolished}
        showOriginal={showOriginal}
        onToggleOriginal={() => setShowOriginal((v) => !v)}
      />
    </article>
  )
}

const polishButton =
  'inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition active:scale-95 disabled:opacity-50'

// Status and actions for AI polishing under an entry. Renders nothing when the
// feature isn't set up and the entry was never polished.
function PolishBar({ entry, isPolished, showOriginal, onToggleOriginal }) {
  const ai = useContext(AiContext)
  const state = entry.polishState ?? 'raw'
  if (!ai.configured && !isPolished) return null

  let content
  if (isPolished) {
    content = (
      <>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
          <Sparkles className="size-3.5" />
          {showOriginal ? 'Your original notes' : 'Polished with AI'}
        </span>
        <span className="ml-auto flex gap-1">
          <button type="button" onClick={onToggleOriginal} className={`${polishButton} text-slate-300 hover:bg-slate-800`}>
            {showOriginal ? 'Show polished' : 'Show original'}
          </button>
          <button
            type="button"
            onClick={() => ai.revert(entry.id)}
            aria-label="Undo AI polish"
            title="Keep my original notes"
            className={`${polishButton} text-slate-400 hover:bg-slate-800`}
          >
            <Undo2 className="size-4" />
          </button>
        </span>
      </>
    )
  } else if (state === 'queued') {
    const waitingOffline = !ai.online
    content = (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
        {waitingOffline ? (
          <CloudOff className="size-3.5" />
        ) : (
          <LoaderCircle className="size-3.5 animate-spin text-accent" />
        )}
        {waitingOffline
          ? "Will polish with AI when you're online"
          : ai.activeId === entry.id
            ? 'Polishing with AI…'
            : 'Waiting to polish…'}
      </span>
    )
  } else if (state === 'failed') {
    content = (
      <>
        <span className="text-xs font-medium text-red-300">Couldn&apos;t polish this entry.</span>
        <button
          type="button"
          onClick={() => ai.polish(entry.id)}
          disabled={!ai.online}
          className={`${polishButton} ml-auto text-accent hover:bg-sun-400/10`}
        >
          <RotateCcw className="size-4" />
          Retry
        </button>
      </>
    )
  } else {
    content = (
      <button
        type="button"
        onClick={() => ai.polish(entry.id)}
        disabled={!ai.online}
        title={ai.online ? undefined : 'Connect to the internet to use AI'}
        className={`${polishButton} -ml-2 text-accent hover:bg-sun-400/10`}
      >
        <Sparkles className="size-4" />
        {ai.online ? 'Polish with AI' : 'Polish with AI (offline)'}
      </button>
    )
  }

  return <div className="mt-3 flex min-h-9 items-center gap-2 border-t border-line/5 pt-2">{content}</div>
}

function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line/10 px-6 py-12 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-slate-800/80">
        <Icon className="size-6 text-slate-400" />
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-slate-400">{text}</p>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function ProgressRing({ percent, size = 156, stroke = 14 }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
      <defs>
        <linearGradient id="sun-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-sun-200)" />
          <stop offset="100%" stopColor="var(--color-sun-500)" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="stroke-slate-800"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#sun-ring)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - percent / 100)}
        className="transition-[stroke-dashoffset] duration-1000 ease-out"
      />
    </svg>
  )
}

function StatTile({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-2xl border border-edge bg-card p-4 shadow-(--shadow-tile)">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
        <Icon className="size-4 text-accent" />
        {label}
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function WeekBars({ week }) {
  const max = Math.max(8, ...week.map((d) => d.hours))
  return (
    <div className="grid grid-cols-7 gap-2">
      {week.map((d) => (
        <div key={d.key} className="flex flex-col items-center gap-2">
          <div className="flex h-28 w-full items-end overflow-hidden rounded-xl bg-slate-800/80">
            <div
              className={`w-full rounded-xl transition-[height] duration-700 ${d.isToday ? 'bg-sun-400' : 'bg-sun-400/40'}`}
              style={{ height: `${(d.hours / max) * 100}%` }}
              title={`${fmtDate(d.key)}: ${fmtHours(d.hours)}`}
            />
          </div>
          <span
            className={`text-[11px] font-semibold ${d.isToday ? 'text-accent' : 'text-slate-500'}`}
          >
            {fromDateKey(d.key).toLocaleDateString(undefined, { weekday: 'narrow' })}
          </span>
        </div>
      ))}
    </div>
  )
}

function Dashboard({ stats, activeShift, now, recent, onClockIn, onClockOut, onNavigate, onOpenPhoto }) {
  const done = stats.remaining === 0
  return (
    <div className="space-y-4">
      <PageTitle title="Dashboard" subtitle="Your road to 500 hours." />

      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-sun-400/10 blur-3xl" />
        <div className="relative flex items-center gap-5">
          <div className="relative shrink-0">
            <ProgressRing percent={stats.percent} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold tabular-nums tracking-tight text-accent">
                {stats.percent.toFixed(stats.percent < 10 ? 1 : 0)}%
              </span>
              <span className="text-xs text-slate-400">of {GOAL_HOURS}h</span>
            </div>
          </div>
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Rendered</p>
              <p className="text-2xl font-bold tabular-nums">{fmtHours(stats.totalHours)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Remaining</p>
              <p className="text-2xl font-bold tabular-nums text-slate-300">
                {done ? 'Done!' : fmtHours(stats.remaining)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="flex items-center justify-between gap-4 p-4!">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400">
            {activeShift ? `On shift since ${fmtTime(activeShift.start)}` : 'Ready for today?'}
          </p>
          <p className="font-mono text-2xl font-bold tabular-nums">
            {activeShift ? fmtClock(now - activeShift.start) : fmtHours(stats.todayHours)}
          </p>
          {!activeShift && <p className="text-xs text-slate-500">logged today</p>}
        </div>
        <ClockButton
          size="sm"
          active={!!activeShift}
          onClockIn={onClockIn}
          onClockOut={onClockOut}
        />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Clock} label="Today" value={fmtHours(stats.todayHours)} />
        <StatTile icon={CalendarCheck} label="Days worked" value={stats.daysWorked} />
        <StatTile
          icon={TrendingUp}
          label="Avg per day"
          value={stats.avgPerDay ? fmtHours(stats.avgPerDay) : '—'}
        />
        <StatTile
          icon={Hourglass}
          label="Est. finish"
          value={
            stats.eta
              ? stats.eta.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              : '—'
          }
          hint={stats.eta && !done ? 'at current pace, weekdays' : undefined}
        />
      </div>

      <Card>
        <SectionTitle
          action={<span className="text-sm font-semibold text-accent">{fmtHours(stats.weekHours)}</span>}
        >
          This week
        </SectionTitle>
        <WeekBars week={stats.week} />
      </Card>

      <div>
        <SectionTitle
          action={
            <button
              type="button"
              onClick={() => onNavigate('logs')}
              className="flex items-center gap-0.5 text-sm font-semibold text-accent active:opacity-70"
            >
              View all <ChevronRight className="size-4" />
            </button>
          }
        >
          Recent entries
        </SectionTitle>
        {recent.length ? (
          <div className="space-y-3">
            {recent.map((e) => (
              <EntryCard key={e.id} entry={e} onOpenPhoto={onOpenPhoto} showDate />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={NotebookPen}
            title="No entries yet"
            text="Log what you worked on today to start building your narrative report."
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shift timer
// ---------------------------------------------------------------------------

function ShiftTimer({ activeShift, now, today, shifts, todayHours, onClockIn, onClockOut, onDeleteShift }) {
  const todayShifts = shifts.filter((s) => s.date === today).sort((a, b) => (b.start ?? 0) - (a.start ?? 0))
  const recentShifts = shifts
    .filter((s) => s.date !== today)
    .sort((a, b) => (a.date === b.date ? (b.start ?? 0) - (a.start ?? 0) : a.date < b.date ? 1 : -1))
    .slice(0, 6)

  const elapsed = activeShift ? Math.max(0, now - activeShift.start) : 0
  // Ring fills over a standard 8-hour shift.
  const shiftPercent = Math.min(100, (elapsed / (8 * HOUR_MS)) * 100)

  return (
    <div className="space-y-4">
      <PageTitle title="Shift Timer" subtitle="Clock in when you arrive, clock out when you leave." />

      <Card className="flex flex-col items-center py-8! text-center">
        <div className="relative">
          <ProgressRing percent={shiftPercent} size={220} stroke={16} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className={`text-xs font-semibold uppercase tracking-widest ${activeShift ? 'text-emerald-400' : 'text-slate-500'}`}
            >
              {activeShift ? 'On shift' : 'Off shift'}
            </span>
            <span className="mt-1 font-mono text-4xl font-bold tabular-nums tracking-tight">
              {fmtClock(elapsed)}
            </span>
            <span className="mt-1 text-xs text-slate-400">
              {activeShift ? `since ${fmtTime(activeShift.start)}` : 'tap Clock In to start'}
            </span>
          </div>
        </div>

        <div className="mt-8 w-full">
          <ClockButton active={!!activeShift} onClockIn={onClockIn} onClockOut={onClockOut} />
        </div>
      </Card>

      <Card>
        <SectionTitle
          action={<span className="text-sm font-semibold text-accent">{fmtHours(todayHours)}</span>}
        >
          Today&apos;s sessions
        </SectionTitle>
        {todayShifts.length || activeShift ? (
          <ul className="divide-y divide-line/5">
            {activeShift && (
              <li className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">
                    {fmtTime(activeShift.start)} → <span className="text-emerald-400">now</span>
                  </p>
                  <p className="text-xs text-slate-500">In progress</p>
                </div>
                <span className="font-mono text-sm tabular-nums text-emerald-300">
                  {fmtHours(elapsed / HOUR_MS)}
                </span>
              </li>
            )}
            {todayShifts.map((s) => (
              <ShiftRow key={s.id} shift={s} onDelete={onDeleteShift} />
            ))}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-slate-500">No sessions recorded today.</p>
        )}
      </Card>

      {recentShifts.length > 0 && (
        <Card>
          <SectionTitle>Recent shifts</SectionTitle>
          <ul className="divide-y divide-line/5">
            {recentShifts.map((s) => (
              <ShiftRow key={s.id} shift={s} onDelete={onDeleteShift} showDate />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function ShiftRow({ shift, onDelete, showDate = false }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-medium">
          {shift.start ? `${fmtTime(shift.start)} → ${fmtTime(shift.end)}` : 'Manual entry'}
        </p>
        <p className="text-xs text-slate-500">
          {showDate ? fmtDate(shift.date, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Completed'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-semibold tabular-nums text-accent">
          {fmtHours(shift.hours)}
        </span>
        <ConfirmDelete onConfirm={() => onDelete(shift.id)} label="Delete shift" />
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Daily log form
// ---------------------------------------------------------------------------

const inputClass =
  'w-full rounded-2xl border border-line/10 bg-slate-800/60 px-4 py-3.5 text-base text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-sun-400/60 focus:ring-4 focus:ring-sun-400/10'

function Field({ label, hint, children, htmlFor }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-200">
          {label}
        </label>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function AddCategoryButton({ onAdd }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState('')

  const close = () => {
    setEditing(false)
    setLabel('')
  }

  const submit = () => {
    if (!label.trim()) return
    onAdd(label)
    close()
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line/10 px-4 text-sm font-semibold text-slate-400 transition hover:border-sun-400/40 hover:text-accent active:scale-[0.97]"
      >
        <Plus className="size-5 shrink-0" />
        Custom
      </button>
    )
  }

  return (
    <div className="col-span-2 flex h-14 items-center gap-2 rounded-2xl border border-sun-400/60 bg-slate-800/60 pl-4 pr-2 ring-4 ring-sun-400/10">
      <Tag className="size-5 shrink-0 text-accent" />
      <input
        autoFocus
        value={label}
        maxLength={MAX_CATEGORY_LABEL}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          // Enter would otherwise submit the whole log form.
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          } else if (e.key === 'Escape') {
            close()
          }
        }}
        placeholder="e.g. Networking"
        aria-label="New category name"
        className="min-w-0 flex-1 bg-transparent text-base text-slate-100 placeholder:text-slate-500 outline-none"
      />
      <button
        type="button"
        onClick={close}
        aria-label="Cancel"
        className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-400 active:scale-90"
      >
        <X className="size-5" />
      </button>
      <button
        type="button"
        onClick={submit}
        disabled={!label.trim()}
        aria-label="Add category"
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-sun-400 text-ink transition active:scale-90 disabled:bg-slate-700 disabled:text-slate-500"
      >
        <Check className="size-5" strokeWidth={2.5} />
      </button>
    </div>
  )
}

function DailyLogForm({ today, timerHoursToday, aiEnabled, onSubmit, onAddCategory }) {
  const categories = useCategories()
  const [date, setDate] = useState(today)
  const [category, setCategory] = useState(CATEGORIES[0].id)
  const [description, setDescription] = useState('')
  const [manualHours, setManualHours] = useState('')
  const [photos, setPhotos] = useState([])
  const cameraInput = useRef(null)
  const galleryInput = useRef(null)
  const submitted = useRef(false)
  const photosRef = useRef(photos)

  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  // Release preview URLs if the form is left without saving.
  useEffect(
    () => () => {
      if (!submitted.current) photosRef.current.forEach((p) => URL.revokeObjectURL(p.url))
    },
    [],
  )

  const hoursValue = Number.parseFloat(manualHours)
  const hoursInvalid = manualHours !== '' && (!(hoursValue > 0) || hoursValue > 24)
  const canSubmit = description.trim().length >= 5 && !hoursInvalid

  const addPhotos = (input) => {
    const room = MAX_PHOTOS - photos.length
    const files = Array.from(input.files ?? [])
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, room)
    setPhotos((prev) => [
      ...prev,
      ...files.map((f) => ({
        id: uid(),
        name: f.name || `photo-${Date.now()}.jpg`,
        blob: f,
        url: URL.createObjectURL(f),
      })),
    ])
    // Reset so picking the same file again still fires onChange.
    input.value = ''
  }

  const removePhoto = (id) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((p) => p.id !== id)
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    submitted.current = true
    onSubmit({
      date,
      category,
      description: description.trim(),
      photos,
      manualHours: manualHours === '' ? 0 : hoursValue,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PageTitle title="New Daily Log" subtitle="Record what you did so your report writes itself." />

      <Card className="space-y-5">
        <Field label="Date" htmlFor="log-date">
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
            <input
              id="log-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value || today)}
              className={`${inputClass} pl-12`}
            />
          </div>
        </Field>

        <Field label="Category">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Category">
            {categories.list.map(({ id, label, icon: Icon }) => {
              const active = category === id
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setCategory(id)}
                  className={`flex h-14 items-center gap-2.5 rounded-2xl border px-4 text-sm font-semibold transition active:scale-[0.97] ${
                    active
                      ? 'border-sun-400/60 bg-sun-400/10 text-accent'
                      : 'border-line/10 bg-slate-800/40 text-slate-300 hover:border-line/20'
                  }`}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              )
            })}
            <AddCategoryButton
              onAdd={(label) => {
                const id = onAddCategory(label)
                if (id) setCategory(id)
              }}
            />
          </div>
        </Field>

        <Field
          label="What did you work on?"
          htmlFor="log-desc"
          hint={`${description.length}/${MAX_DESCRIPTION}`}
        >
          <textarea
            id="log-desc"
            rows={5}
            maxLength={MAX_DESCRIPTION}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              aiEnabled
                ? 'Rough notes are fine, e.g.\n- set up VLANs on core switch\n- documented IP scheme for new wing\n- learned basic Cisco CLI'
                : 'e.g. Configured VLANs on the core switch and documented the IP scheme for the new office wing.'
            }
            className={`${inputClass} resize-none leading-relaxed`}
          />
          {aiEnabled && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-400">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" />
              AI will turn these notes into a formal paragraph when you&apos;re online. Your original is
              kept.
            </p>
          )}
        </Field>

        <Field label="Hours rendered" hint="optional" htmlFor="log-hours">
          <input
            id="log-hours"
            type="number"
            inputMode="decimal"
            min="0.25"
            max="24"
            step="0.25"
            value={manualHours}
            onChange={(e) => setManualHours(e.target.value)}
            placeholder="Only if you didn't use the timer"
            className={`${inputClass} ${hoursInvalid ? 'border-red-400/60' : ''}`}
          />
          {hoursInvalid ? (
            <p className="mt-2 text-xs text-red-300">Enter a value between 0.25 and 24 hours.</p>
          ) : (
            date === today &&
            timerHoursToday > 0 && (
              <p className="mt-2 text-xs text-slate-400">
                The timer already has <span className="font-semibold text-accent">{fmtHours(timerHoursToday)}</span> today.
                Leave this empty to avoid double counting.
              </p>
            )
          )}
        </Field>

        <Field label="Photos" hint={`${photos.length}/${MAX_PHOTOS}`}>
          {/* capture opens the rear camera on phones; desktops fall back to a file picker. */}
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => addPhotos(e.target)}
          />
          <input
            ref={galleryInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => addPhotos(e.target)}
          />

          {photos.length < MAX_PHOTOS ? (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Take Photo', icon: Camera, ref: cameraInput },
                { label: 'Upload', icon: ImagePlus, ref: galleryInput },
              ].map(({ label, icon: Icon, ref }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => ref.current?.click()}
                  className="flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line/10 text-sm font-semibold text-slate-300 transition hover:border-sun-400/40 hover:text-accent active:scale-[0.97]"
                >
                  <Icon className="size-5" />
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-slate-800/40 px-4 py-3 text-center text-xs text-slate-400">
              Photo limit reached. Remove one to add another.
            </p>
          )}

          <div className={`grid grid-cols-3 gap-2 ${photos.length ? 'mt-3' : ''}`}>
            {photos.map((p) => (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-2xl ring-1 ring-line/10">
                <img src={p.url} alt={p.name} className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  aria-label={`Remove ${p.name}`}
                  className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-black/70 text-white backdrop-blur active:scale-90"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </Field>
      </Card>

      <button
        type="submit"
        disabled={!canSubmit}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sun-400 text-base font-bold text-ink shadow-lg shadow-sun-500/20 transition hover:bg-sun-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
      >
        <NotebookPen className="size-5" />
        Save Entry
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Field logs
// ---------------------------------------------------------------------------

function FieldLogs({ entries, hoursByDate, onDelete, onOpenPhoto, onNavigate }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter(
      (e) =>
        (category === 'all' || e.category === category) &&
        (!q || entryText(e).toLowerCase().includes(q) || e.description.toLowerCase().includes(q)),
    )
  }, [entries, query, category])

  const groups = useMemo(() => {
    const map = new Map()
    for (const e of filtered) {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date).push(e)
    }
    return [...map.entries()]
  }, [filtered])

  const filterChips = [{ id: 'all', label: 'All' }, ...useCategories().list]

  return (
    <div className="space-y-4">
      <PageTitle
        title="Field Logs"
        subtitle={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} recorded`}
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks…"
          className={`${inputClass} pl-12`}
        />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {filterChips.map(({ id, label }) => {
          const active = category === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(id)}
              aria-pressed={active}
              className={`h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition active:scale-95 ${
                active
                  ? 'bg-sun-400 text-ink'
                  : 'bg-slate-800/70 text-slate-300 ring-1 ring-line/5'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {groups.length ? (
        <div className="space-y-6">
          {groups.map(([date, items]) => (
            <section key={date}>
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold text-slate-300">
                  {fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}
                </h3>
                {hoursByDate[date] > 0 && (
                  <span className="rounded-full bg-sun-400/10 px-2.5 py-1 text-xs font-semibold text-accent">
                    {fmtHours(hoursByDate[date])}
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {items.map((e) => (
                  <EntryCard key={e.id} entry={e} onOpenPhoto={onOpenPhoto} onDelete={onDelete} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : entries.length ? (
        <EmptyState
          icon={Search}
          title="No matches"
          text="Try a different keyword or category."
          action={
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setCategory('all')
              }}
              className="mt-4 h-11 rounded-xl bg-slate-800 px-5 text-sm font-semibold active:scale-95"
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="Your field logs are empty"
          text="Entries you save from New Log will show up here."
          action={
            <button
              type="button"
              onClick={() => onNavigate('log')}
              className="mt-4 h-11 rounded-xl bg-sun-400 px-5 text-sm font-bold text-ink active:scale-95"
            >
              Write first entry
            </button>
          }
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Export report
// ---------------------------------------------------------------------------

function buildWeeks(entries, shifts) {
  const dates = new Set([...entries.map((e) => e.date), ...shifts.map((s) => s.date)])
  if (!dates.size) return []

  const firstMonday = startOfWeek(fromDateKey([...dates].sort()[0]))
  const weeks = new Map()

  const weekFor = (date) => {
    const start = startOfWeek(fromDateKey(date))
    const key = toDateKey(start)
    if (!weeks.has(key)) {
      weeks.set(key, {
        key,
        number: Math.round((start - firstMonday) / (7 * DAY_MS)) + 1,
        start,
        end: addDays(start, 6),
        hours: 0,
        days: new Set(),
        entries: [],
      })
    }
    return weeks.get(key)
  }

  for (const s of shifts) {
    const w = weekFor(s.date)
    w.hours += s.hours
    w.days.add(s.date)
  }
  for (const e of entries) weekFor(e.date).entries.push(e)

  return [...weeks.values()]
    .sort((a, b) => a.start - b.start)
    .map((w) => ({
      ...w,
      entries: w.entries.sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1)),
    }))
}

function weekNarrative(week, categoryMap) {
  const counts = {}
  for (const e of week.entries) counts[e.category] = (counts[e.category] ?? 0) + 1
  const focus = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => categoryMap[id]?.label.toLowerCase())
    .filter(Boolean)

  const dayCount = week.days.size
  const parts = [
    `This week I rendered ${fmtHours(week.hours)} over ${dayCount} working ${dayCount === 1 ? 'day' : 'days'}.`,
  ]
  if (focus.length) parts.push(`My tasks focused mainly on ${joinList(focus)}.`)
  return parts.join(' ')
}

const ALL_EXPORT_FORMATS = [
  { id: 'pdf', label: 'PDF', icon: FileText, hint: 'Opens the print dialog. Choose “Save as PDF”.' },
  { id: 'docx', label: 'Word (DOCX)', icon: FileType, hint: 'Downloads an editable Word document.' },
]

const downloadBlob = saveFile

const fmtFileSize = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

// Lets students upload their school's own Word report format and fill it from their logs.
function SchoolTemplateCard({ template, onTemplateChange, onFill, hasData, onToast }) {
  const fileInput = useRef(null)
  const [busy, setBusy] = useState(null) // 'upload' | 'fill' | 'sample'
  const [error, setError] = useState('')
  const [guide, setGuide] = useState(null)

  // Run a task with a busy state; TemplateErrors become a readable message on the card.
  const run = async (kind, task, fallbackMessage) => {
    setError('')
    setBusy(kind)
    try {
      await task()
    } catch (err) {
      console.error(err)
      setError(err?.name === 'TemplateError' ? err.message : fallbackMessage)
    } finally {
      setBusy(null)
    }
  }

  const upload = (input) => {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    run(
      'upload',
      async () => {
        const { validateTemplate } = await import('./reportTemplate.js')
        await validateTemplate(file)
        onTemplateChange({ name: file.name, size: file.size, uploadedAt: Date.now(), blob: file })
        onToast('Template saved on this device.')
      },
      'Could not read that file. Make sure it is a Word (.docx) document.',
    )
  }

  const downloadSample = () =>
    run(
      'sample',
      async () => {
        const { buildSampleTemplate } = await import('./reportTemplate.js')
        await downloadBlob(await buildSampleTemplate(), 'ohjeyti-sample-template.docx')
      },
      'Could not create the sample template.',
    )

  const toggleGuide = async () => {
    if (guide) return setGuide(null)
    const { TEMPLATE_TAGS } = await import('./reportTemplate.js')
    setGuide(TEMPLATE_TAGS)
  }

  const secondaryButton =
    'flex h-12 items-center justify-center gap-2 rounded-2xl border border-line/10 bg-slate-800/40 px-3 text-sm font-semibold text-slate-200 transition hover:border-line/20 active:scale-[0.97] disabled:opacity-50'

  return (
    <Card className="space-y-4 print:hidden">
      <input
        ref={fileInput}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => upload(e.target)}
      />

      <div>
        <SectionTitle>School template</SectionTitle>
        <p className="-mt-1 text-sm leading-relaxed text-slate-400">
          Have a required report format? Upload it as a Word file with placeholders like{' '}
          <code className="rounded bg-slate-800 px-1 text-accent">{'{name}'}</code> and the app fills it in from
          your logs, even offline.
        </p>
      </div>

      {template ? (
        <>
          <div className="flex items-center gap-3 rounded-2xl bg-slate-800/50 p-3 ring-1 ring-line/5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sun-400/15 text-accent">
              <FileCheck2 className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{template.name}</span>
              <span className="block text-xs text-slate-400">
                {fmtFileSize(template.size)} · saved{' '}
                {new Date(template.uploadedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </span>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy !== null}
              className="h-9 shrink-0 rounded-xl px-3 text-xs font-semibold text-slate-300 hover:bg-slate-800"
            >
              Replace
            </button>
            <ConfirmDelete onConfirm={() => onTemplateChange(null)} label="Remove template" />
          </div>

          <button
            type="button"
            onClick={() => run('fill', () => onFill(template.blob), 'Could not fill the template. Please try again.')}
            disabled={!hasData || busy !== null}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sun-400 text-base font-bold text-ink shadow-lg shadow-sun-500/20 transition hover:bg-sun-300 active:scale-[0.98] disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
          >
            {busy === 'fill' ? <LoaderCircle className="size-5 animate-spin" /> : <Download className="size-5" />}
            {busy === 'fill' ? 'Filling in…' : 'Fill template & download'}
          </button>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
            className={secondaryButton}
          >
            {busy === 'upload' ? <LoaderCircle className="size-4 animate-spin" /> : <FileUp className="size-4" />}
            Upload .docx
          </button>
          <button type="button" onClick={downloadSample} disabled={busy !== null} className={secondaryButton}>
            {busy === 'sample' ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
            Sample template
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-red-400/20">
          {error}
        </p>
      )}

      <div className="border-t border-line/5 pt-3">
        <button
          type="button"
          onClick={toggleGuide}
          aria-expanded={Boolean(guide)}
          className="flex w-full items-center justify-between text-sm font-semibold text-slate-300"
        >
          Placeholder guide
          <ChevronDown className={`size-4 transition ${guide ? 'rotate-180' : ''}`} />
        </button>
        {guide && (
          <div className="mt-3 space-y-4">
            {guide.map(({ group, tags }) => (
              <div key={group}>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{group}</h4>
                <dl className="space-y-1.5">
                  {tags.map(([tag, meaning]) => (
                    <div key={tag} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3 text-xs">
                      <dt className="break-words font-mono text-accent">{tag}</dt>
                      <dd className="text-slate-400">{meaning}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            {template && (
              <button type="button" onClick={downloadSample} className={`${secondaryButton} w-full`}>
                <Download className="size-4" />
                Download sample template
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

const EXPORT_FORMATS = isNativeApp
  ? ALL_EXPORT_FORMATS.filter((f) => f.id !== 'pdf')
  : ALL_EXPORT_FORMATS

function ExportReport({
  entries,
  shifts,
  stats,
  today,
  profile,
  onProfileChange,
  template,
  onTemplateChange,
  onToast,
}) {
  const categoryMap = useCategories().map
  const [format, setFormat] = useState(EXPORT_FORMATS[0].id)
  const [exporting, setExporting] = useState(false)
  const weeks = useMemo(() => buildWeeks(entries, shifts), [entries, shifts])
  const update = (key) => (e) => onProfileChange((p) => ({ ...p, [key]: e.target.value }))
  const updateName = (key) => (e) =>
    onProfileChange((p) => {
      const value = key === 'middleInitial' ? e.target.value.replace(/[^\p{L}]/gu, '').toUpperCase() : e.target.value
      const next = { ...p, [key]: value }
      return { ...next, name: composeName(next) }
    })

  const allDates = weeks.length ? [weeks[0].start, weeks.at(-1).end] : null
  const fmtLong = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

  const profileFields = [
    { key: 'name', label: 'Trainee name', icon: User, placeholder: 'Juan Dela Cruz' },
    { key: 'course', label: 'Course / program', icon: GraduationCap, placeholder: 'BS Information Technology' },
    { key: 'company', label: 'Host company', icon: Building2, placeholder: 'Acme Tech Solutions' },
    { key: 'supervisor', label: 'Supervisor', icon: Users, placeholder: 'Engr. Maria Santos' },
  ]

  const exportDocx = async () => {
    setExporting(true)
    try {
      // Loaded on demand so the Word library stays out of the main bundle.
      const { buildReportDocx } = await import('./reportDocx.js')
      const shortDate = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      const blob = await buildReportDocx({
        profile: profileFields.map(({ key, label }) => [label, profile[key]]),
        summary: [
          ['Hours', `${stats.totalHours.toFixed(1)} / ${GOAL_HOURS}`],
          ['Days', String(stats.daysWorked)],
          ['Complete', `${stats.percent.toFixed(1)}%`],
        ],
        period: allDates ? `Covering ${fmtLong(allDates[0])} – ${fmtLong(allDates[1])}` : null,
        weeks: weeks.map((w) => ({
          title: `Week ${w.number}`,
          range: `${shortDate(w.start)} – ${shortDate(w.end)}`,
          hours: fmtHours(w.hours),
          narrative: weekNarrative(w, categoryMap),
          entries: w.entries.map((e) => ({
            day: fmtDate(e.date, { weekday: 'short', day: 'numeric' }),
            category: categoryMap[e.category]?.label ?? '',
            color: categoryMap[e.category]?.docx ?? '334155',
            description: entryText(e),
            photos: e.photos.length,
          })),
        })),
        signatures: [
          [profile.name, 'Trainee'],
          [profile.supervisor, 'Supervisor'],
        ],
      })
      const who = (profile.name.trim() || 'Trainee').replace(/[^\w-]+/g, '-')
      await downloadBlob(blob, `OJT-Report-${who}-${today}.docx`)
      onToast('Word report downloaded.')
    } catch (err) {
      console.error(err)
      onToast('Could not create the Word file. Please try again.', 'info')
    } finally {
      setExporting(false)
    }
  }

  // Everything a school template can use. Tag names are documented in TEMPLATE_TAGS.
  const buildTemplateData = () => {
    const longDate = (key) => fmtDate(key, { month: 'long', day: 'numeric', year: 'numeric' })
    const shortDate = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    const entryRow = (e) => ({
      date: fmtDate(e.date, { month: 'short', day: 'numeric', year: 'numeric' }),
      weekday: fmtDate(e.date, { weekday: 'long' }),
      category: categoryMap[e.category]?.label ?? '',
      text: entryText(e),
      notes: e.description,
    })
    const oldestFirst = [...entries].sort((a, b) =>
      a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1,
    )
    const dates = [...new Set([...shifts.map((s) => s.date), ...entries.map((e) => e.date)])].sort()

    return {
      name: profile.name,
      firstName: profile.firstName,
      middleInitial: profile.middleInitial ? `${profile.middleInitial}.` : '',
      lastName: profile.lastName,
      course: profile.course,
      company: profile.company,
      supervisor: profile.supervisor,
      totalHours: stats.totalHours.toFixed(1),
      goalHours: GOAL_HOURS,
      percent: stats.percent.toFixed(1),
      daysWorked: stats.daysWorked,
      periodStart: dates.length ? longDate(dates[0]) : '',
      periodEnd: dates.length ? longDate(dates.at(-1)) : '',
      generatedDate: longDate(today),
      weeks: weeks.map((w) => ({
        weekNumber: w.number,
        weekStart: shortDate(w.start),
        weekEnd: shortDate(w.end),
        weekHours: fmtHours(w.hours),
        weekNarrative: weekNarrative(w, categoryMap),
        entries: w.entries.map(entryRow),
      })),
      entries: oldestFirst.map(entryRow),
      days: dates.map((date) => {
        const dayShifts = shifts.filter((s) => s.date === date)
        const timed = dayShifts.filter((s) => s.start)
        const hours = sum(dayShifts, (s) => s.hours)
        return {
          date: longDate(date),
          weekday: fmtDate(date, { weekday: 'long' }),
          timeIn: timed.length ? fmtTime(Math.min(...timed.map((s) => s.start))) : '',
          timeOut: timed.length ? fmtTime(Math.max(...timed.map((s) => s.end))) : '',
          hours: hours ? fmtHours(hours) : '',
          tasks: oldestFirst.filter((e) => e.date === date).map(entryRow),
        }
      }),
    }
  }

  const fillSchoolTemplate = async (templateBlob) => {
    const { fillTemplate } = await import('./reportTemplate.js')
    const blob = await fillTemplate(templateBlob, buildTemplateData())
    const who = (profile.name.trim() || 'Trainee').replace(/[^\w-]+/g, '-')
    await downloadBlob(blob, `OJT-Report-${who}-${today}.docx`)
    onToast('Your school template was filled in and downloaded.')
  }

  const handleExport = () => (format === 'docx' ? exportDocx() : window.print())
  const activeFormat = EXPORT_FORMATS.find((f) => f.id === format)

  return (
    <div className="space-y-4">
      <PageTitle title="Export Report" subtitle="A weekly narrative report generated from your logs." />

      <Card className="space-y-3 print:hidden">
        <SectionTitle>Report details</SectionTitle>
        <div className="grid grid-cols-[1fr_4.5rem] gap-2">
          <input
            aria-label="First name"
            value={profile.firstName}
            maxLength={MAX_NAME}
            autoComplete="given-name"
            onChange={updateName('firstName')}
            placeholder="First name"
            className={inputClass}
          />
          <input
            aria-label="Middle initial"
            value={profile.middleInitial}
            maxLength={2}
            onChange={updateName('middleInitial')}
            placeholder="M.I."
            className={`${inputClass} px-2 text-center`}
          />
        </div>
        <input
          aria-label="Last name"
          value={profile.lastName}
          maxLength={MAX_NAME}
          autoComplete="family-name"
          onChange={updateName('lastName')}
          placeholder="Last name"
          className={inputClass}
        />
        {profileFields
          .filter(({ key }) => key !== 'name')
          .map(({ key, label, icon: Icon, placeholder }) => (
            <div key={key} className="relative">
              <Icon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
              <input
                aria-label={label}
                value={profile[key]}
                onChange={update(key)}
                placeholder={`${label} (e.g. ${placeholder})`}
                className={`${inputClass} pl-12`}
              />
            </div>
          ))}
      </Card>

      <SchoolTemplateCard
        template={template}
        onTemplateChange={onTemplateChange}
        onFill={fillSchoolTemplate}
        hasData={weeks.length > 0}
        onToast={onToast}
      />

      <div className="flex items-center justify-between px-1 print:hidden">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Preview</h3>
        <span className="text-xs text-slate-500">
          {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} · {entries.length} entries
        </span>
      </div>

      {/* Paper preview — this is also what gets printed / saved as PDF */}
      <article className="paper overflow-hidden rounded-2xl bg-white text-slate-800 shadow-(--shadow-paper) ring-1 ring-line/10 print:rounded-none print:shadow-none print:ring-0">
        <header className="border-b-4 border-sun-400 px-5 pb-4 pt-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sun-700">
            On-the-Job Training
          </p>
          <h3 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900">
            Narrative Report
          </h3>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {profileFields.map(({ key, label }) => (
              <div key={key} className="min-w-0">
                <dt className="text-slate-500">{label}</dt>
                <dd className="truncate font-semibold text-slate-900">{profile[key] || '—'}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 bg-slate-50 text-center">
          {[
            ['Hours', `${stats.totalHours.toFixed(1)} / ${GOAL_HOURS}`],
            ['Days', stats.daysWorked],
            ['Complete', `${stats.percent.toFixed(1)}%`],
          ].map(([label, value]) => (
            <div key={label} className="px-2 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        {allDates && (
          <p className="px-5 pt-4 text-xs text-slate-500">
            Covering {fmtLong(allDates[0])} – {fmtLong(allDates[1])}
          </p>
        )}

        <div className="space-y-6 px-5 py-5">
          {weeks.length ? (
            weeks.map((w) => (
              <section key={w.key} className="break-inside-avoid">
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-1.5">
                  <h4 className="text-sm font-bold text-slate-900">
                    Week {w.number}
                    <span className="ml-2 font-medium text-slate-500">
                      {w.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} –{' '}
                      {w.end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </h4>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-sun-700">
                    {fmtHours(w.hours)}
                  </span>
                </div>
                <p className="mt-2 text-xs italic leading-relaxed text-slate-600">{weekNarrative(w, categoryMap)}</p>
                {w.entries.length > 0 && (
                  <ul className="mt-3 space-y-2.5">
                    {w.entries.map((e) => (
                      <li key={e.id} className="grid grid-cols-[3.25rem_1fr] gap-2 text-xs leading-relaxed">
                        <span className="font-semibold text-slate-500">
                          {fmtDate(e.date, { weekday: 'short', day: 'numeric' })}
                        </span>
                        <div>
                          <span className={`font-bold ${categoryMap[e.category]?.print ?? ''}`}>
                            {categoryMap[e.category]?.label}
                          </span>
                          <span className="text-slate-400"> · </span>
                          <span className="text-slate-700">{entryText(e)}</span>
                          {e.photos.length > 0 && (
                            <span className="ml-1 text-slate-400">
                              ({e.photos.length} photo{e.photos.length > 1 ? 's' : ''})
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              Log some hours and entries to generate your report.
            </p>
          )}
        </div>

        <footer className="grid grid-cols-2 gap-6 px-5 pb-8 pt-6 text-center text-[11px] text-slate-500">
          {[
            [profile.name, 'Trainee'],
            [profile.supervisor, 'Supervisor'],
          ].map(([name, role]) => (
            <div key={role}>
              <div className="h-6 border-b border-slate-400 text-xs font-semibold text-slate-800">
                {name}
              </div>
              <p className="mt-1">{role} signature</p>
            </div>
          ))}
        </footer>
      </article>

      <div className="space-y-3 print:hidden">
        <div
          role="radiogroup"
          aria-label="Export format"
          className="grid grid-cols-2 gap-1 rounded-2xl bg-card p-1 ring-1 ring-edge"
        >
          {EXPORT_FORMATS.map(({ id, label, icon: Icon }) => {
            const active = format === id
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFormat(id)}
                className={`flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition active:scale-[0.97] ${
                  active ? 'bg-slate-700 text-accent shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="size-4" />
                {label}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={!weeks.length || exporting}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sun-400 text-base font-bold text-ink shadow-lg shadow-sun-500/20 transition hover:bg-sun-300 active:scale-[0.98] disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
        >
          {exporting ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <Download className="size-5" />
          )}
          {exporting ? 'Preparing…' : `Download ${format.toUpperCase()}`}
        </button>
        <p className="text-center text-xs text-slate-500">{activeFormat.hint}</p>
      </div>
    </div>
  )
}
