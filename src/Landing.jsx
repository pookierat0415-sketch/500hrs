import { useEffect, useState } from 'react'
import {
  Camera,
  Check,
  ChevronDown,
  Clock,
  Compass,
  Copy,
  Download,
  FileText,
  Globe,
  Monitor,
  Share,
  ShieldCheck,
  Smartphone,
  Sparkles,
  SquarePlus,
  Sun,
  Target,
  WifiOff,
} from 'lucide-react'

// The public landing page. main.jsx shows it in a normal browser tab; the
// installed app (home screen or APK) opens straight into the tracker instead.

// The newest GitHub Release asset named ohjeyti.apk.
const APK_URL = 'https://github.com/pookierat0415-sketch/500hrs/releases/latest/download/ohjeyti.apk'
const APK_VERSION = '1.0.0'
// Opens the tracker in this browser tab instead of the landing page.
const OPEN_IN_BROWSER = '/?app'
const YEAR = new Date().getFullYear()

const ua = navigator.userAgent
// iPadOS reports itself as a Mac, so also check for a touch screen.
const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
// Only Safari offers "Add to Home Screen" reliably on iOS.
const isIOSNotSafari = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line\/|Messenger/.test(ua)

const FEATURES = [
  {
    icon: WifiOff,
    title: 'Works fully offline',
    body: 'Clock in, log tasks, attach photos, and export reports with zero signal. Everything is saved on your phone the moment you tap save. No account, no sign-in.',
  },
  {
    icon: Sparkles,
    title: 'AI narrative polisher',
    body: 'Jot rough bullet notes like "set up vlans, fixed printer driver". When you’re back online, AI rewrites them into formal first-person paragraphs. Your original notes are always kept, and you can undo anytime.',
  },
  {
    icon: FileText,
    title: 'Your school’s Word template, filled in',
    body: (
      <>
        Upload your school’s required .docx format with placeholders like <Code>{'{name}'}</Code> and{' '}
        <Code>{'{#weeks}'}</Code>, and get it back completed with your weekly logs and daily time record. PDF and Word
        exports are built in too.
      </>
    ),
  },
  {
    icon: Target,
    title: 'The 500-hour sun tracker',
    body: 'A progress ring that fills as you render hours, plus your daily average, this week’s hours, and an estimated finish date based on your actual pace.',
  },
]

const EXTRAS = [
  { icon: Clock, title: 'Shift timer.', body: 'One tap to clock in and out. Forgot? Add hours manually.' },
  { icon: Camera, title: 'Photo evidence.', body: 'Take or upload up to 6 photos per log entry.' },
  { icon: ShieldCheck, title: 'Backed up, no password.', body: 'Optional account: just a username. Get your logs back on a new phone with your recovery code.' },
]

const FAQ = [
  {
    q: 'Where is my data stored?',
    a: 'On your phone first, so everything works offline. If you create an account (just a username and your name, no password), your logs and photos are also backed up online whenever you’re connected. Without an account, nothing leaves your phone unless you export it.',
  },
  {
    q: 'Does it need internet?',
    a: 'Only for the optional AI polisher. Everything else, including the timer, logs, photos, and Word exports, works with no connection. Notes waiting to be polished are processed automatically once you’re back online.',
  },
  {
    q: 'What happens to my notes when I use the AI polisher?',
    a: 'It’s off until you turn it on in Settings. When it’s on, the text of an entry is sent to Google Gemini to be rewritten. Photos and hours are never sent, and your original notes stay saved so you can switch back.',
  },
  {
    q: 'My school has its own report format. Will it work?',
    a: 'Yes, if it’s a Word document. Add placeholders like {name}, {totalHours}, or a {#weeks}…{/weeks} section where your logs should go, upload it in the Report tab, and download it filled in. The app includes a sample template and a full placeholder guide.',
  },
  {
    q: 'What if I delete the app or get a new phone?',
    a: 'If you created an account, install ohjeyti again, tap “I already have an account”, and enter your username and the recovery code you saved when you signed up. Your logs, hours, and photos come back. Keep the code private: anyone with your username and code can see your logs.',
  },
  {
    q: 'Can I use it on a laptop?',
    a: 'Yes. Open it in your browser, or install it from Chrome or Edge with the install icon in the address bar. Your data stays in that browser on that computer, separate from your phone.',
  },
]

function Code({ children }) {
  return <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm text-sun-300">{children}</code>
}

function Logo({ className = 'size-9', iconClass = 'size-5' }) {
  return (
    <span
      className={`grid place-items-center rounded-xl bg-gradient-to-br from-sun-300 to-sun-600 shadow-lg shadow-sun-500/20 ${className}`}
    >
      <Sun className={`${iconClass} text-slate-950`} strokeWidth={2.5} />
    </span>
  )
}

function Step({ n, children }) {
  return (
    <li className="flex gap-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sun-500 text-sm font-bold text-slate-950">
        {n}
      </span>
      <p className="pt-1 text-slate-300">{children}</p>
    </li>
  )
}

const primaryButton =
  'flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sun-500 px-7 text-base font-bold text-slate-950 shadow-lg shadow-sun-500/25 transition hover:bg-sun-400 active:scale-[0.98]'
const secondaryButton =
  'flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 px-7 text-base font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/5'

// --- Phone mockup (an illustration of the dashboard) --------------------------
function PhoneMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[19rem]" aria-hidden="true">
      <div className="absolute -inset-10 rounded-full bg-sun-500/20 blur-3xl" />
      <div className="relative rounded-[2.75rem] border border-white/10 bg-slate-900 p-2.5 shadow-2xl shadow-black/60 ring-1 ring-white/5">
        <div className="overflow-hidden rounded-[2.2rem] bg-slate-950">
          <div className="mx-auto mt-2.5 h-5 w-24 rounded-full bg-black" />
          <div className="flex items-center gap-2 px-4 pt-3">
            <Logo className="size-7 rounded-lg" iconClass="size-4" />
            <span className="text-sm font-bold">ohjeyti</span>
            <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-1 font-mono text-[10px] font-semibold text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              03:42:18
            </span>
          </div>

          <div className="mx-3 mt-4 flex items-center gap-4 rounded-2xl border border-white/5 bg-slate-900/80 p-4">
            <div className="relative size-24 shrink-0">
              <svg viewBox="0 0 100 100" className="size-24 -rotate-90">
                <defs>
                  <linearGradient id="landing-ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#fde68a" />
                    <stop offset="1" stopColor="#f5b30b" />
                  </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="42" fill="none" stroke="#1e293b" strokeWidth="10" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="url(#landing-ring)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray="263.9"
                  strokeDashoffset="73.9"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-extrabold text-sun-300">72%</span>
                <span className="text-[9px] text-slate-400">of 500h</span>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Rendered</p>
                <p className="text-lg font-bold">360h</p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Remaining</p>
                <p className="text-lg font-bold text-slate-300">140h</p>
              </div>
            </div>
          </div>

          <div className="mx-3 mt-3 rounded-2xl border border-white/5 bg-slate-900/60 p-3">
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[9px] font-semibold text-orange-300">
                Hardware
              </span>
              <span className="text-[9px] text-slate-500">Today</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-slate-200">
              I configured VLAN 10 and VLAN 20 on the core switch and documented the IP addressing scheme for the
              faculty wing.
            </p>
            <p className="mt-2 flex items-center gap-1 text-[9px] font-semibold text-sun-300">
              <Sparkles className="size-3" />
              Polished with AI
            </p>
          </div>

          <div className="mx-3 mb-4 mt-3 grid grid-cols-7 items-end gap-1.5 rounded-2xl border border-white/5 bg-slate-900/60 p-3">
            {['h-10', 'h-12', 'h-11', 'h-12'].map((h, i) => (
              <span key={i} className={`${h} rounded bg-sun-400/40`} />
            ))}
            <span className="h-8 rounded bg-sun-400" />
            <span className="h-1.5 rounded bg-slate-800" />
            <span className="h-1.5 rounded bg-slate-800" />
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Install section ----------------------------------------------------------

/** Chrome/Edge/Android's native install prompt, captured in main.jsx. */
function useInstallPrompt() {
  const [prompt, setPrompt] = useState(() => window.__installPrompt ?? null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault()
      window.__installPrompt = e
      setPrompt(e)
    }
    const onInstalled = () => {
      window.__installPrompt = null
      setPrompt(null)
      setInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    window.__installPrompt = null
    setPrompt(null)
    if (outcome === 'accepted') setInstalled(true)
  }

  return { canInstall: Boolean(prompt), installed, install }
}

function InstalledNotice() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-200 ring-1 ring-emerald-400/30">
      <Check className="size-5 shrink-0 text-emerald-400" />
      Installed! Open <strong className="font-semibold text-white">ohjeyti</strong> from your home screen or app list.
    </div>
  )
}

function AndroidPanel({ canInstall, installed, install }) {
  return (
    <div className="rounded-3xl border border-white/5 bg-slate-900/80 p-6 sm:p-8">
      <h3 className="text-xl font-bold">Install on Android</h3>
      <p className="mt-2 text-slate-400">It installs like a regular app and works offline from the first launch.</p>

      <div className="mt-6 space-y-3">
        {installed ? (
          <InstalledNotice />
        ) : canInstall ? (
          <>
            <button type="button" onClick={install} className={primaryButton}>
              <Download className="size-5" />
              Install ohjeyti
            </button>
            <a href={APK_URL} download className={secondaryButton}>
              <Smartphone className="size-5" />
              Download the APK instead
            </a>
          </>
        ) : (
          <a href={APK_URL} download className={primaryButton}>
            <Download className="size-5" />
            Download APK
          </a>
        )}
      </div>

      {!installed && (
        <>
          <ol className="mt-8 space-y-4">
            {canInstall ? (
              <>
                <Step n={1}>
                  Tap <strong className="text-white">Install ohjeyti</strong>, then <strong className="text-white">Install</strong>{' '}
                  in the pop-up.
                </Step>
                <Step n={2}>Open ohjeyti from your home screen. That’s it.</Step>
              </>
            ) : (
              <>
                <Step n={1}>
                  Tap <strong className="text-white">Download APK</strong> and open the file when it finishes.
                </Step>
                <Step n={2}>
                  If Android asks, allow your browser to <strong className="text-white">install unknown apps</strong>.
                  This is normal for apps outside the Play Store.
                </Step>
                <Step n={3}>
                  Tap <strong className="text-white">Install</strong>, then open ohjeyti from your home screen.
                </Step>
              </>
            )}
          </ol>
          {!canInstall && (
            <div className="mt-8 flex items-start gap-3 rounded-2xl bg-slate-800/60 p-4 text-sm text-slate-400">
              <Globe className="mt-0.5 size-5 shrink-0 text-sun-400" />
              <p>
                No APK? In Chrome, tap <strong className="text-slate-200">⋮ → Add to Home screen</strong> (or{' '}
                <strong className="text-slate-200">Install app</strong>) on this page.
              </p>
            </div>
          )}
          <p className="mt-4 text-center text-xs text-slate-500">APK version {APK_VERSION} · Android 8.0 or newer</p>
        </>
      )}
    </div>
  )
}

function IOSPanel() {
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    const url = window.location.origin + '/'
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // Older in-app browsers block the clipboard API.
      window.prompt('Copy this link, then paste it into Safari:', url)
    }
  }

  const steps = [
    { icon: Compass, title: 'Open this page in Safari', body: 'Not Chrome or Facebook’s browser. Only Safari can add apps to your Home Screen.' },
    { icon: Share, title: 'Tap the Share button', body: 'The square with an arrow pointing up, in Safari’s bottom bar (top bar on iPad).' },
    { icon: SquarePlus, title: 'Choose “Add to Home Screen”', body: 'Scroll down the share sheet if you don’t see it right away.' },
    { icon: Sun, title: 'Tap “Add”', body: 'ohjeyti appears on your Home Screen and opens full-screen like a regular app.', logo: true },
  ]

  return (
    <div className="rounded-3xl border border-white/5 bg-slate-900/80 p-6 sm:p-8">
      <h3 className="text-xl font-bold">Add ohjeyti to your iPhone</h3>
      <p className="mt-2 text-slate-400">No App Store needed, and it still works offline.</p>

      {isIOSNotSafari && (
        <div className="mt-6 rounded-2xl border border-sun-500/30 bg-sun-500/10 p-4 text-sm text-sun-100">
          <p className="font-semibold text-sun-200">Open this page in Safari first</p>
          <p className="mt-1 text-sun-100/80">Adding to the Home Screen only works from Safari. Copy the link and paste it into Safari.</p>
          <button
            type="button"
            onClick={copyLink}
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-sun-500 px-4 font-bold text-slate-950 active:scale-95"
          >
            <Copy className="size-4" />
            {copied ? 'Copied! Now paste it in Safari' : 'Copy link'}
          </button>
        </div>
      )}

      <ol className="mt-8 grid gap-4 sm:grid-cols-2">
        {steps.map(({ icon: Icon, title, body, logo }, i) => (
          <li key={title} className="rounded-2xl bg-slate-800/50 p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sun-500 text-sm font-bold text-slate-950">
                {i + 1}
              </span>
              {logo ? (
                <Logo className="size-10" />
              ) : (
                <span className="grid size-10 place-items-center rounded-xl bg-sky-500/15 text-sky-300">
                  <Icon className="size-5" />
                </span>
              )}
            </div>
            <p className="mt-4 font-semibold">{title}</p>
            <p className="mt-1 text-sm text-slate-400">{body}</p>
          </li>
        ))}
      </ol>

      <p className="mt-6 rounded-2xl bg-slate-800/60 p-4 text-sm text-slate-400">
        <strong className="text-slate-200">Install before you start logging.</strong> On iPhone, the Home Screen app and
        Safari keep separate data, so hours logged in a Safari tab won’t appear in the installed app.
      </p>
    </div>
  )
}

function InstallSection() {
  const [tab, setTab] = useState(isIOS ? 'ios' : 'android')
  const installState = useInstallPrompt()
  const tabs = [
    { id: 'android', label: 'Android' },
    { id: 'ios', label: 'iPhone' },
  ]

  const onKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const next = tab === 'android' ? 'ios' : 'android'
    setTab(next)
    document.getElementById(`tab-${next}`)?.focus()
  }

  return (
    <section id="install" className="py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Install in under a minute</h2>
          <p className="mt-4 text-lg text-slate-400">Pick your phone. We’ve pre-selected the one you’re using.</p>
        </div>

        <div
          role="tablist"
          aria-label="Choose your phone"
          className="mx-auto mt-10 grid max-w-sm grid-cols-2 gap-1 rounded-2xl bg-slate-900 p-1 ring-1 ring-white/5"
        >
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              id={`tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={onKeyDown}
              className="flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-slate-400 transition aria-selected:bg-slate-700 aria-selected:text-sun-300 aria-selected:shadow"
            >
              <Smartphone className="size-4" />
              {label}
            </button>
          ))}
        </div>

        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-8">
          {tab === 'android' ? <AndroidPanel {...installState} /> : <IOSPanel />}
        </div>

        <p className="mt-8 flex items-center justify-center gap-2 text-center text-sm text-slate-400">
          <Monitor className="size-4 shrink-0" />
          On a laptop?{' '}
          <a href={OPEN_IN_BROWSER} className="font-semibold text-sun-300 underline-offset-4 hover:underline">
            Use it in your browser
          </a>
        </p>
      </div>
    </section>
  )
}

// --- Page -------------------------------------------------------------------------

export default function Landing() {
  return (
    // overflow-x-clip: the glow behind the phone mockup must not cause sideways scrolling.
    <div className="min-h-svh overflow-x-clip bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[38rem] bg-[radial-gradient(ellipse_at_top,rgba(245,179,11,0.16),transparent_60%)]" />

      <header className="sticky top-0 z-30 border-b border-white/5 bg-slate-950/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5" aria-label="ohjeyti home">
            <Logo />
            <span className="text-lg font-bold tracking-tight">ohjeyti</span>
          </a>
          <div className="flex items-center gap-1 sm:gap-6">
            <a href="#features" className="hidden text-sm font-medium text-slate-300 hover:text-white sm:inline">Features</a>
            <a href="#install" className="hidden text-sm font-medium text-slate-300 hover:text-white sm:inline">Install</a>
            <a href="#faq" className="hidden text-sm font-medium text-slate-300 hover:text-white sm:inline">FAQ</a>
            <a
              href="#install"
              className="rounded-full bg-sun-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-sun-400 active:scale-95"
            >
              Get the app
            </a>
          </div>
        </nav>
      </header>

      <main id="top" className="relative">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
          <div className="text-center lg:text-left">
            <p className="inline-flex items-center gap-2 rounded-full border border-sun-500/30 bg-sun-500/10 px-3 py-1 text-xs font-semibold text-sun-300">
              <Sparkles className="size-3.5" />
              For IT &amp; engineering interns
            </p>
            <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              Master your OJT.
              <br />
              <span className="bg-gradient-to-r from-sun-200 via-sun-400 to-sun-600 bg-clip-text text-transparent">
                Track every hour.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-300 lg:mx-0">
              Clock in at the server room, log what you configured, snap a photo of the rack you cabled, and turn it all
              into the narrative report your school asks for. Even with no signal.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <a href="#install" className={`${primaryButton} sm:w-auto`}>
                <Download className="size-5" />
                Install ohjeyti
              </a>
              <a href="#features" className={`${secondaryButton} sm:w-auto`}>
                See what it does
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-400 lg:justify-start">
              {['Android & iPhone', 'No password needed', 'Online backup, optional'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="size-4 text-sun-400" strokeWidth={2.5} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <PhoneMockup />
        </section>

        {/* Features */}
        <section id="features" className="border-t border-white/5 bg-slate-900/40 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Built for the way OJT actually goes</h2>
              <p className="mt-4 text-lg text-slate-400">
                Basements with no signal, supervisors who want weekly reports, and a school format you can’t change.
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <article key={title} className="rounded-3xl border border-white/5 bg-slate-900/80 p-6 sm:p-7">
                  <span className="grid size-12 place-items-center rounded-2xl bg-sun-500/15 text-sun-300">
                    <Icon className="size-6" />
                  </span>
                  <h3 className="mt-5 text-xl font-bold">{title}</h3>
                  <p className="mt-2 leading-relaxed text-slate-400">{body}</p>
                </article>
              ))}
            </div>
            <ul className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
              {EXTRAS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3 rounded-2xl border border-white/5 p-5">
                  <Icon className="mt-0.5 size-5 shrink-0 text-sun-400" />
                  <span>
                    <strong className="font-semibold text-slate-200">{title}</strong>{' '}
                    <span className="text-slate-400">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <InstallSection />

        {/* FAQ */}
        <section id="faq" className="border-t border-white/5 bg-slate-900/40 py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">Questions</h2>
            <div className="mt-10 space-y-3">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group rounded-2xl border border-white/5 bg-slate-900/80 p-5 open:bg-slate-900">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                    {q}
                    <ChevronDown className="size-5 shrink-0 text-slate-400 transition group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 leading-relaxed text-slate-400">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <Logo className="mx-auto size-16 rounded-2xl shadow-xl shadow-sun-500/30" iconClass="size-8" />
            <h2 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">Your 500 hours start with one tap.</h2>
            <a href="#install" className={`${primaryButton} mx-auto mt-8 inline-flex w-auto px-8`}>
              <Download className="size-5" />
              Install ohjeyti
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-8 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-slate-500 sm:flex-row sm:px-6">
          <p className="flex items-center gap-2">
            <Sun className="size-4 text-sun-400" />
            ohjeyti · © {YEAR}
          </p>
          <p>Made for IT &amp; engineering interns.</p>
        </div>
      </footer>
    </div>
  )
}
