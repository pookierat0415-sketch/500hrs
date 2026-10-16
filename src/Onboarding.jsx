import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Camera,
  ChevronLeft,
  CloudOff,
  Cpu,
  FileText,
  FileType,
  FileUp,
  ImagePlus,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  Tag,
  Users,
  Code,
} from 'lucide-react'
import { cleanInitial, cleanName, composeName, MAX_NAME } from './name.js'

// First-run flow: ask for the trainee's name, then walk through every feature.
// Shown once (App stores an `onboarded` flag) and replayable from Settings.

const field =
  'w-full rounded-2xl border border-line/10 bg-slate-800/60 px-4 py-3.5 text-base text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-sun-400/60 focus:ring-4 focus:ring-sun-400/10'

// ---------------------------------------------------------------------------
// Step 1: name
// ---------------------------------------------------------------------------

function NameStep({ initial, onSubmit }) {
  const [firstName, setFirstName] = useState(initial.firstName ?? '')
  const [middleInitial, setMiddleInitial] = useState(initial.middleInitial ?? '')
  const [lastName, setLastName] = useState(initial.lastName ?? '')
  const [touched, setTouched] = useState(false)
  const firstInput = useRef(null)

  useEffect(() => {
    firstInput.current?.focus()
  }, [])

  const missingFirst = !cleanName(firstName)
  const missingLast = !cleanName(lastName)
  const preview = composeName({ firstName, middleInitial, lastName })

  const handleSubmit = (e) => {
    e.preventDefault()
    setTouched(true)
    if (missingFirst || missingLast) return
    onSubmit({
      firstName: cleanName(firstName),
      middleInitial: cleanInitial(middleInitial),
      lastName: cleanName(lastName),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col" noValidate>
      <div className="flex-1">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-sun-300 to-sun-600 shadow-xl shadow-sun-500/30">
          <Sun className="size-8 text-ink" strokeWidth={2.5} />
        </div>
        <h1 id="onboarding-title" className="mt-6 text-center text-3xl font-extrabold tracking-tight">
          Welcome to 500 Hours
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-center text-slate-400">
          Let&apos;s set you up. What&apos;s your full name? It goes on your reports exactly as you type it.
        </p>

        <div className="mt-8 space-y-3">
          <div>
            <label htmlFor="ob-first" className="mb-1.5 block text-sm font-semibold text-slate-200">
              First name
            </label>
            <input
              id="ob-first"
              ref={firstInput}
              value={firstName}
              maxLength={MAX_NAME}
              autoComplete="given-name"
              autoCapitalize="words"
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="e.g. Juan"
              aria-invalid={touched && missingFirst}
              className={`${field} ${touched && missingFirst ? 'border-red-400/60' : ''}`}
            />
          </div>

          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <div>
              <label htmlFor="ob-mi" className="mb-1.5 block text-sm font-semibold text-slate-200">
                M.I.
              </label>
              <input
                id="ob-mi"
                value={middleInitial}
                maxLength={3}
                autoComplete="additional-name"
                autoCapitalize="characters"
                onChange={(e) => setMiddleInitial(cleanInitial(e.target.value))}
                placeholder="D"
                className={`${field} text-center`}
              />
            </div>
            <div>
              <label htmlFor="ob-last" className="mb-1.5 block text-sm font-semibold text-slate-200">
                Last name
              </label>
              <input
                id="ob-last"
                value={lastName}
                maxLength={MAX_NAME}
                autoComplete="family-name"
                autoCapitalize="words"
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Dela Cruz"
                aria-invalid={touched && missingLast}
                className={`${field} ${touched && missingLast ? 'border-red-400/60' : ''}`}
              />
            </div>
          </div>

          {touched && (missingFirst || missingLast) ? (
            <p role="alert" className="text-sm text-red-300">
              Please enter your {missingFirst && missingLast ? 'first and last name' : missingFirst ? 'first name' : 'last name'}.
              M.I. is optional.
            </p>
          ) : (
            <p className="text-xs text-slate-500">M.I. is optional. You can change your name later in the Report tab.</p>
          )}
        </div>

        {preview && (
          <div className="mt-6 rounded-2xl bg-slate-800/50 p-4 ring-1 ring-line/5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">On your report</p>
            <p className="mt-1 text-lg font-bold">{preview}</p>
          </div>
        )}
      </div>

      <button
        type="submit"
        className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sun-400 text-base font-bold text-ink shadow-lg shadow-sun-500/20 transition hover:bg-sun-300 active:scale-[0.98]"
      >
        Continue
        <ArrowRight className="size-5" />
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Walkthrough slides
// ---------------------------------------------------------------------------

// Small, non-interactive previews of each feature.
const Mock = ({ children, className = '' }) => (
  <div
    aria-hidden="true"
    className={`mx-auto w-full max-w-xs rounded-3xl border border-edge bg-card p-4 shadow-(--shadow-card) ${className}`}
  >
    {children}
  </div>
)

function RingPreview() {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <Mock className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg width="124" height="124" className="-rotate-90">
          <circle cx="62" cy="62" r={r} fill="none" strokeWidth="12" className="stroke-slate-800" />
          <circle
            cx="62"
            cy="62"
            r={r}
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * 0.28}
            className="stroke-sun-400"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-accent">72%</span>
          <span className="text-[10px] text-slate-400">of 500h</span>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <p>
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Rendered</span>
          <span className="text-lg font-bold">360h</span>
        </p>
        <p>
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Est. finish</span>
          <span className="text-lg font-bold">Dec 21</span>
        </p>
      </div>
    </Mock>
  )
}

function TimerPreview() {
  return (
    <Mock className="text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">On shift</p>
      <p className="mt-1 font-mono text-4xl font-bold tabular-nums">03:42:18</p>
      <p className="mt-1 text-xs text-slate-400">since 8:00 AM</p>
      <div className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-red-500 font-bold text-white">
        <Square className="size-4 fill-current" />
        Clock Out
      </div>
    </Mock>
  )
}

function LogPreview() {
  const cats = [
    { label: 'Development', icon: Code, active: false },
    { label: 'Hardware', icon: Cpu, active: true },
    { label: 'Meeting', icon: Users, active: false },
    { label: 'Custom', icon: Tag, active: false, dashed: true },
  ]
  return (
    <Mock className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {cats.map(({ label, icon: Icon, active, dashed }) => (
          <div
            key={label}
            className={`flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold ${
              active
                ? 'border border-sun-400/60 bg-sun-400/10 text-accent'
                : dashed
                  ? 'border-2 border-dashed border-line/10 text-slate-400'
                  : 'border border-line/10 text-slate-300'
            }`}
          >
            <Icon className="size-4" />
            {label}
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-slate-800/60 px-3 py-2.5 text-xs leading-relaxed text-slate-300">
        Crimped and tested CAT6 cables for the 2nd floor network drops.
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-300">
        <div className="flex h-10 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line/10">
          <Camera className="size-4" /> Take Photo
        </div>
        <div className="flex h-10 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line/10">
          <ImagePlus className="size-4" /> Upload
        </div>
      </div>
    </Mock>
  )
}

function FieldLogsPreview() {
  return (
    <Mock className="space-y-3">
      <div className="flex h-10 items-center gap-2 rounded-xl bg-slate-800/60 px-3 text-xs text-slate-500">
        <Search className="size-4" /> Search tasks…
      </div>
      <div className="flex gap-1.5 text-[11px] font-semibold">
        <span className="rounded-full bg-sun-400 px-3 py-1.5 text-ink">All</span>
        <span className="rounded-full bg-slate-800 px-3 py-1.5 text-slate-300">Hardware</span>
        <span className="rounded-full bg-slate-800 px-3 py-1.5 text-slate-300">Meeting</span>
      </div>
      {['Configured VLANs on the core switch.', 'Reimaged six workstations.'].map((t, i) => (
        <div key={t} className="rounded-xl border border-edge bg-raised p-3">
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>Oct {16 - i}</span>
            <span className="rounded-full bg-sun-400/10 px-2 py-0.5 font-semibold text-accent">8h</span>
          </div>
          <p className="mt-1 text-xs text-slate-200">{t}</p>
        </div>
      ))}
    </Mock>
  )
}

function AiPreview() {
  return (
    <Mock className="space-y-2">
      <div className="rounded-xl bg-slate-800/60 p-3 font-mono text-xs leading-relaxed text-slate-400">
        - set up vlans on core switch
        <br />- documented ip scheme
      </div>
      <div className="flex justify-center text-accent">
        <Sparkles className="size-5" />
      </div>
      <div className="rounded-xl border border-sun-400/30 bg-sun-400/10 p-3 text-xs leading-relaxed text-slate-200">
        I configured VLANs on the core switch and documented the IP addressing scheme for the network.
      </div>
    </Mock>
  )
}

function ReportPreview() {
  const items = [
    { icon: FileText, label: 'PDF' },
    { icon: FileType, label: 'Word' },
    { icon: FileUp, label: 'School template' },
  ]
  return (
    <Mock>
      <div className="rounded-xl bg-white p-3 text-slate-800">
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-sun-700">On-the-job training</p>
        <p className="text-sm font-extrabold text-slate-900">Narrative Report</p>
        <div className="mt-2 space-y-1">
          <div className="h-1.5 w-full rounded bg-slate-200" />
          <div className="h-1.5 w-5/6 rounded bg-slate-200" />
          <div className="h-1.5 w-2/3 rounded bg-slate-200" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {items.map(({ icon: Icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-1 rounded-xl bg-slate-800/60 p-2 text-center text-[10px] font-semibold text-slate-300">
            <Icon className="size-4 text-accent" />
            {label}
          </div>
        ))}
      </div>
    </Mock>
  )
}

function OfflinePreview() {
  return (
    <Mock className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold text-slate-300">
      {[
        { icon: CloudOff, label: 'No signal needed' },
        { icon: ShieldCheck, label: 'Stays on your phone' },
        { icon: SettingsIcon, label: 'Theme & help' },
      ].map(({ icon: Icon, label }) => (
        <div key={label} className="flex flex-col items-center gap-2 rounded-xl bg-slate-800/60 p-3">
          <span className="grid size-10 place-items-center rounded-xl bg-sun-400/15 text-accent">
            <Icon className="size-5" />
          </span>
          {label}
        </div>
      ))}
    </Mock>
  )
}

function buildSlides({ firstName, aiAvailable }) {
  return [
    {
      id: 'tracker',
      visual: <RingPreview />,
      title: firstName ? `Nice to meet you, ${firstName}!` : 'Your road to 500 hours',
      body: 'The Home screen tracks your progress toward 500 hours with the sun ring.',
      tips: [
        'See hours rendered, hours remaining, and your daily average.',
        'Est. finish predicts your last day based on your actual pace.',
        'The weekly chart shows how many hours you put in each day.',
      ],
    },
    {
      id: 'timer',
      visual: <TimerPreview />,
      title: 'Clock in, clock out',
      body: 'Tap Clock In when you arrive and Clock Out when you leave. Your hours add up automatically.',
      tips: [
        'The timer keeps running even if you close the app.',
        'A green clock in the header shows you’re on shift. Tap it to jump to the Timer.',
        'Forgot to clock in? Add the hours manually when you write your log.',
      ],
    },
    {
      id: 'log',
      visual: <LogPreview />,
      title: 'Write your daily log',
      body: 'Tap the yellow button in the middle of the bottom bar to record what you worked on.',
      tips: [
        'Pick a category, or tap + Custom to make your own.',
        'Take a photo or upload one as evidence, up to 6 per entry.',
        'Pick an earlier date to catch up on days you missed.',
      ],
    },
    {
      id: 'logs',
      visual: <FieldLogsPreview />,
      title: 'All your entries in Field Logs',
      body: 'Every entry is grouped by day with the hours you rendered.',
      tips: [
        'Search by keyword or filter by category.',
        'Tap a photo to view it full screen.',
        'Delete an entry with the trash icon. Tap twice to confirm.',
      ],
    },
    aiAvailable && {
      id: 'ai',
      visual: <AiPreview />,
      title: 'Let AI polish your notes',
      body: 'Write rough bullet points. AI rewrites them into formal report paragraphs when you’re online.',
      tips: [
        'Turn it on in Settings → AI writing assistant.',
        'Offline? Your notes are saved and polished later, automatically.',
        'Your original notes are always kept. Tap Undo to switch back.',
      ],
    },
    {
      id: 'report',
      visual: <ReportPreview />,
      title: 'Export your narrative report',
      body: 'The Report tab turns your logs into a week-by-week narrative report.',
      tips: [
        'Download it as a PDF or an editable Word file.',
        'Upload your school’s own Word template and get it back filled in.',
        'Your name and company go in Report details.',
      ],
    },
    {
      id: 'offline',
      visual: <OfflinePreview />,
      title: 'Works offline, stays private',
      body: 'Everything is saved on this phone the moment you tap save. No account, no signal needed.',
      tips: [
        'Tap the ⚙ gear for light or dark mode and to report a problem.',
        'Export your report regularly so you always have a copy.',
        'You can replay this walkthrough anytime from Settings.',
      ],
    },
  ].filter(Boolean)
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

/**
 * @param {object} props
 * @param {{firstName?: string, middleInitial?: string, lastName?: string}} props.initialName
 * @param {boolean} props.askName      show the name step first
 * @param {boolean} props.aiAvailable  include the AI slide
 * @param {(name: object) => void} props.onSaveName
 * @param {() => void} props.onFinish
 */
export default function Onboarding({ initialName, askName, aiAvailable, onSaveName, onFinish }) {
  const [stage, setStage] = useState(askName ? 'name' : 'tour')
  const [firstName, setFirstName] = useState(initialName.firstName ?? '')
  const [index, setIndex] = useState(0)
  const touchStart = useRef(null)
  const slides = buildSlides({ firstName, aiAvailable })
  const slide = slides[index]
  const last = index === slides.length - 1

  const next = () => (last ? onFinish() : setIndex((i) => i + 1))
  const back = () => setIndex((i) => Math.max(0, i - 1))

  // Keep the page behind from scrolling, and support arrow keys on the tour.
  useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])

  useEffect(() => {
    if (stage !== 'tour') return
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(slides.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage, slides.length])

  const onTouchEnd = (e) => {
    if (touchStart.current === null) return
    const dx = e.changedTouches[0].clientX - touchStart.current
    touchStart.current = null
    if (dx < -50) next()
    else if (dx > 50) back()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950 bg-[radial-gradient(ellipse_at_top,rgba(245,179,11,0.12),transparent_60%)] text-slate-100"
    >
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+2rem)]">
        {stage === 'name' ? (
          <NameStep
            initial={initialName}
            onSubmit={(name) => {
              onSaveName(name)
              setFirstName(name.firstName)
              setStage('tour')
            }}
          />
        ) : (
          <div
            className="flex flex-1 flex-col"
            onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
            onTouchEnd={onTouchEnd}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                {index + 1} of {slides.length}
              </span>
              {!last && (
                <button
                  type="button"
                  onClick={onFinish}
                  className="h-9 rounded-xl px-3 text-sm font-semibold text-slate-400 hover:text-slate-200"
                >
                  Skip
                </button>
              )}
            </div>

            <div key={slide.id} className="flex flex-1 animate-[fadeUp_.3s_ease-out] flex-col justify-center py-6">
              {slide.visual}
              <h1 id="onboarding-title" className="mt-8 text-center text-2xl font-extrabold tracking-tight">
                {slide.title}
              </h1>
              <p className="mt-2 text-center text-slate-300">{slide.body}</p>
              <ul className="mt-5 space-y-2.5">
                {slide.tips.map((tip) => (
                  <li key={tip} className="flex gap-3 text-sm leading-relaxed text-slate-400">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sun-400" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-center gap-1.5" aria-hidden="true">
              {slides.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-sun-400' : 'w-1.5 bg-slate-700'}`}
                />
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              {index > 0 && (
                <button
                  type="button"
                  onClick={back}
                  aria-label="Previous"
                  className="grid size-14 shrink-0 place-items-center rounded-2xl bg-slate-800 text-slate-200 active:scale-95"
                >
                  <ChevronLeft className="size-6" />
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-sun-400 text-base font-bold text-ink shadow-lg shadow-sun-500/20 transition hover:bg-sun-300 active:scale-[0.98]"
              >
                {last ? 'Get started' : 'Next'}
                {!last && <ArrowRight className="size-5" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
