import { useEffect } from 'react'
import * as RT from '@radix-ui/react-tooltip'
import { refKey, plainText } from '@poney/core'
import { OVERVIEW, useIndex, useStudio, walkId } from '@/features/store'
import { installPasteHandler, isTyping, copyDocument } from '@/features/io'
import { startRename } from '@/features/rename'
import { writeLocation } from '@/features/location'
import { TopBar } from '@/components/navigation/TopBar'
import { Sidebar } from '@/components/navigation/Sidebar'
import { Inspector } from '@/components/inspector/Inspector'
import { DiagramStage } from '@/components/canvas/DiagramStage'
import { Overview } from '@/components/overview/Overview'
import { CommandPalette } from '@/components/dialogs/CommandPalette'
import { ImportDialog } from '@/components/dialogs/ImportDialog'
import { ShortcutsDialog } from '@/components/dialogs/ShortcutsDialog'
import { Notice } from '@/components/shared/Notice'
import { WalkthroughPage } from '@/story/WalkthroughPage'

export function App() {
  const theme = useStudio((s) => s.theme)
  const viewId = useStudio((s) => s.viewId)
  const selection = useStudio((s) => s.selection)
  const idx = useIndex()
  const view = viewId === OVERVIEW ? undefined : idx.views.get(viewId)
  const walkthrough = idx.doc.walkthroughs.find((w) => w.id === walkId(viewId))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    // The diagrams (@poney/react) follow the same theme.
    document.documentElement.dataset.poneyTheme = theme
  }, [theme])

  useEffect(() => writeLocation(viewId, selection, selection ? refKey(selection) : null), [viewId, selection])

  useEffect(() => {
    const project = idx.doc.project.name
    const page = (walkthrough ? plainText(walkthrough.title) : undefined) ?? view?.title
    document.title = page && page !== project ? `${page} · ${project} · Poney` : `${project} · Poney`
  }, [view, walkthrough, idx.doc.project.name])

  useEffect(() => installPasteHandler(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStudio.getState()
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        s.setPaletteOpen(!s.paletteOpen)
        return
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        void copyDocument()
        return
      }
      if (isTyping(e.target) || s.paletteOpen || s.importOpen || s.shortcutsOpen) return
      if (e.key === 'F2' && s.selection) {
        const el = document.querySelector(`[data-ref="${CSS.escape(refKey(s.selection))}"]`)
        if (el && startRename(s.selection, el)) return void e.preventDefault()
      }
      // Undo and redo changes to the document (an edited text, a moved box). Typing in a field has its own undo.
      if (mod && e.key.toLowerCase() === 'z') return void (e.preventDefault(), e.shiftKey ? s.redo() : s.undo())
      if (mod && e.key.toLowerCase() === 'y') return void (e.preventDefault(), s.redo())
      if (e.altKey && e.key === 'ArrowLeft') return void (e.preventDefault(), s.goBack())
      if (e.altKey && e.key === 'ArrowRight') return void (e.preventDefault(), s.goForward())
      if (mod || e.altKey) return
      switch (e.key) {
        case '/':
          e.preventDefault()
          s.setPaletteOpen(true)
          break
        case '[':
          s.toggleSidebar()
          break
        case ']':
          s.toggleInspector()
          break
        case 'Escape':
          if (s.selection) s.select(null)
          break
        case 'f':
        case 'F':
          if (s.selection) s.requestFocus('zoom', s.selection)
          break
        case '!':
          s.requestFocus('fit')
          break
        case ')':
          s.requestFocus('reset')
          break
        case '?':
          s.setShortcutsOpen(true)
          break
        case 'o':
          s.navigate(OVERVIEW)
          break
        default:
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <RT.Provider>
      <div className="flex h-full flex-col bg-plaster text-ink">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-raised focus:px-3 focus:py-2">
          Skip to diagram
        </a>
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main id="main" className="relative min-w-0 flex-1" aria-label={walkthrough ? `Walkthrough: ${plainText(walkthrough.title)}` : view ? `${view.title} diagram` : 'Project overview'}>
            {walkthrough ? <WalkthroughPage key={walkthrough.id} walkthrough={walkthrough} /> : view ? <DiagramStage key={view.id} view={view} /> : <Overview />}
          </main>
          {!walkthrough && <Inspector />}
        </div>
      </div>
      <CommandPalette />
      <ImportDialog />
      <ShortcutsDialog />
      <Notice />
    </RT.Provider>
  )
}
