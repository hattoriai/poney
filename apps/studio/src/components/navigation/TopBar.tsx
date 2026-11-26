import { plainText } from '@poney/core'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ClipboardCopy,
  Download,
  FileInput,
  Keyboard,
  Moon,
  PanelLeft,
  PanelRight,
  Redo2,
  Undo2,
  Search,
  Share,
  Star,
  Sun,
} from 'lucide-react'
import { OVERVIEW, useIndex, useStudio, walkId } from '@/features/store'
import { copyDocument, downloadDocument } from '@/features/io'
import { ToolbarButton } from '@/components/shared/Toolbar'
import { diagramFor } from '@/renderers/registry'
import { categoryLabel } from './categories'

export function TopBar() {
  const idx = useIndex()
  const s = useStudio()
  const view = s.viewId === OVERVIEW ? undefined : idx.views.get(s.viewId)
  const walkthrough = idx.doc.walkthroughs.find((w) => w.id === walkId(s.viewId))
  const module = view ? diagramFor(view) : undefined
  const selected = s.selection ? idx.describe(s.selection) : undefined
  const pinned = view ? s.pinned.includes(view.id) : false

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-rule bg-paper px-2">
      <ToolbarButton label={s.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} shortcut="[" onClick={() => s.toggleSidebar()} side="bottom" active={false}>
        <PanelLeft size={16} />
      </ToolbarButton>
      <ToolbarButton label="Back" shortcut="⌥←" onClick={s.goBack} disabled={s.back.length === 0} side="bottom">
        <ArrowLeft size={16} />
      </ToolbarButton>
      <span className="hidden sm:contents">
        <ToolbarButton label="Forward" shortcut="⌥→" onClick={s.goForward} disabled={s.forward.length === 0} side="bottom">
          <ArrowRight size={16} />
        </ToolbarButton>
      </span>

      <nav aria-label="Breadcrumb" className="ml-2 flex min-w-0 items-center gap-1.5 text-[13px]">
        <button type="button" className={`truncate rounded px-1 text-ink-2 hover:text-ink ${view || walkthrough ? 'hidden sm:inline' : ''}`} onClick={() => s.navigate(OVERVIEW)}>
          {idx.doc.project.name}
        </button>
        {walkthrough && (
          <>
            <Slash className="hidden sm:inline" />
            <span className="hidden text-ink-3 sm:inline">Walkthrough</span>
            <Slash className="hidden sm:inline" />
            <span className="truncate font-semibold text-ink">{plainText(walkthrough.title)}</span>
          </>
        )}
        {view && (
          <>
            <Slash className="hidden sm:inline" />
            <span className="hidden truncate text-ink-3 sm:inline">{categoryLabel(view.category)}</span>
            <Slash className="hidden sm:inline" />
            <span className="flex min-w-0 items-center gap-1.5 font-semibold text-ink">
              {module && <module.icon size={14} className="shrink-0 text-ink-3" aria-hidden />}
              <span className="truncate">{view.title}</span>
            </span>
          </>
        )}
        {selected && !walkthrough && (
          <>
            <Slash className="hidden md:inline" />
            <button
              type="button"
              className="hidden max-w-[220px] truncate rounded px-1 text-poney hover:underline md:inline"
              onClick={() => s.selection && s.requestFocus('zoom', s.selection)}
              title="Zoom to the selection"
            >
              {selected.title}
            </button>
          </>
        )}
        {view && (
          <span className="hidden sm:contents">
          <ToolbarButton label={pinned ? 'Unpin this diagram' : 'Pin this diagram'} onClick={() => s.togglePin(view.id)} active={pinned} side="bottom">
            <Star size={14} fill={pinned ? 'currentColor' : 'none'} />
          </ToolbarButton>
          </span>
        )}
      </nav>

      <div className="flex-1" />

      <SaveState />
      <ToolbarButton label="Undo" shortcut="⌘Z" onClick={s.undo} disabled={!s.history.past.length} side="bottom">
        <Undo2 size={16} />
      </ToolbarButton>
      <ToolbarButton label="Redo" shortcut="⇧⌘Z" onClick={s.redo} disabled={!s.history.future.length} side="bottom">
        <Redo2 size={16} />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-rule" aria-hidden />
      <LivePill />

      <button
        type="button"
        onClick={() => s.setPaletteOpen(true)}
        className="mr-1 hidden h-8 w-64 items-center gap-2 rounded-lg border border-rule bg-plaster px-2.5 text-left text-ink-3 transition-colors hover:border-rule-strong hover:text-ink-2 md:flex"
      >
        <Search size={14} />
        <span className="flex-1">Search this document</span>
        <kbd className="rounded border border-rule bg-raised px-1 text-[11px]">⌘K</kbd>
      </button>
      <span className="md:hidden">
        <ToolbarButton label="Search" shortcut="⌘K" onClick={() => s.setPaletteOpen(true)} side="bottom">
          <Search size={16} />
        </ToolbarButton>
      </span>

      <span className="hidden sm:contents">
        <ToolbarButton label="Open or paste a model" onClick={() => s.setImportOpen(true)} side="bottom">
          <FileInput size={16} />
        </ToolbarButton>
        <ExportMenu />
        <ToolbarButton label={s.theme === 'light' ? 'Dark theme' : 'Light theme'} onClick={s.toggleTheme} side="bottom">
          {s.theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </ToolbarButton>
        <ToolbarButton label="Keyboard shortcuts" shortcut="?" onClick={() => s.setShortcutsOpen(true)} side="bottom">
          <Keyboard size={16} />
        </ToolbarButton>
      </span>
      <ToolbarButton label={s.inspectorOpen ? 'Hide inspector' : 'Show inspector'} shortcut="]" onClick={() => s.toggleInspector()} side="bottom">
        <PanelRight size={16} />
      </ToolbarButton>
    </header>
  )
}

function Slash({ className = '' }: { className?: string }) {
  return (
    <span className={`text-ink-4 ${className}`} aria-hidden>
      /
    </span>
  )
}

function ExportMenu() {
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
  const item = 'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-sunken'
  return (
    <div className="relative" ref={box}>
      <ToolbarButton label="Export the model" onClick={() => setOpen(!open)} active={open} side="bottom">
        <Share size={16} />
      </ToolbarButton>
      {open && (
        <div role="menu" className="fade-in absolute right-0 top-10 z-40 w-64 rounded-xl border border-rule bg-raised p-1 shadow-float">
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false)
              void copyDocument()
            }}
          >
            <ClipboardCopy size={15} className="text-ink-3" />
            <span className="flex-1">Copy JSON</span>
            <kbd className="text-[11px] text-ink-3">⇧⌘C</kbd>
          </button>
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false)
              downloadDocument()
            }}
          >
            <Download size={15} className="text-ink-3" />
            <span className="flex-1">Download .poney</span>
          </button>
          <p className="px-2.5 pb-1.5 pt-1 text-[11.5px] leading-snug text-ink-3">Paste Poney JSON or Mermaid anywhere in the studio to open it.</p>
        </div>
      )}
    </div>
  )
}

/** Shows whether an agent session is linked to this window. */
/**
 * Where changes go. With Poney on this computer, each change is saved to the
 * document's file at once; otherwise they stay in this browser.
 */
function SaveState() {
  const file = useStudio((s) => (s.live.state === 'on' ? s.liveFile : null))
  const edited = useStudio((s) => s.history.past.length > 0 || s.history.future.length > 0)
  if (!edited) return null
  return (
    <span className="mr-1 hidden text-[12px] text-ink-3 lg:inline" title={file ? `Every change is saved to ${file}. Undo goes back one change at a time.` : 'Changes are kept in this browser. Use Download to keep a file.'}>
      {file ? `Saved to ${file.split('/').pop()}` : 'Kept in this browser'}
    </span>
  )
}

function LivePill() {
  const live = useStudio((s) => s.live)
  if (live.state === 'off') return null
  const on = live.state === 'on'
  const label = on ? 'Live' : live.state === 'connecting' ? 'Connecting' : 'Offline'
  return (
    <span
      title={
        on
          ? 'Linked to Poney on this computer: agents can open documents here, you can talk to them, and documents are saved to their files.'
          : 'Poney on this computer does not answer. Agents and saving to files are off until it is back.'
      }
      className={`mr-2 hidden items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold sm:inline-flex ${on ? 'border-new/40 bg-new-wash text-new' : 'border-rule text-ink-3'}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-new' : 'bg-ink-4'}`} />
      {label}
    </span>
  )
}
