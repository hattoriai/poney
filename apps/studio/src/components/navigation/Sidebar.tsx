import { plainText } from '@poney/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenText, Check, FolderGit2, ChevronDown, ChevronRight, FileInput, House, LayoutGrid, Search, Star } from 'lucide-react'
import type { Entity, View } from '@poney/core'
import { OVERVIEW, useIndex, useStudio } from '@/features/store'
import { revealRef } from '@/features/navigation'
import { diagramFor } from '@/renderers/registry'
import { iconFor } from '@/renderers/shared/icons'
import { toneColor } from '@/renderers/shared/tone'
import { categoryLabel, orderCategories } from './categories'

export function Sidebar() {
  const open = useStudio((s) => s.sidebarOpen)
  const toggle = useStudio((s) => s.toggleSidebar)
  return (
    <>
      {open && <div className="fixed inset-0 z-20 bg-ink/20 lg:hidden" onClick={() => toggle(false)} aria-hidden />}
      <aside
        aria-label="Project navigation"
        className={`scrollbar-quiet z-30 flex w-[264px] shrink-0 flex-col overflow-y-auto border-r border-rule bg-paper transition-[margin] duration-200 max-lg:fixed max-lg:bottom-0 max-lg:top-12 max-lg:shadow-float ${
          open ? 'ml-0' : '-ml-[264px] max-lg:invisible'
        }`}
      >
        <ProjectSwitcher />
        <div className="px-2 pb-1">
          <button
            type="button"
            onClick={() => useStudio.getState().setPaletteOpen(true)}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-ink-3 hover:bg-sunken hover:text-ink-2"
          >
            <Search size={14} />
            <span className="flex-1 text-left">Search</span>
            <kbd className="text-[11px]">/</kbd>
          </button>
        </div>
        <ViewNav />
        <SystemTree />
      </aside>
    </>
  )
}

function ProjectSwitcher() {
  const projects = useStudio((s) => s.projects)
  const projectId = useStudio((s) => s.projectId)
  const idx = useIndex()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className="relative p-2" ref={box}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-sunken"
      >
        <Mark />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold">{idx.doc.project.name}</span>
          <SavedTo fallback={`Poney ${idx.doc.poneyVersion}`} />
        </span>
        <ChevronDown size={14} className="text-ink-3" />
      </button>
      {open && (
        <div role="listbox" aria-label="Projects" className="fade-in absolute left-2 right-2 top-14 z-40 rounded-xl border border-rule bg-raised p-1 shadow-float">
          {projects.map((p) => (
            <button
              key={p.id}
              role="option"
              aria-selected={p.id === projectId}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-sunken"
              onClick={() => {
                setOpen(false)
                useStudio.getState().switchProject(p.id)
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.doc.project.name}</span>
                <span className="block text-[11.5px] text-ink-3">{p.origin === 'example' ? 'Example' : p.origin === 'pasted' ? 'Pasted' : 'Imported'}</span>
              </span>
              {p.id === projectId && <Check size={14} className="text-poney" />}
            </button>
          ))}
          <div className="my-1 h-px bg-rule" />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-ink-2 hover:bg-sunken"
            onClick={() => {
              setOpen(false)
              useStudio.getState().setImportOpen(true)
            }}
          >
            <FileInput size={14} />
            Open or paste a model…
          </button>
          {useStudio.getState().live.state === 'on' && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-ink-2 hover:bg-sunken"
              onClick={() => {
                setOpen(false)
                useStudio.getState().setProjectOpen(true)
              }}
            >
              <FolderGit2 size={14} />
              Open a project…
            </button>
          )}
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-ink-2 hover:bg-sunken"
            onClick={() => {
              setOpen(false)
              useStudio.getState().showStart(true)
            }}
          >
            <House size={14} />
            Start page
          </button>
        </div>
      )}
    </div>
  )
}

/** The Poney mark: one drawn stroke. */
/** Where the open document is saved, when Poney on this computer keeps it in a file. */
function SavedTo({ fallback }: { fallback: string }) {
  const file = useStudio((s) => (s.live.state === 'on' ? s.liveFile : null))
  if (!file) return <span className="block truncate text-[11.5px] text-ink-3">{fallback}</span>
  const short = file.split('/').slice(-3).join('/')
  return (
    <span className="block truncate text-[11.5px] text-ink-3" title={`Saved to ${file}`}>
      Saved to {short}
    </span>
  )
}

/** Poney's mark: a P drawn as a diagram, a stem and a bowl joining three nodes with the foot in the accent colour, on an ink tile. */
export function Mark() {
  return (
    <svg width="30" height="30" viewBox="-22 -18 156 152" aria-hidden className="shrink-0">
      <rect x="-22" y="-18" width="156" height="152" rx="36" fill="var(--ink)" />
      <path d="M40 26V86M40 26H62A17 17 0 0 1 62 60H40" fill="none" stroke="var(--paper)" strokeWidth="6" strokeLinejoin="round" />
      <rect x="28" y="16" width="24" height="20" rx="5" fill="var(--paper)" />
      <rect x="28" y="50" width="24" height="20" rx="5" fill="var(--paper)" />
      <rect x="28" y="76" width="24" height="20" rx="5" fill="var(--poney)" />
    </svg>
  )
}

function NavItem({ view, active }: { view: View; active: boolean }) {
  const module = diagramFor(view)
  const Icon = module?.icon ?? LayoutGrid
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={() => useStudio.getState().navigate(view.id)}
      className={`group flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors ${
        active ? 'bg-sunken font-semibold text-ink' : 'text-ink-2 hover:bg-sunken/70 hover:text-ink'
      }`}
      title={view.description}
    >
      <Icon size={15} className={active ? 'text-poney' : 'text-ink-3 group-hover:text-ink-2'} aria-hidden />
      <span className="truncate">{view.title}</span>
    </button>
  )
}

function ViewNav() {
  const idx = useIndex()
  const viewId = useStudio((s) => s.viewId)
  const pinned = useStudio((s) => s.pinned)
  const categories = orderCategories([...new Set(idx.doc.views.map((v) => v.category))]).filter((c) => c !== 'walkthrough')
  const pinnedViews = pinned.map((id) => idx.views.get(id)).filter((v): v is View => !!v)
  return (
    <nav aria-label="Diagrams" className="px-2">
      <button
        type="button"
        aria-current={viewId === OVERVIEW ? 'page' : undefined}
        onClick={() => useStudio.getState().navigate(OVERVIEW)}
        className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left ${viewId === OVERVIEW ? 'bg-sunken font-semibold' : 'text-ink-2 hover:bg-sunken/70 hover:text-ink'}`}
      >
        <LayoutGrid size={15} className={viewId === OVERVIEW ? 'text-poney' : 'text-ink-3'} />
        Project overview
      </button>
      {idx.doc.walkthroughs.length > 0 && (
        <Section title="Walkthroughs">
          {idx.doc.walkthroughs.map((w) => {
            const here = viewId === `walk:${w.id}`
            return (
              <button
                key={w.id}
                type="button"
                aria-current={here ? 'page' : undefined}
                onClick={() => useStudio.getState().navigate(`walk:${w.id}`)}
                className={`group flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${here ? 'bg-sunken font-semibold text-ink' : 'text-ink-2 hover:bg-sunken/70 hover:text-ink'}`}
              >
                <BookOpenText size={15} className={`mt-[2px] shrink-0 ${here ? 'text-poney' : 'text-ink-3'}`} aria-hidden />
                <span className="leading-snug">{plainText(w.title)}</span>
              </button>
            )
          })}
        </Section>
      )}
      {pinnedViews.length > 0 && (
        <Section title="Pinned" icon={<Star size={11} className="text-ink-3" />}>
          {pinnedViews.map((v) => (
            <NavItem key={`pin-${v.id}`} view={v} active={false} />
          ))}
        </Section>
      )}
      {categories.map((c) => (
        <Section key={c} title={categoryLabel(c)}>
          {idx.doc.views
            .filter((v) => v.category === c)
            .map((v) => (
              <NavItem key={v.id} view={v} active={v.id === viewId} />
            ))}
        </Section>
      ))}
    </nav>
  )
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h2 className="mb-1 flex items-center gap-1.5 px-2 text-[11.5px] font-semibold text-ink-3">
        {icon}
        {title}
      </h2>
      <div className="space-y-px">{children}</div>
    </div>
  )
}

/** The system as a tree: what contains what, plus people and outside systems. */
function SystemTree() {
  const idx = useIndex()
  const roots = useMemo(() => idx.doc.model.entities.filter((e) => !e.parent && !e.kind.includes('/')), [idx])
  const groups = [
    { title: 'System', items: roots.filter((e) => e.kind !== 'person' && e.kind !== 'external') },
    { title: 'People', items: roots.filter((e) => e.kind === 'person') },
    { title: 'Outside services', items: roots.filter((e) => e.kind === 'external') },
  ].filter((g) => g.items.length)
  return (
    <div className="mt-2 px-2 pb-6">
      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          <ul role="tree" aria-label={g.title}>
            {g.items.map((e) => (
              <TreeNode key={e.id} entity={e} depth={0} />
            ))}
          </ul>
        </Section>
      ))}
    </div>
  )
}

function TreeNode({ entity, depth }: { entity: Entity; depth: number }) {
  const idx = useIndex()
  const selection = useStudio((s) => s.selection)
  const kids = idx.children(entity.id)
  const [open, setOpen] = useState(depth === 0)
  const style = idx.style(entity)
  const Icon = iconFor(style.icon)
  const selected = selection?.kind === 'entity' && selection.id === entity.id
  return (
    <li role="treeitem" aria-expanded={kids.length ? open : undefined} aria-selected={selected}>
      <div className={`flex h-7 items-center rounded-md ${selected ? 'bg-poney-wash' : 'hover:bg-sunken/70'}`} style={{ paddingLeft: depth * 14 }}>
        {kids.length ? (
          <button type="button" aria-label={open ? `Close ${entity.name}` : `Open ${entity.name}`} className="grid h-6 w-5 place-items-center text-ink-3 hover:text-ink" onClick={() => setOpen(!open)}>
            <ChevronRight size={13} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-5" />
        )}
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 pr-2 text-left" onClick={() => revealRef({ kind: 'entity', id: entity.id })} title={entity.summary}>
          <Icon size={13} style={{ color: toneColor(style.tone) }} className="shrink-0" aria-hidden />
          <span className={`truncate text-[12.5px] ${selected ? 'font-semibold text-poney' : 'text-ink-2'}`}>{entity.name}</span>
        </button>
      </div>
      {open && kids.length > 0 && (
        <ul role="group">
          {kids.map((k) => (
            <TreeNode key={k.id} entity={k} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
