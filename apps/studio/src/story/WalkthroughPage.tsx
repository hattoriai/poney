import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, CircleAlert, Compass, FileCode2, FolderGit2, GitMerge, Info, Maximize2, MessageCircleQuestion, Pause, Play, X } from 'lucide-react'
import { marksOf, parseRef, refKey, type Scene, type Walkthrough, plainText } from '@poney/core'
import { OVERVIEW, useIndex, useStudio } from '@/features/store'
import { revealRef } from '@/features/navigation'
import { SceneView } from './Stage'
import { CodeBlock } from './CodeBlock'
import { EditableText } from '@/components/text/EditableText'
import { Prose } from '@/components/text/Prose'
import { STATE_LABEL, stepLetter, type Mode } from '@poney/react'

/* ─── Per-reader state, kept in this browser ──────────────────────────────── */

function useLocal<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (next: T) => {
      setValue(next)
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        /* reading progress is a convenience */
      }
      // Tells the live link that the reader did something.
      window.dispatchEvent(new Event('poney:local'))
    },
    [key],
  )
  return [value, set] as const
}

/* ─── Small parts ─────────────────────────────────────────────────────────── */

function RiskPill({ risk }: { risk: 'look' | 'routine' }) {
  return risk === 'look' ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-changed/40 bg-changed-wash px-2.5 py-0.5 text-[12px] font-semibold text-changed">
      <CircleAlert size={12} strokeWidth={2.4} /> Look closely
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-rule bg-sunken/70 px-2.5 py-0.5 text-[12px] font-semibold text-ink-2">Routine</span>
  )
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange(m: Mode): void }) {
  const items: { id: Mode; label: string }[] = [
    { id: 'before', label: 'Before' },
    { id: 'change', label: 'Change' },
    { id: 'after', label: 'After' },
  ]
  return (
    <div role="radiogroup" aria-label="Show the system" className="inline-flex rounded-lg border border-rule bg-sunken/60 p-0.5">
      {items.map((i) => (
        <button
          key={i.id}
          role="radio"
          aria-checked={mode === i.id}
          type="button"
          onClick={() => onChange(i.id)}
          className={`h-7 rounded-md px-3 text-[12.5px] font-medium transition-colors ${mode === i.id ? 'bg-raised text-ink shadow-[0_1px_2px_#0000001a]' : 'text-ink-3 hover:text-ink'}`}
        >
          {i.label}
        </button>
      ))}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[12px] text-ink-3" aria-label="Key">
      {(['new', 'changed', 'removed'] as const).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-[1.5px]" style={{ borderColor: `var(--${s})`, background: `var(--${s}-wash)` }} />
          {STATE_LABEL[s]}
        </span>
      ))}
    </div>
  )
}

/** The element the reader clicked in a stage, with a way into the explorer. */
function SelectionCard({ walkthrough }: { walkthrough?: Walkthrough }) {
  const idx = useIndex()
  const selection = useStudio((s) => s.selection)
  const select = useStudio((s) => s.select)
  if (!selection || !idx.exists(selection)) return null
  const d = idx.describe(selection)
  const mark = walkthrough?.marks.find((m) => {
    const r = parseRef(m.ref)
    return r && refKey(r) === refKey(selection)
  })
  return (
    <div className="fade-in absolute bottom-4 left-4 z-10 w-[300px] rounded-xl border border-rule bg-raised p-3.5 shadow-float">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] text-ink-3">{d.kind}</div>
          <div className="text-[14px] font-semibold leading-snug">{d.title}</div>
        </div>
        <button type="button" aria-label="Close" className="rounded p-0.5 text-ink-3 hover:bg-sunken hover:text-ink" onClick={() => select(null)}>
          <X size={14} />
        </button>
      </div>
      {d.summary && <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">{d.summary}</p>}
      {selection.kind === 'entity' && (idx.entities.get(selection.id)?.sourceRefs.length ?? 0) > 0 && (
        <ul className="mt-2 space-y-0.5">
          {idx.entities.get(selection.id)!.sourceRefs.map((r, i) => (
            <li key={i} className="flex min-w-0 items-center gap-1.5 text-ink-3">
              <FileCode2 size={12} className="shrink-0" aria-hidden />
              <code className="truncate font-mono text-[11.5px]" title={r.path}>
                {r.path}
                {r.line ? `:${r.line}` : ''}
                {r.symbol ? ` › ${r.symbol}` : ''}
              </code>
            </li>
          ))}
        </ul>
      )}
      {mark && (
        <p className="mt-2 text-[12.5px] leading-snug">
          <span className="font-semibold" style={{ color: `var(--${mark.state})` }}>
            {STATE_LABEL[mark.state]}
          </span>
          {mark.note ? <span className="text-ink-2">: {mark.note}</span> : ' in this change'}
        </p>
      )}
      <button type="button" onClick={() => revealRef(selection)} className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-poney hover:underline">
        <Compass size={13} /> Explore it in the whole system
      </button>
    </div>
  )
}

/** A scene opened over the page, for when it needs more room. */
function Expanded({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="fade-in fixed inset-0 z-40 bg-ink/30 p-4 backdrop-blur-[2px] sm:p-8" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="flex h-full flex-col overflow-hidden rounded-2xl border border-rule bg-raised shadow-float" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
          <span className="flex-1 text-[14px] font-semibold">{title}</span>
          <button type="button" autoFocus onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-ink-3 hover:bg-sunken hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="relative min-h-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

function ExpandButton({ onClick }: { onClick(): void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Expand the diagram" title="Expand" className="rounded-md p-1.5 text-ink-3 hover:bg-sunken hover:text-ink">
      <Maximize2 size={15} />
    </button>
  )
}

/* ─── The page ────────────────────────────────────────────────────────────── */

export function WalkthroughPage({ walkthrough: w }: { walkthrough: Walkthrough }) {
  const idx = useIndex()
  const tour = w.kind === 'tour'
  const marks = useMemo(() => marksOf(w), [w])
  /** Saves one text field of this walkthrough, through the document's undo history. */
  const edit = useCallback((path: (string | number)[], value: string) => useStudio.getState().dispatch({ type: 'walkthrough.setText', walkthroughId: w.id, path, value }), [w.id])
  const [heroMode, setHeroMode] = useState<Mode>(tour ? 'after' : 'change')
  const [sceneMode, setSceneMode] = useState<Mode>(tour ? 'after' : 'change')
  const [hot, setHot] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [expanded, setExpanded] = useState<'hero' | 'scene' | null>(null)
  const [read, setRead] = useLocal<string[]>(`poney:read:${idx.doc.project.id}:${w.id}`, [])
  const [answers, setAnswers] = useLocal<Record<string, string>>(`poney:answers:${idx.doc.project.id}:${w.id}`, {})
  const [notes, setNotes] = useLocal<Record<string, string>>(`poney:notes:${idx.doc.project.id}:${w.id}`, {})
  const live = useStudio((s) => s.live.state === 'on')
  const setActiveScene = useStudio((s) => s.setActiveScene)
  const scroller = useRef<HTMLDivElement>(null)
  const articles = useRef<(HTMLElement | null)[]>([])
  const overview = w.overview ? idx.views.get(w.overview) : undefined
  const scene = w.scenes[Math.min(active, w.scenes.length - 1)]
  useEffect(() => setActiveScene(scene.id), [scene.id, setActiveScene])
  const sceneView = scene.view ? idx.views.get(scene.view) : undefined

  // The trace: a path the reader plays, one step at a time.
  const [traceStep, setTraceStep] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    setTraceStep(null)
    setPlaying(false)
  }, [scene.id])
  useEffect(() => {
    if (!playing) return
    const t = window.setTimeout(
      () => {
        const next = (traceStep ?? -1) + 1
        if (next >= scene.trace.length) setPlaying(false)
        else setTraceStep(next)
      },
      traceStep === null ? 60 : 1900,
    )
    return () => clearTimeout(t)
  }, [playing, traceStep, scene.trace.length])
  const traceKey = traceStep !== null && scene.trace[traceStep] ? (parseRef(scene.trace[traceStep].ref) ? refKey(parseRef(scene.trace[traceStep].ref)!) : null) : null
  const stepTo = (k: number | null) => {
    setPlaying(false)
    setTraceStep(k === null ? null : Math.max(0, Math.min(scene.trace.length - 1, k)))
  }

  // The scene in the middle of the screen drives the stage.
  useEffect(() => {
    const root = scroller.current
    if (!root) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index))
      },
      { root, rootMargin: '-38% 0px -58% 0px' },
    )
    articles.current.forEach((a) => a && io.observe(a))
    return () => io.disconnect()
  }, [w])

  // A reply from the agent can point at a scene.
  const jump = useStudio((s) => s.jump)
  useEffect(() => {
    const i = jump ? w.scenes.findIndex((x) => x.id === jump.scene) : -1
    if (i >= 0) articles.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [jump, w])

  const goTo = (i: number) => articles.current[i]?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  const toggleRead = (id: string) => setRead(read.includes(id) ? read.filter((r) => r !== id) : [...read, id])
  const keyOf = (k: string) => {
    const r = parseRef(k)
    return r ? refKey(r) : k
  }
  const src = w.source

  return (
    <div ref={scroller} className="scrollbar-quiet relative h-full overflow-y-auto bg-paper">
      {/* Header */}
      <header className="mx-auto max-w-[1320px] px-6 pt-10 sm:px-10 sm:pt-14">
        {src && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
            <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
              {tour ? <FolderGit2 size={14} /> : <GitMerge size={14} />} {src.kind} {src.ref ?? (tour ? src.repository : undefined)}
            </span>
            {src.head && (
              <span>
                head <code className="font-mono text-[12px] text-ink-2">{src.head.slice(0, 7)}</code>
              </span>
            )}
            {src.files !== undefined && <span>{src.files} files</span>}
            {src.added !== undefined && (
              <span className="font-tabular font-mono text-[12px]">
                <span className="text-new">+{src.added}</span> <span className="text-removed">−{src.removed ?? 0}</span>
              </span>
            )}
            {src.author && <span>Walkthrough by {src.author.charAt(0).toLowerCase() + src.author.slice(1)}</span>}
          </p>
        )}
        <EditableText as="h1" label="Title" value={w.title} onSave={(v) => edit(['title'], v)} className="mt-4 block max-w-[24ch] text-[34px] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[44px]" />
        <EditableText as="p" label="Summary" value={w.summary} onSave={(v) => edit(['summary'], v)} className="mt-5 block max-w-[60ch] text-[18px] leading-relaxed text-ink-2" />
      </header>

      {/* What changes for a person */}
      <section aria-labelledby="story" className="mx-auto mt-14 max-w-[1320px] px-6 sm:px-10">
        <div className={`grid gap-x-12 gap-y-6 ${w.story.before || w.story.after ? 'lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]' : ''}`}>
          <div>
            <h2 id="story" className="text-[22px] font-semibold tracking-[-0.01em]">
              {tour ? 'What this code is for' : 'What changes for a person'}
            </h2>
            <EditableText as="p" multiline label="Story" value={w.story.text} onSave={(v) => edit(['story', 'text'], v)} className="mt-4 block max-w-[66ch] text-[16.5px] leading-[1.7] text-ink-2" />
          </div>
          {(w.story.before || w.story.after) && (
          <dl className="space-y-3 lg:pt-11">
            <div className="rounded-xl border border-rule bg-raised px-4 py-3.5">
              <dt className="text-[12.5px] font-semibold text-ink-3">Before</dt>
              <EditableText as="dd" label="Before" value={w.story.before ?? ''} onSave={(v) => edit(['story', 'before'], v)} className="mt-1 block text-[15px] leading-snug" />
            </div>
            <div className="rounded-xl border border-new/40 bg-new-wash px-4 py-3.5">
              <dt className="text-[12.5px] font-semibold text-new">After</dt>
              <EditableText as="dd" label="After" value={w.story.after ?? ''} onSave={(v) => edit(['story', 'after'], v)} className="mt-1 block text-[15px] leading-snug" />
            </div>
          </dl>
          )}
        </div>
        {overview && (
          <figure className="relative mt-8 flex h-[min(620px,72vh)] flex-col overflow-hidden rounded-2xl border border-rule bg-raised">
            <figcaption className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-3">
              <span className="text-[13px] font-semibold">{overview.title}</span>
              <span className="hidden text-[12.5px] text-ink-3 md:inline">{tour ? 'Open a group to see what is inside it.' : 'Switch between before and after to see what moves.'}</span>
              <span className="flex-1" />
              {!tour && <Legend />}
              {!tour && <ModeSwitch mode={heroMode} onChange={setHeroMode} />}
              <ExpandButton onClick={() => setExpanded('hero')} />
            </figcaption>
            <div className="relative min-h-0 flex-1">
              <SceneView view={overview} walkthrough={w} marks={marks} mode={heroMode} focus={[]} callouts={[]} hot={hot} setHot={setHot} maxScale={1.1} />
              <SelectionCard walkthrough={w} />
            </div>
          </figure>
        )}
      </section>

      {/* Verdict */}
      {w.verdict && (
        <section aria-labelledby="verdict" className="mx-auto mt-10 max-w-[1320px] px-6 sm:px-10">
          <div className="rounded-2xl border border-rule bg-raised px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <h2 id="verdict" className="text-[16px] font-semibold">
                {tour ? 'At a glance' : 'Verdict'}
              </h2>
              {(!tour || w.verdict.risk === 'look') && <RiskPill risk={w.verdict.risk} />}
            </div>
            <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
              {w.verdict.facts.map((f) => (
                <div key={f.label}>
                  <dt className="text-[12.5px] text-ink-3">{f.label}</dt>
                  <dd className="mt-1 text-[14px] leading-snug">{f.value}</dd>
                </div>
              ))}
            </dl>
            {w.verdict.findings.length > 0 && (
              <div className="mt-5 border-t border-rule pt-4">
                <h3 className="text-[13px] font-semibold text-ink-3">{tour ? 'Good to know' : 'Findings'}</h3>
                <ul className="mt-2 space-y-1.5">
                  {w.verdict.findings.map((f, i) => {
                    const at = f.scene ? w.scenes.findIndex((x) => x.id === f.scene) : -1
                    return (
                      <li key={i} className="flex items-start gap-2.5 text-[14px] leading-snug">
                        {f.severity === 'risk' ? <CircleAlert size={15} className="mt-0.5 shrink-0 text-changed" /> : <Info size={15} className="mt-0.5 shrink-0 text-ink-3" />}
                        <span>
                          <EditableText label="Finding" value={f.text} onSave={(v) => edit(['verdict', 'findings', i, 'text'], v)} />
                          {at >= 0 && (
                            <button type="button" onClick={() => goTo(at)} className="ml-2 text-[12.5px] font-semibold text-poney hover:underline">
                              See scene {at + 1}
                            </button>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Reading path */}
      <section aria-labelledby="path" className="mx-auto mt-14 max-w-[1320px] px-6 sm:px-10">
        <div className="flex items-end gap-4">
          <h2 id="path" className="text-[22px] font-semibold tracking-[-0.01em]">
            Read in this order
          </h2>
          <span className="font-tabular pb-1 text-[13px] text-ink-3">
            {read.length} of {w.scenes.length} read
          </span>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
          <div className="h-full rounded-full bg-new transition-[width] duration-500" style={{ width: `${(read.length / w.scenes.length) * 100}%` }} />
        </div>
        <ol className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {w.scenes.map((s, i) => (
            <li key={s.id}>
              <button type="button" onClick={() => goTo(i)} className="group flex h-full w-full items-start gap-3 rounded-xl border border-rule bg-raised px-4 py-3.5 text-left transition-colors hover:border-rule-strong">
                <span className={`font-tabular mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${read.includes(s.id) ? 'bg-new text-paper' : 'bg-sunken text-ink-2'}`}>
                  {read.includes(s.id) ? <Check size={13} strokeWidth={3} /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-semibold leading-snug">
                    <Prose text={s.title} />
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                    {(!tour || s.risk === 'look') && <RiskPill risk={s.risk} />}
                    {s.code.map((c) => (
                      <code key={c.path} className="font-mono text-[11.5px]">
                        {c.path.split('/').pop()}
                      </code>
                    ))}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      {/* Scenes */}
      <section aria-label="Scenes" className="mx-auto mt-16 grid max-w-[1480px] gap-10 px-6 pb-[30vh] sm:px-10 lg:grid-cols-[minmax(360px,500px)_minmax(0,1fr)]">
        <div className="order-2 lg:order-1">
          {w.scenes.map((s, i) => (
            <SceneArticle
              edit={edit}
              key={s.id}
              s={s}
              i={i}
              count={w.scenes.length}
              refCb={(el) => (articles.current[i] = el)}
              active={i === active}
              hot={hot}
              setHot={setHot}
              keyOf={keyOf}
              read={read.includes(s.id)}
              onRead={() => {
                toggleRead(s.id)
                if (!read.includes(s.id) && i + 1 < w.scenes.length) goTo(i + 1)
              }}
              answers={answers}
              onAnswer={(key, a) => setAnswers({ ...answers, [key]: a })}
              note={notes[s.id] ?? ''}
              onNote={(n) => setNotes({ ...notes, [s.id]: n })}
              live={live}
              tour={tour}
              traceStep={i === active ? traceStep : null}
              onTraceStep={(k) => (i === active ? stepTo(k) : goTo(i))}
            />
          ))}
        </div>
        <div className="order-1 lg:order-2">
          <figure className="sticky top-4 flex h-[46vh] flex-col overflow-hidden rounded-2xl border border-rule bg-raised lg:top-8 lg:h-[calc(100vh-8rem)]">
            <figcaption className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-3">
              <span className="font-tabular text-[12.5px] text-ink-3">
                {active + 1} / {w.scenes.length}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{sceneView?.title ?? 'Code only'}</span>
              {scene.trace.length > 0 && sceneView && (
                <TracePlayer
                  count={scene.trace.length}
                  step={traceStep}
                  playing={playing}
                  onPlay={() => {
                    if (traceStep !== null && traceStep >= scene.trace.length - 1) setTraceStep(null)
                    setPlaying(true)
                  }}
                  onPause={() => setPlaying(false)}
                  onStep={stepTo}
                />
              )}
              {!tour && <Legend />}
              {!tour && <ModeSwitch mode={sceneMode} onChange={setSceneMode} />}
              {sceneView && <ExpandButton onClick={() => setExpanded('scene')} />}
            </figcaption>
            <div className="relative min-h-0 flex-1">
              {sceneView ? (
                <SceneView
                  key={sceneView.id}
                  view={sceneView}
                  walkthrough={w}
                  marks={marks}
                  mode={sceneMode}
                  focus={scene.focus}
                  callouts={scene.callouts.map((c) => c.target)}
                  hot={traceKey ?? hot}
                  setHot={setHot}
                  sceneData={scene}
                  traceStep={traceStep}
                />
              ) : (
                <div className="grid h-full place-items-center px-8 text-center text-ink-3">This scene is about code only. Read it on the left.</div>
              )}
              {traceStep !== null && scene.trace[traceStep] && (
                <p className="fade-in pointer-events-none absolute left-1/2 top-3 z-10 max-w-[80%] -translate-x-1/2 rounded-full border border-rule bg-raised/95 px-3.5 py-1.5 text-center text-[13px] leading-snug shadow-float backdrop-blur" aria-live="polite">
                  <span className="font-tabular mr-2 font-semibold text-poney">
                    {stepLetter(traceStep)} · {traceStep + 1} of {scene.trace.length}
                  </span>
                  {scene.trace[traceStep].caption ? <Prose text={scene.trace[traceStep].caption!} /> : (idx.exists(parseRef(scene.trace[traceStep].ref)!) ? idx.describe(parseRef(scene.trace[traceStep].ref)!).title : scene.trace[traceStep].ref)}
                </p>
              )}
              <SelectionCard walkthrough={w} />
            </div>
          </figure>
        </div>
      </section>

      {expanded === 'hero' && overview && (
        <Expanded title={overview.title} onClose={() => setExpanded(null)}>
          <SceneView view={overview} walkthrough={w} marks={marks} mode={heroMode} focus={[]} callouts={[]} hot={hot} setHot={setHot} maxScale={1.4} />
        </Expanded>
      )}
      {expanded === 'scene' && sceneView && (
        <Expanded title={`${active + 1}. ${plainText(scene.title)}`} onClose={() => setExpanded(null)}>
          <SceneView view={sceneView} walkthrough={w} marks={marks} mode={sceneMode} focus={scene.focus} callouts={scene.callouts.map((c) => c.target)} hot={traceKey ?? hot} setHot={setHot} maxScale={1.4} sceneData={scene} traceStep={traceStep} />
        </Expanded>
      )}

      <footer className="mx-auto max-w-[1320px] border-t border-rule px-6 py-10 sm:px-10">
        <button type="button" onClick={() => useStudio.getState().navigate(OVERVIEW)} className="inline-flex items-center gap-2 text-[14px] font-semibold text-poney hover:underline">
          <Compass size={15} /> Explore the whole system
        </button>
      </footer>
    </div>
  )
}

interface ArticleProps {
  s: Scene
  i: number
  count: number
  refCb(el: HTMLElement | null): void
  active: boolean
  hot: string | null
  setHot(k: string | null): void
  keyOf(k: string): string
  read: boolean
  onRead(): void
  answers: Record<string, string>
  onAnswer(key: string, a: string): void
  note: string
  onNote(n: string): void
  live: boolean
  /** A tour: no change to judge; questions check understanding. */
  tour: boolean
  traceStep: number | null
  onTraceStep(k: number): void
  /** Saves a text field of the walkthrough, by its path. */
  edit(path: (string | number)[], value: string): void
}

function SceneArticle({ s, i, count, refCb, active, hot, setHot, keyOf, read, onRead, answers, onAnswer, note, onNote, live, tour, traceStep, onTraceStep, edit }: ArticleProps) {
  const field = (...path: (string | number)[]) => (v: string) => edit(['scenes', i, ...path], v)
  const [writing, setWriting] = useState(!!note)
  return (
    <article ref={refCb} data-index={i} aria-labelledby={`scene-${s.id}`} className={`scroll-mt-6 border-t border-rule pb-16 pt-10 transition-opacity duration-300 first:border-t-0 first:pt-0 lg:min-h-[85vh] ${active ? '' : 'lg:opacity-55'}`}>
      <div className="flex items-center gap-3">
        <span className="font-tabular text-[13px] text-ink-3">
          {i + 1} of {count}
        </span>
        {(!tour || s.risk === 'look') && <RiskPill risk={s.risk} />}
      </div>
      <EditableText as="h3" id={`scene-${s.id}`} label="Scene title" value={s.title} onSave={field('title')} className="mt-3 block text-[26px] font-semibold leading-tight tracking-[-0.015em]" />
      <EditableText as="p" multiline label="Scene text" value={s.text} onSave={field('text')} className="mt-4 block text-[16px] leading-[1.7] text-ink-2" />

      {s.callouts.length > 0 && (
        <ol className="mt-6 space-y-1" aria-label="Notes on the diagram">
          {s.callouts.map((c, n) => {
            const k = keyOf(c.target)
            return (
              <li key={n} onMouseEnter={() => setHot(k)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(k)} onBlur={() => setHot(null)} tabIndex={0} className={`-mx-2 flex cursor-default gap-3 rounded-lg px-2 py-2 outline-none transition-colors ${hot === k ? 'bg-poney-wash' : ''}`}>
                <span className={`font-tabular grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[11.5px] font-bold text-paper ${hot === k ? 'bg-poney' : 'bg-ink'}`}>{n + 1}</span>
                <EditableText label={`Note ${n + 1}`} value={c.text} onSave={field('callouts', n, 'text')} className="text-[14.5px] leading-snug" />
              </li>
            )
          })}
        </ol>
      )}

      {s.trace.length > 0 && (
        <div className="mt-8">
          <h4 className="text-[13px] font-semibold text-ink-3">Follow the path</h4>
          <ol className="mt-2 space-y-0.5">
            {s.trace.map((t, k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => onTraceStep(k)}
                  aria-current={traceStep === k ? 'step' : undefined}
                  className={`-mx-2 flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sunken/70 ${traceStep === k ? 'bg-poney-wash' : ''}`}
                >
                  <span className={`font-tabular mt-px grid h-[19px] w-[19px] shrink-0 place-items-center rounded-[5px] text-[11px] font-bold ${traceStep === k ? 'bg-poney text-paper' : 'bg-sunken text-ink-2'}`}>{stepLetter(k)}</span>
                  <span className="text-[14px] leading-snug">{t.caption ? <Prose text={t.caption} /> : t.ref}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {s.cases.length > 0 && (
        <div className="mt-8">
          <h4 className="text-[13px] font-semibold text-ink-3">In each case</h4>
          <table className="mt-2 w-full text-left text-[13.5px]">
            <thead className="sr-only">
              <tr>
                <th>When</th>
                <th>Then</th>
              </tr>
            </thead>
            <tbody>
              {s.cases.map((c, n) => (
                <tr key={n} className="border-b border-rule last:border-b-0">
                  <td className="py-2.5 pr-4 align-top text-ink-2">
                    <EditableText label="When" value={c.when} onSave={field('cases', n, 'when')} />
                  </td>
                  <td className="py-2.5 align-top">
                    <EditableText label="Then" value={c.then} onSave={field('cases', n, 'then')} className="font-medium" />
                    {c.note && <span className="block text-[12.5px] text-ink-3">{c.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {s.proof.length > 0 && (
        <div className="mt-8">
          <h4 className="text-[13px] font-semibold text-ink-3">{tour ? 'Tests that show it' : 'Proof'}</h4>
          <ul className="mt-2 space-y-1.5">
            {s.proof.map((p, n) => (
              <li key={n} className="flex items-start gap-2.5 text-[13.5px] leading-snug">
                {p.missing ? <CircleAlert size={15} className="mt-0.5 shrink-0 text-changed" /> : <Check size={15} strokeWidth={2.6} className="mt-0.5 shrink-0 text-new" />}
                <span>
                  <span className={p.missing ? 'text-changed' : ''}>{p.missing ? `No test yet: ${p.text.charAt(0).toLowerCase()}${p.text.slice(1)}` : p.text}</span>
                  {(p.source || p.test) && (
                    <code className="block font-mono text-[11.5px] text-ink-3">
                      {[p.source, p.test].filter(Boolean).join(' › ')}
                    </code>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {[...(s.question ? [s.question] : []), ...s.questions].map((q, qi) => {
        const key = qi === 0 && s.question ? s.id : `${s.id}#${qi}`
        const questionPath = qi === 0 && s.question ? field('question') : field('questions', s.question ? qi - 1 : qi)
        const given = answers[key]
        if (tour) return <CheckQuestion key={key} question={q} answer={given ?? ''} onAnswer={(a) => onAnswer(key, a)} live={live} />
        return (
          <div key={key} className="mt-8 rounded-xl border border-changed/40 bg-changed-wash px-4 py-4">
            <p className="flex items-start gap-2.5 text-[14.5px] leading-snug">
              <MessageCircleQuestion size={17} className="mt-0.5 shrink-0 text-changed" />
              <EditableText label="Question" value={q} onSave={questionPath} />
            </p>
            {given ? (
              <p className="mt-3 flex items-center gap-2 pl-7 text-[13px] text-ink-2">
                <Check size={14} className="text-new" /> You answered: <strong className="font-semibold text-ink">{given}</strong>
                <button type="button" className="text-ink-3 underline-offset-2 hover:underline" onClick={() => onAnswer(key, '')}>
                  Change
                </button>
              </p>
            ) : (
              <div className="mt-3 flex gap-2 pl-7">
                <button type="button" onClick={() => onAnswer(key, 'Keep it')} className="h-8 rounded-lg bg-ink px-3 text-[13px] font-semibold text-paper hover:opacity-90">
                  Keep it
                </button>
                <button type="button" onClick={() => onAnswer(key, 'Ask for a change')} className="h-8 rounded-lg border border-rule-strong bg-raised px-3 text-[13px] font-semibold hover:bg-sunken">
                  Ask for a change
                </button>
              </div>
            )}
          </div>
        )
      })}

      {s.code.length > 0 && (
        <div className="mt-8 space-y-4">
          <h4 className="text-[13px] font-semibold text-ink-3">The code</h4>
          {s.code.map((c, ci) => (
            <CodeBlock key={`${ci}:${c.path}`} block={c} onEditNote={(ni, v) => field('code', ci, 'notes', ni, 'text')(v)} />
          ))}
        </div>
      )}

      <div className="mt-8">
        {writing ? (
          <label className="block">
            <span className="text-[13px] font-semibold text-ink-3">{live ? 'Note for the agent' : 'Your note'}</span>
            <textarea
              value={note}
              onChange={(e) => onNote(e.target.value)}
              rows={3}
              placeholder={live ? 'What should change here? The agent reads this.' : 'What should change here?'}
              className="mt-1.5 w-full resize-y rounded-xl border border-rule bg-raised px-3 py-2.5 text-[14px] leading-snug outline-none placeholder:text-ink-4 focus:border-rule-strong"
            />
          </label>
        ) : (
          <button type="button" onClick={() => setWriting(true)} className="text-[13px] font-semibold text-ink-3 hover:text-ink">
            + {live ? 'Add a note for the agent' : 'Add a note'}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onRead}
        aria-pressed={read}
        className={`mt-8 inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13.5px] font-semibold transition-colors ${read ? 'bg-new-wash text-new' : 'border border-rule-strong bg-raised hover:bg-sunken'}`}
      >
        <Check size={15} strokeWidth={2.6} /> {read ? 'Read' : i + 1 < count ? 'Mark as read, then next' : 'Mark as read'}
      </button>
    </article>
  )
}

/** A question in a tour checks understanding: the reader writes an answer, and the agent can read it. */
function CheckQuestion({ question, answer, onAnswer, live }: { question: string; answer: string; onAnswer(a: string): void; live: boolean }) {
  const [draft, setDraft] = useState(answer)
  const saved = answer.trim() !== '' && draft === answer
  return (
    <div className="mt-8 rounded-xl border border-rule bg-raised px-4 py-4">
      <p className="flex items-start gap-2.5 text-[14.5px] font-medium leading-snug">
        <MessageCircleQuestion size={17} className="mt-0.5 shrink-0 text-poney" />
        {question}
      </p>
      <form
        className="mt-3 pl-7"
        onSubmit={(e) => {
          e.preventDefault()
          onAnswer(draft.trim())
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          aria-label="Your answer"
          placeholder="Your answer"
          className="w-full resize-y rounded-lg border border-rule bg-paper px-3 py-2 text-[14px] leading-snug outline-none placeholder:text-ink-4 focus:border-rule-strong"
        />
        <div className="mt-2 flex items-center gap-3">
          <button type="submit" disabled={!draft.trim() || saved} className="h-8 rounded-lg bg-ink px-3 text-[13px] font-semibold text-paper disabled:opacity-35">
            {saved ? 'Saved' : 'Save answer'}
          </button>
          {saved && <span className="text-[12.5px] text-ink-3">{live ? 'The agent can read it. Ask it whether you are right.' : 'Kept in this browser.'}</span>}
        </div>
      </form>
    </div>
  )
}

/** Plays a scene's path: one step at a time, or all of it. */
function TracePlayer({ count, step, playing, onPlay, onPause, onStep }: { count: number; step: number | null; playing: boolean; onPlay(): void; onPause(): void; onStep(k: number | null): void }) {
  const btn = 'grid h-7 w-7 place-items-center rounded-md text-ink-2 hover:bg-sunken disabled:opacity-30'
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-rule bg-sunken/60 p-0.5" role="group" aria-label="Play the path">
      <button type="button" className={btn} aria-label="Previous step" disabled={step === null || step === 0} onClick={() => onStep((step ?? 0) - 1)}>
        <ChevronLeft size={15} />
      </button>
      {playing ? (
        <button type="button" onClick={onPause} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-raised px-2.5 text-[12.5px] font-semibold text-ink shadow-[0_1px_2px_#0000001a]">
          <Pause size={13} /> Pause
        </button>
      ) : (
        <button type="button" onClick={onPlay} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-raised px-2.5 text-[12.5px] font-semibold text-ink shadow-[0_1px_2px_#0000001a]">
          <Play size={13} /> {step === null ? 'Play the path' : step >= count - 1 ? 'Again' : 'Play'}
        </button>
      )}
      <button type="button" className={btn} aria-label="Next step" disabled={step !== null && step >= count - 1} onClick={() => onStep(step === null ? 0 : step + 1)}>
        <ChevronRight size={15} />
      </button>
    </div>
  )
}
