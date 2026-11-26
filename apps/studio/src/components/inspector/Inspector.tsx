import { X, Scan, Puzzle } from 'lucide-react'
import { refKey, type Ref, type View } from '@hattoriai/poney-core'
import { OVERVIEW, useIndex, useStudio } from '@/features/store'
import { diagramFor } from '@hattoriai/poney-react'
import { iconFor } from '@hattoriai/poney-react'
import { toneColor } from '@hattoriai/poney-react'
import { bodyFor } from './bodies'
import { Prose, Section } from './parts'
import { categoryLabel } from '../navigation/categories'

export function Inspector() {
  const open = useStudio((s) => s.inspectorOpen)
  const selection = useStudio((s) => s.selection)
  const viewId = useStudio((s) => s.viewId)
  const toggle = useStudio((s) => s.toggleInspector)
  const idx = useIndex()
  const view = viewId === OVERVIEW ? undefined : idx.views.get(viewId)
  if (!open) return null
  return (
    <aside
      aria-label="Inspector"
      className="scrollbar-quiet z-20 flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-rule bg-paper max-xl:fixed max-xl:bottom-0 max-xl:right-0 max-xl:top-12 max-xl:shadow-float max-sm:w-full"
    >
      {selection ? <Selected key={refKey(selection)} selection={selection} onClose={() => toggle(false)} /> : view ? <ViewSummary view={view} onClose={() => toggle(false)} /> : <ProjectSummary onClose={() => toggle(false)} />}
    </aside>
  )
}

function Header({ kind, title, icon, tone, onClose, actions }: { kind: string; title: string; icon?: React.ReactNode; tone?: string; onClose: () => void; actions?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 border-b border-rule bg-paper/95 px-4 pb-3 pt-3.5 backdrop-blur">
      <div className="flex items-center gap-2 text-[11.5px] text-ink-3">
        <span className="flex-1 truncate">{kind}</span>
        {actions}
        <button type="button" aria-label="Hide inspector" onClick={onClose} className="rounded p-1 hover:bg-sunken hover:text-ink">
          <X size={14} />
        </button>
      </div>
      <h2 className="mt-1 flex items-start gap-2 text-[17px] font-semibold leading-snug tracking-[-0.01em]">
        {icon && (
          <span className="mt-[3px] shrink-0" style={{ color: tone }}>
            {icon}
          </span>
        )}
        <span className="min-w-0 break-words">{title}</span>
      </h2>
    </div>
  )
}

function Selected({ selection, onClose }: { selection: Ref; onClose: () => void }) {
  const idx = useIndex()
  const d = idx.describe(selection)
  const entity = selection.kind === 'entity' ? idx.entities.get(selection.id) : undefined
  const style = entity ? idx.style(entity) : undefined
  const Icon = style ? iconFor(style.icon) : undefined
  return (
    <div className="fade-in">
      <Header
        kind={d.kind}
        title={d.title}
        icon={Icon ? <Icon size={17} /> : undefined}
        tone={style ? toneColor(style.tone) : undefined}
        onClose={onClose}
        actions={
          <button type="button" aria-label="Zoom to this element" title="Zoom to this element (F)" onClick={() => useStudio.getState().requestFocus('zoom', selection)} className="rounded p-1 hover:bg-sunken hover:text-ink">
            <Scan size={14} />
          </button>
        }
      />
      {bodyFor(selection)}
    </div>
  )
}

function ViewSummary({ view, onClose }: { view: View; onClose: () => void }) {
  const module = diagramFor(view)
  const idx = useIndex()
  const Legend = module?.Legend
  return (
    <div className="fade-in">
      <Header kind={`${categoryLabel(view.category)} · ${module?.label ?? 'Extension view'}`} title={view.title} onClose={onClose} />
      <Section title="What this shows">
        <Prose>{view.description}</Prose>
      </Section>
      {module && (
        <Section title="How to read it">
          <Prose>{module.howToRead}</Prose>
        </Section>
      )}
      {Legend && (
        <Section title="Key">
          <Legend view={view} />
        </Section>
      )}
      {view.type === 'extension' && (
        <Section title="Extension">
          <p className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <Puzzle size={14} className="text-ink-3" />
            Drawn by the <code className="font-mono text-[12px]">{view.extension.split('/')[0]}</code> extension.
          </p>
        </Section>
      )}
      <Section title="Try this">
        <ul className="list-disc space-y-1 pl-4 text-[12.5px] text-ink-2">
          <li>Select anything to see what it connects to and where else it appears.</li>
          <li>Double-click a name to change it; it changes in every diagram. Press F to zoom in, Esc to clear.</li>
          <li>{idx.doc.views.length > 1 ? 'Use the links in this panel to follow an element into other diagrams.' : 'Paste another model to open it.'}</li>
        </ul>
      </Section>
    </div>
  )
}

function ProjectSummary({ onClose }: { onClose: () => void }) {
  const idx = useIndex()
  const doc = idx.doc
  return (
    <div className="fade-in">
      <Header kind="Project" title={doc.project.name} onClose={onClose} />
      <Section title="About">
        <Prose>{doc.project.description}</Prose>
      </Section>
      <Section title="Document">
        <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-[12.5px]">
          <dt className="text-ink-3">Format</dt>
          <dd>Poney {doc.poneyVersion}</dd>
          <dt className="text-ink-3">Extensions</dt>
          <dd>{doc.extensions.length ? doc.extensions.map((e) => `${e.name} ${e.version}`).join(', ') : 'None'}</dd>
          {doc.project.repository && (
            <>
              <dt className="text-ink-3">Repository</dt>
              <dd className="break-all font-mono text-[11.5px]">{doc.project.repository}</dd>
            </>
          )}
        </dl>
      </Section>
    </div>
  )
}
