import { useEffect, useRef, useState } from 'react'
import { BookOpen, ClipboardPaste, FileText, FileUp, Folder, FolderGit2, Folders, Moon, PanelLeft, Plus, Sun, Trash2, X } from 'lucide-react'
import * as RT from '@radix-ui/react-tooltip'
import { useStudio } from '@/features/store'
import { detectFormat, importText, isTyping } from '@/features/io'
import { fileOfDocument, forgetRecent, forgetRecentWorkspace, listRecent, listRecentWorkspaces, openExample, openRecent, type Recent } from '@/features/recent'
import { newWorkspace, openProjectFolder } from '@/features/agent'
import { ToolbarButton } from '@/components/shared/Toolbar'
import { McpSetup } from '@/components/agent/McpSetup'
import { Mark } from '@/components/navigation/Sidebar'
import { ImportDialog } from '@/components/dialogs/ImportDialog'
import { MadeBy } from '@/components/shared/MadeBy'

/**
 * The start page: what shows when nothing is open. It keeps the Studio's
 * frame (top bar and sidebar), so the place feels the same before and after a
 * document opens. The sidebar lists documents: open ones, and recent ones.
 * The page offers the ways in: a file, a paste, the example, an agent.
 */
/** The address of the start page. */
export const START_HASH = '#/start'

export function StartPage() {
  const theme = useStudio((s) => s.theme)
  const live = useStudio((s) => s.live)
  const hasOpen = useStudio((s) => !!s.history)
  const projects = useStudio((s) => s.projects)
  const sidebarOpen = useStudio((s) => s.sidebarOpen)
  const [recent, setRecent] = useState<Recent[]>(() => listRecent())
  const deleting = useStudio((s) => s.deleting)
  // Closing or deleting a document changes the recent list.
  useEffect(() => setRecent(listRecent()), [projects, deleting])
  const openWorkspace = useStudio((s) => s.workspace)
  const [workspaces, setWorkspaces] = useState(() => listRecentWorkspaces())
  useEffect(() => setWorkspaces(listRecentWorkspaces()), [openWorkspace])
  const reopen = (key: string) =>
    void openProjectFolder(key).then(
      (r) => r.choose && useStudio.getState().setProjectOpen(true),
      (e: unknown) => setProblem({ title: 'The workspace does not open', lines: [e instanceof Error ? e.message : String(e), 'Its folder or file may have moved. Remove it from the list.'] }),
    )
  const [problem, setProblem] = useState<{ title: string; lines: string[] } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    // The diagrams (@hattoriai/poney-diagrams) follow the same theme.
    document.documentElement.dataset.poneyTheme = theme
    document.title = 'Poney Studio'
  }, [theme])

  // The start page has its own address; leaving it, the document writes its own again.
  useEffect(() => {
    if (window.location.hash !== START_HASH) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${START_HASH}`)
  }, [])

  const open = (text: string, origin: 'pasted' | 'imported', from: string) => {
    const result = importText(text)
    if (!result.ok) return setProblem({ title: `${from} is not a Poney document`, lines: result.issues.slice(0, 6).map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)) })
    setProblem(null)
    useStudio.getState().loadDocument(result.doc, origin)
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || useStudio.getState().importOpen) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!text.trim()) return
      e.preventDefault()
      if (detectFormat(text).kind === 'unknown') return setProblem({ title: 'The clipboard has no Poney document', lines: ['Copy Poney JSON (it has "poneyVersion") or a Mermaid diagram, then paste again.'] })
      open(text, 'pasted', 'The pasted text')
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const readFile = async (f: File) => open(await f.text(), 'imported', `“${f.name}”`)
  const example = async () => {
    setLoading(true)
    try {
      await openExample()
    } catch (e) {
      setProblem({ title: 'The example did not open', lines: [e instanceof Error ? e.message : String(e)] })
    } finally {
      setLoading(false)
    }
  }

  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'
  // With Poney on this computer, files open from the disk and stay saved; without it, the browser reads a copy.
  const chooseFile = () => (live.state === 'on' ? useStudio.getState().setFileOpen(true) : file.current?.click())
  const row = 'group flex w-full items-start gap-4 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-sunken/70 focus-visible:bg-sunken/70 outline-none'

  const openRecentItem = (r: Recent) => {
    const s = useStudio.getState()
    if (s.history && s.projectId === r.id) return s.showStart(false)
    void openRecent(r).then((ok) => ok || setProblem({ title: `“${r.name}” no longer opens`, lines: ['It may come from an older version of Poney, or its file moved. Remove it from the list.'] }))
  }
  // The example is reached only from "Try the example": it is never listed as a document.
  const documents = projects.filter((p) => p.origin !== 'example')
  const others = recent.filter((r) => r.origin !== 'example' && !projects.some((p) => p.id === r.id))
  const navItem = 'flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13.5px] hover:bg-sunken'

  return (
    <RT.Provider>
    <div className="flex h-full flex-col bg-plaster text-ink">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-rule bg-paper px-2">
        <ToolbarButton label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} onClick={() => useStudio.getState().toggleSidebar()} side="bottom">
          <PanelLeft size={16} />
        </ToolbarButton>
        <span className="ml-2 text-[13px] font-semibold">Start</span>
        <span className="flex-1" />
        <ToolbarButton label={theme === 'light' ? 'Dark theme' : 'Light theme'} onClick={() => useStudio.getState().toggleTheme()} side="bottom">
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </ToolbarButton>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Documents"
          className={`scrollbar-quiet flex w-[264px] shrink-0 flex-col overflow-y-auto border-r border-rule bg-paper transition-[margin] duration-200 max-lg:hidden ${sidebarOpen ? 'ml-0' : '-ml-[264px]'}`}
        >
          <div className="flex items-center gap-2.5 p-3.5">
            <Mark />
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-semibold">Poney Studio</span>
              <span className="block truncate text-[11.5px] text-ink-3">{documents.length ? `${documents.length} open` : 'Nothing open'}</span>
            </span>
          </div>
          <div className="px-2">
            <button type="button" className={`${navItem} text-ink-2`} onClick={chooseFile}>
              <FileUp size={14} className="shrink-0 text-ink-3" /> Open a file…
            </button>
          </div>
          {documents.length > 0 && (
            <nav aria-label="Open documents" className="mt-4 px-2">
              <h2 className="px-2 pb-1 text-[11.5px] font-medium text-ink-3">Open</h2>
              {documents.map((p) => (
                <div key={p.id} className="group relative">
                  <button type="button" className={`${navItem} ${live.state === 'on' ? 'pr-14' : 'pr-8'}`} onClick={() => (p.id === useStudio.getState().projectId ? useStudio.getState().showStart(false) : useStudio.getState().switchProject(p.id))}>
                    <FileText size={14} className="shrink-0 text-ink-3" />
                    <span className="truncate">{p.doc.project.name}</span>
                  </button>
                  <ItemActions id={p.id} name={p.doc.project.name} onClose={() => useStudio.getState().closeDocument(p.id)} closeLabel="Close" />
                </div>
              ))}
            </nav>
          )}
          {live.state === 'on' && workspaces.length > 0 && (
            <nav aria-label="Recent workspaces" className="mt-4 px-2">
              <h2 className="px-2 pb-1 text-[11.5px] font-medium text-ink-3">Workspaces</h2>
              {workspaces.map((w) => (
                <div key={w.key} className="group relative">
                  <button type="button" className={`${navItem} pr-8`} onClick={() => reopen(w.key)} title={w.file ?? w.key}>
                    {w.folders.length > 1 ? <Folders size={14} className="shrink-0 text-ink-3" /> : <Folder size={14} className="shrink-0 text-ink-3" />}
                    <span className="min-w-0">
                      <span className="block truncate">{w.name}</span>
                      <span className="block truncate text-[11.5px] text-ink-3">
                        {w.key.startsWith('document:') ? 'Document with a folder' : w.folders.length !== 1 ? `${w.folders.length} folders` : 'Folder'}
                        {w.key.startsWith('untitled:') ? ', not saved' : ''}, {when(w.at)}
                      </span>
                    </span>
                    {openWorkspace?.key === w.key && <span className="ml-auto shrink-0 text-[11px] text-ink-3">Open</span>}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove from the list: ${w.name}`}
                    title="Remove from the list"
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-ink-4 opacity-0 hover:bg-raised hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                    onClick={() => {
                      forgetRecentWorkspace(w.key)
                      setWorkspaces(listRecentWorkspaces())
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </nav>
          )}
          {others.length > 0 && (
            <nav aria-label="Recent documents" className="mt-4 px-2 pb-4">
              <h2 className="px-2 pb-1 text-[11.5px] font-medium text-ink-3">Recent</h2>
              {others.map((r) => (
                <div key={r.id} className="group relative">
                  <button type="button" className={`${navItem} ${live.state === 'on' && r.path ? 'pr-14' : 'pr-8'}`} onClick={() => openRecentItem(r)} title={`${r.name}, ${when(r.at)}`}>
                    <FileText size={14} className="shrink-0 text-ink-3" />
                    <span className="min-w-0">
                      <span className="block truncate">{r.name}</span>
                      <span className="block truncate text-[11.5px] text-ink-3">{r.origin === 'example' ? 'Example' : r.origin === 'live' ? 'From an agent' : r.origin === 'pasted' ? 'Pasted' : 'File'}, {when(r.at)}</span>
                    </span>
                  </button>
                  <ItemActions
                    id={r.id}
                    name={r.name}
                    closeLabel="Remove from the list"
                    onClose={() => {
                      forgetRecent(r.id)
                      setRecent(listRecent())
                    }}
                  />
                </div>
              ))}
            </nav>
          )}
          <MadeBy />
        </aside>
    <div
      className="scrollbar-quiet relative min-w-0 flex-1 overflow-y-auto bg-paper text-ink"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) void readFile(f)
      }}
    >
      <main className="mx-auto grid max-w-[1080px] gap-x-14 gap-y-12 px-6 pb-20 pt-14 sm:px-10 sm:pt-20 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div>
          <p className="text-[14px] font-semibold text-poney">Poney Studio</p>
          <h1 className="mt-3 max-w-[18ch] text-[36px] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[44px]">Software, explained in diagrams.</h1>
          <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-ink-2">An agent writes walkthroughs of a change, or tours of a codebase. You read them here, explore the system, and ask the agent questions.</p>

          {hasOpen && (
            <button type="button" onClick={() => useStudio.getState().showStart(false)} className="mt-6 text-[14px] font-semibold text-poney hover:underline">
              Back to “{useStudio.getState().history.present.project.name}”
            </button>
          )}

          <section aria-labelledby="open" className="mt-12">
            <h2 id="open" className="px-4 text-[13px] font-semibold text-ink-3">
              Open
            </h2>
            <div className="mt-2">
              {live.state === 'on' && (
                <>
                  <button type="button" className={row} onClick={() => void newWorkspace().catch((e: unknown) => setProblem({ title: 'No new workspace', lines: [e instanceof Error ? e.message : String(e)] }))}>
                    <Plus size={19} className="mt-0.5 shrink-0 text-ink-2" />
                    <span>
                      <span className="block text-[15.5px] font-semibold">New workspace</span>
                      <span className="mt-0.5 block text-[13.5px] text-ink-3">Blank. Then add the folders with the code, and documents.</span>
                    </span>
                  </button>
                  <button type="button" className={row} onClick={() => useStudio.getState().setProjectOpen(true)}>
                    <FolderGit2 size={19} className="mt-0.5 shrink-0 text-ink-2" />
                    <span>
                      <span className="block text-[15.5px] font-semibold">Open a workspace</span>
                      <span className="mt-0.5 block text-[13.5px] text-ink-3">A .poney-workspace file, or a folder with its Poney documents.</span>
                    </span>
                  </button>
                </>
              )}
              <button type="button" className={row} onClick={chooseFile}>
                <FileUp size={19} className="mt-0.5 shrink-0 text-ink-2" />
                <span>
                  <span className="block text-[15.5px] font-semibold">Open a file</span>
                  <span className="mt-0.5 block text-[13.5px] text-ink-3">A .poney or Mermaid file. You can also drop it here.</span>
                </span>
              </button>
              <button type="button" className={row} onClick={() => useStudio.getState().setImportOpen(true)}>
                <ClipboardPaste size={19} className="mt-0.5 shrink-0 text-ink-2" />
                <span>
                  <span className="block text-[15.5px] font-semibold">Paste a document</span>
                  <span className="mt-0.5 block text-[13.5px] text-ink-3">
                    Poney JSON or Mermaid. Or press <kbd className="rounded border border-rule bg-raised px-1 font-sans text-[12px]">{mod}V</kbd> anywhere on this page.
                  </span>
                </span>
              </button>
              <button type="button" className={row} onClick={() => void example()} disabled={loading}>
                <BookOpen size={19} className="mt-0.5 shrink-0 text-ink-2" />
                <span>
                  <span className="block text-[15.5px] font-semibold">{loading ? 'Opening the example…' : 'Try the example'}</span>
                  <span className="mt-0.5 block text-[13.5px] text-ink-3">Kestrel Commerce, an online store: a walkthrough of one change, and a tour of the code.</span>
                </span>
              </button>
            </div>
            <input
              ref={file}
              type="file"
              accept=".poney,.json,.mmd,.mermaid,.txt,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void readFile(f)
                e.target.value = ''
              }}
            />
            {problem && (
              <div role="alert" className="mx-4 mt-4 rounded-xl border border-removed/40 bg-removed-wash px-4 py-3">
                <p className="text-[14px] font-semibold text-removed">{problem.title}</p>
                <ul className="mt-1.5 space-y-0.5 font-mono text-[12px] text-ink-2">
                  {problem.lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

        </div>

        <aside aria-labelledby="agent" className="xl:pt-[164px]">
          <div className="rounded-2xl border border-rule bg-raised px-5 py-5">
            <h2 id="agent" className="text-[15.5px] font-semibold">
              Agent
            </h2>
            <AgentCard />
          </div>
        </aside>
      </main>

      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-3xl border-2 border-dashed border-poney bg-poney-wash/80">
          <p className="text-[18px] font-semibold text-poney">Drop to open</p>
        </div>
      )}
    </div>
      </div>
    </div>
    <ImportDialog />
    </RT.Provider>
  )
}

function when(iso: string) {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** The agent as it is now: connected, linked from a terminal, or neither. One fact, one action. */
function AgentCard() {
  const live = useStudio((s) => s.live.state === 'on')
  const workspace = useStudio((s) => s.workspace)
  const code = 'mt-1.5 block break-all rounded-lg bg-sunken px-2.5 py-2 font-mono text-[11.5px] text-ink'
  // The start page is outside any workspace: the agent is inside one, so it is not asked from here.
  if (live)
    return (
      <div className="mt-3 text-[14px] leading-snug text-ink-2">
        <p>An agent works inside a workspace and reads its folders. Open a workspace, then ask it about the code.</p>
        {workspace && (
          <button type="button" onClick={() => useStudio.getState().showHome(true)} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-3.5 text-[13.5px] font-semibold text-paper hover:opacity-90">
            Go to {workspace.name}
          </button>
        )}
        <p className="mt-4 border-t border-rule pt-4 text-[13px] font-semibold text-ink">Or use the agent in your terminal</p>
        <div className="mt-2">
          <McpSetup />
        </div>
      </div>
    )
  return (
    <div className="mt-3 text-[14px] leading-snug text-ink-2">
      <p>Agents need Poney running on this computer. In the Poney folder, run:</p>
      <code className={code}>npm run studio</code>
      <p className="mt-4 border-t border-rule pt-4 text-[13px] font-semibold text-ink">Or use the one in your terminal</p>
      <div className="mt-2">
        <McpSetup />
      </div>
    </div>
  )
}


/** The buttons on a document in the sidebar: delete its file (when Poney on this computer keeps it), and close or remove it. */
function ItemActions({ id, name, closeLabel, onClose }: { id: string; name: string; closeLabel: string; onClose(): void }) {
  useStudio((s) => s.live.state)
  const path = fileOfDocument(id)
  const button = 'rounded p-1 text-ink-4 hover:bg-raised hover:text-ink'
  return (
    <span className="absolute right-1 top-1/2 flex -translate-y-1/2 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
      {path && (
        <button type="button" aria-label={`Delete the file of ${name}`} title="Delete file…" className={`${button} hover:text-removed`} onClick={() => useStudio.getState().setDeleting({ id, name, path })}>
          <Trash2 size={13} />
        </button>
      )}
      <button type="button" aria-label={`${closeLabel}: ${name}`} title={closeLabel} className={button} onClick={onClose}>
        <X size={13} />
      </button>
    </span>
  )
}
