import { ArrowLeft, House, Moon, Sun } from 'lucide-react'
import * as RT from '@radix-ui/react-tooltip'
import { useEffect } from 'react'
import { useStudio } from '@/features/store'
import { ToolbarButton } from '@/components/shared/Toolbar'
import { WorkspacePanel } from '@/components/workspace/WorkspacePanel'

/** The address of a workspace's home page. */
export const HOME_HASH = '#/workspace'

/**
 * A workspace's own page: its folders and its documents, with a + to add
 * each. It is inside the workspace, so its agent is here; the start page,
 * outside any workspace, has none.
 */
export function WorkspaceHome() {
  const theme = useStudio((s) => s.theme)
  const workspace = useStudio((s) => s.workspace)
  const doc = useStudio((s) => s.history?.present)
  const { documents } = useStudio((s) => s.folderDocuments)
  // The document still open, when it belongs to this workspace: the way back to it.
  const back = doc && documents.some((d) => d.id === doc.project.id) ? doc : undefined
  useEffect(() => {
    if (window.location.hash !== HOME_HASH) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${HOME_HASH}`)
    document.title = `${workspace?.name ?? 'Workspace'} · Poney`
  }, [workspace?.name])
  if (!workspace) return null
  return (
    <RT.Provider delayDuration={300}>
      <div className="flex h-full flex-col bg-paper text-ink">
        <header className="flex h-12 shrink-0 items-center gap-1 border-b border-rule px-3">
          <ToolbarButton label="Start page" onClick={() => useStudio.getState().showStart(true)} side="bottom">
            <House size={16} />
          </ToolbarButton>
          <span className="ml-2 min-w-0 truncate text-[13px] font-semibold">{workspace.name}</span>
          <span className="flex-1" />
          <ToolbarButton label={theme === 'light' ? 'Dark theme' : 'Light theme'} onClick={() => useStudio.getState().toggleTheme()} side="bottom">
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </ToolbarButton>
        </header>
        <main className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[860px] px-6 pb-24 pt-14 sm:px-10">
            {back && (
              <button type="button" onClick={() => useStudio.getState().showHome(false)} className="mb-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-poney hover:underline">
                <ArrowLeft size={14} /> Back to “{back.project.name}”
              </button>
            )}
            <WorkspacePanel variant="page" />
          </div>
        </main>
      </div>
    </RT.Provider>
  )
}
