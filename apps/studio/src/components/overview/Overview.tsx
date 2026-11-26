import { useMemo } from 'react'
import { AlertTriangle, ArrowUpRight, BookOpenText, CheckCircle2, ClipboardPaste, LayoutGrid, Loader2, Plug } from 'lucide-react'
import { validateDocument, type View, plainText } from '@poney/core'
import { useIndex, useStudio } from '@/features/store'
import { Prose } from '@/components/text/Prose'
import { ask, STARTERS } from '@/features/agent'
import { knownExtensions } from '@/features/extensions'
import { diagramFor } from '@poney/react'
import { categoryLabel, orderCategories } from '../navigation/categories'

/** The first page of a project: what the software is and where to start. */
export function Overview() {
  const idx = useIndex()
  const doc = idx.doc
  const navigate = useStudio((s) => s.navigate)
  const check = useMemo(() => validateDocument(doc, { extensions: knownExtensions() }), [doc])
  const start = pickStart(doc.views)
  const categories = orderCategories([...new Set(doc.views.map((v) => v.category))]).filter((c) => c !== 'walkthrough')
  // Diagrams by category, then the diagrams each walkthrough draws in its scenes (often all a tour has).
  const groups = [
    ...categories.map((c) => ({ key: c, label: categoryLabel(c), views: doc.views.filter((v) => v.category === c) })),
    ...doc.walkthroughs.map((w) => {
      const used = new Set([w.overview, ...w.scenes.map((s) => s.view)].filter(Boolean))
      return { key: `walk:${w.id}`, label: `In “${plainText(w.title)}”`, views: doc.views.filter((v) => v.category === 'walkthrough' && used.has(v.id)) }
    }),
  ].filter((g) => g.views.length > 0)
  const counts = [
    [doc.model.entities.length, 'parts'],
    [doc.model.relationships.length, 'connections'],
    [doc.model.dataTypes.length, 'data types'],
    [doc.model.behaviors.length, 'behaviors'],
    [doc.model.capabilities.length, 'use cases'],
  ].filter(([n]) => (n as number) > 0) as [number, string][]

  if (doc.views.length === 0 && doc.walkthroughs.length === 0) return <EmptyProject name={doc.project.name} description={doc.project.description} />

  return (
    <div className="scrollbar-quiet h-full overflow-y-auto">
      <div className="mx-auto max-w-[920px] px-6 pb-20 pt-12 sm:px-10">
        <p className="text-[13px] text-ink-3">Project</p>
        <h1 className="mt-1 text-[34px] font-semibold leading-tight tracking-[-0.02em]">{doc.project.name}</h1>
        <p className="mt-3 max-w-[64ch] text-[16px] leading-relaxed text-ink-2">{doc.project.description}</p>
        <p className="font-tabular mt-4 text-[13px] text-ink-3">{counts.map(([n, l]) => `${n} ${l}`).join(', ')}, shown in {doc.views.length} diagram{doc.views.length === 1 ? '' : 's'}.</p>

        {doc.walkthroughs.length > 0 && (
          <section className="mt-10" aria-labelledby="walkthroughs">
            <h2 id="walkthroughs" className="text-[15px] font-semibold">
              Walkthroughs and tours
            </h2>
            <ul className="mt-3 space-y-3">
              {doc.walkthroughs.map((w) => (
                <li key={w.id}>
                  <button type="button" onClick={() => navigate(`walk:${w.id}`)} className="group flex w-full items-start gap-4 rounded-xl border border-rule bg-raised p-5 text-left transition-colors hover:border-rule-strong">
                    <BookOpenText size={20} className="mt-0.5 shrink-0 text-poney" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold">
                        <Prose text={w.title} />
                      </span>
                      <span className="mt-1 block max-w-[70ch] text-[13.5px] leading-snug text-ink-2">
                        <Prose text={w.summary} />
                      </span>
                      <span className="mt-2 block text-[12.5px] text-ink-3">
                        {w.scenes.length} scenes{w.source?.ref ? `, ${w.source.kind.toLowerCase()} ${w.source.ref}` : ''}
                      </span>
                    </span>
                    <ArrowUpRight size={16} className="mt-1 shrink-0 text-ink-4 group-hover:text-poney" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {start.length > 0 && (
          <section className="mt-10" aria-labelledby="start-here">
            <h2 id="start-here" className="text-[15px] font-semibold">
              Start here
            </h2>
            <ol className="mt-3 grid gap-3 md:grid-cols-3">
              {start.map(({ view, why }, i) => {
                const m = diagramFor(view)
                const Icon = m?.icon ?? LayoutGrid
                return (
                  <li key={view.id}>
                    <button
                      type="button"
                      onClick={() => navigate(view.id)}
                      className="group flex h-full w-full flex-col rounded-xl border border-rule bg-raised p-4 text-left transition-colors hover:border-rule-strong"
                    >
                      <span className="flex items-center gap-2 text-[12px] text-ink-3">
                        <span className="font-tabular grid h-5 w-5 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-ink-2">{i + 1}</span>
                        {m?.label}
                      </span>
                      <span className="mt-3 flex items-center gap-2 text-[15px] font-semibold">
                        <Icon size={16} className="text-poney" />
                        {view.title}
                      </span>
                      <span className="mt-1 text-[13px] leading-snug text-ink-2">{why}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>
        )}

        {groups.length > 0 && (
        <section className="mt-12" aria-labelledby="all-diagrams">
          <h2 id="all-diagrams" className="text-[15px] font-semibold">
            Every diagram
          </h2>
          <p className="mt-1 text-[13px] text-ink-2">All of them read from one model. Select something in one diagram, and follow it into the others.</p>
          <div className="mt-4 grid gap-x-10 gap-y-6 md:grid-cols-2">
            {groups.map((g) => (
              <div key={g.key}>
                <h3 className="mb-1.5 text-[12px] font-semibold text-ink-3">{g.label}</h3>
                <ul>
                  {g.views.map((v) => {
                      const m = diagramFor(v)
                      const Icon = m?.icon ?? LayoutGrid
                      return (
                        <li key={v.id}>
                          <button type="button" onClick={() => navigate(v.id)} className="group -mx-2 flex w-[calc(100%+16px)] items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-sunken">
                            <Icon size={16} className="mt-0.5 shrink-0 text-ink-3 group-hover:text-poney" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13.5px] font-semibold">{v.title}</span>
                              <span className="block text-[12.5px] leading-snug text-ink-2">{v.description}</span>
                            </span>
                            <ArrowUpRight size={14} className="mt-0.5 shrink-0 text-ink-4 opacity-0 group-hover:opacity-100" />
                          </button>
                        </li>
                      )
                    })}
                </ul>
              </div>
            ))}
          </div>
        </section>
        )}

        <section className="mt-12 grid gap-6 border-t border-rule pt-8 md:grid-cols-2" aria-label="About this document">
          <div>
            <h2 className="text-[15px] font-semibold">The model</h2>
            {check.ok ? (
              <p className="mt-2 flex items-start gap-2 text-[13px] text-ink-2">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[color:var(--success)]" />
                A valid Poney {doc.poneyVersion} document
                {doc.extensions.length ? `, using the ${doc.extensions.map((e) => e.name).join(', ')} extension` : ''}. Every reference resolves.
              </p>
            ) : (
              <p className="mt-2 flex items-start gap-2 text-[13px] text-ink-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[color:var(--failure)]" />
                {check.issues.length} problem{check.issues.length === 1 ? '' : 's'} in the model.
              </p>
            )}
            {check.issues.length > 0 && (
              <ul className="mt-2 space-y-1 text-[12px] text-ink-2">
                {check.issues.slice(0, 6).map((i, n) => (
                  <li key={n}>
                    <code className="font-mono text-[11px] text-ink-3">{i.path}</code> {i.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="text-[15px] font-semibold">Bring your own</h2>
            <p className="mt-2 flex items-start gap-2 text-[13px] text-ink-2">
              <ClipboardPaste size={15} className="mt-0.5 shrink-0 text-ink-3" />
              <span>
                Paste a Poney document or a Mermaid diagram anywhere in the studio to open it.{' '}
                <button type="button" className="font-semibold text-poney hover:underline" onClick={() => useStudio.getState().setImportOpen(true)}>
                  Open or paste a model
                </button>
              </span>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

function pickStart(views: View[]): { view: View; why: string }[] {
  const out: { view: View; why: string }[] = []
  const context = views.find((v) => v.type === 'architecture' && v.collapsed.length > 0)
  const arch = views.find((v) => v.type === 'architecture' && v.collapsed.length === 0)
  const seq = views.find((v) => v.type === 'sequence' && /checkout|order/i.test(v.id)) ?? views.find((v) => v.type === 'sequence')
  if (context) out.push({ view: context, why: 'The whole system as one box: who uses it and what it depends on.' })
  if (arch) out.push({ view: arch, why: 'Open the box: every app, service and store, and how they connect.' })
  if (seq) out.push({ view: seq, why: 'Follow one request, step by step, through the services.' })
  if (out.length === 0) out.push(...views.slice(0, 3).map((view) => ({ view, why: view.description })))
  return out
}

/**
 * A project with nothing drawn yet, such as a folder an agent just started in:
 * the ways to fill it.
 */
function EmptyProject({ name, description }: { name: string; description: string }) {
  const { session, listening } = useStudio((s) => s.agent)
  const busy = session?.busy
  const start = (prompt: string) => {
    useStudio.getState().setAgentPanelOpen(true)
    void ask(prompt)
  }
  return (
    <div className="scrollbar-quiet h-full overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-6 pb-20 pt-14 sm:px-10">
        <p className="text-[13px] text-ink-3">Project</p>
        <h1 className="mt-1 text-[34px] font-semibold leading-tight tracking-[-0.02em]">{name}</h1>
        {description && <p className="mt-3 max-w-[64ch] text-[16px] leading-relaxed text-ink-2">{description}</p>}
        <p className="mt-8 text-[15px] text-ink-2">{busy ? 'The agent is working on it. What it opens shows here.' : 'Nothing is drawn yet.'}</p>
        {busy ? (
          <p className="mt-4 inline-flex items-center gap-2 text-[14px] text-ink-3">
            <Loader2 size={15} className="animate-spin" /> {session?.name} is reading the code…
          </p>
        ) : session || listening ? (
          <ul className="mt-5 space-y-2">
            {STARTERS.map((st) => (
              <li key={st.label}>
                <button type="button" onClick={() => start(st.prompt)} className="group flex w-full items-center gap-3 rounded-xl border border-rule bg-raised px-5 py-4 text-left transition-colors hover:border-rule-strong">
                  <BookOpenText size={18} className="shrink-0 text-poney" />
                  <span className="flex-1 text-[15px] font-semibold">{st.label}</span>
                  <ArrowUpRight size={16} className="shrink-0 text-ink-4 group-hover:text-poney" />
                </button>
              </li>
            ))}
            <li className="pt-2 text-[13.5px] text-ink-3">Or ask anything in the agent panel.</li>
          </ul>
        ) : (
          <div className="mt-5">
            <button type="button" onClick={() => useStudio.getState().setConnectOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-3.5 text-[13.5px] font-semibold text-paper hover:opacity-90">
              <Plug size={15} /> Connect an agent
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
