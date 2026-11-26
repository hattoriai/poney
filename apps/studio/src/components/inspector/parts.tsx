import type { ReactNode } from 'react'
import { ArrowUpRight, ChevronRight, FileCode2 } from 'lucide-react'
import type { Ref, SourceRef, View } from '@poney/core'
import { useIndex } from '@/features/store'
import { openView, revealRef } from '@/features/navigation'
import { diagramFor } from '@/renderers/registry'
import { iconFor } from '@/renderers/shared/icons'
import { toneColor } from '@/renderers/shared/tone'
import { LayoutGrid } from 'lucide-react'

export function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="border-t border-rule px-4 py-3.5 first:border-t-0">
      <h3 className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-ink-3">
        {title}
        {count !== undefined && <span className="font-tabular font-normal text-ink-4">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

export function Facts({ items }: { items: [string, ReactNode | undefined][] }) {
  const shown = items.filter(([, v]) => v !== undefined && v !== '' && v !== null)
  if (!shown.length) return null
  return (
    <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A row that takes you to another element, keeping context. */
export function RefLink({ to, label, secondary, icon, tone, onClick }: { to?: Ref; label: ReactNode; secondary?: ReactNode; icon?: ReactNode; tone?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick ?? (() => to && revealRef(to))}
      className="group -mx-2 flex w-[calc(100%+16px)] items-start gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-sunken"
    >
      {icon && (
        <span className="mt-[1px] shrink-0" style={{ color: tone }}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] leading-snug text-ink">{label}</span>
        {secondary && <span className="block text-[11.5px] leading-snug text-ink-3">{secondary}</span>}
      </span>
      <ChevronRight size={13} className="mt-0.5 shrink-0 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}

export function EntityLink({ id, secondary }: { id: string; secondary?: ReactNode }) {
  const idx = useIndex()
  const e = idx.entities.get(id)
  if (!e) return null
  const s = idx.style(e)
  const Icon = iconFor(s.icon)
  return <RefLink to={{ kind: 'entity', id }} label={e.name} secondary={secondary ?? s.label} icon={<Icon size={14} />} tone={toneColor(s.tone)} />
}

/** Opens a diagram with the given element selected in it. */
export function ViewLink({ view, select, verb = 'Open' }: { view: View; select?: Ref | null; verb?: string }) {
  const module = diagramFor(view)
  const Icon = module?.icon ?? LayoutGrid
  return (
    <button
      type="button"
      onClick={() => openView(view.id, select)}
      className="group -mx-2 flex w-[calc(100%+16px)] items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-sunken"
    >
      <Icon size={14} className="shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1 text-[12.5px] text-ink">
        {verb} {view.title.charAt(0).toLowerCase() + view.title.slice(1)}
      </span>
      <ArrowUpRight size={13} className="shrink-0 text-ink-4 group-hover:text-poney" />
    </button>
  )
}

export function Sources({ refs }: { refs: SourceRef[] }) {
  if (!refs.length) return null
  return (
    <Section title="In the code" count={refs.length}>
      <ul className="space-y-1">
        {refs.map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px]">
            <FileCode2 size={13} className="mt-0.5 shrink-0 text-ink-3" />
            <span className="min-w-0">
              <code className="block break-all font-mono text-[11.5px] text-ink">
                {r.path}
                {r.line ? `:${r.line}` : ''}
              </code>
              {r.symbol && <span className="text-ink-3">{r.symbol}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function Prose({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-ink-2">{children}</p>
}

export function Chips({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <span key={t} className="rounded-md bg-sunken px-1.5 py-0.5 text-[11.5px] text-ink-2">
          {t}
        </span>
      ))}
    </div>
  )
}
