import { useEffect, useState } from 'react'
import { ArrowUp, FileText, Folder as FolderIcon, GitBranch } from 'lucide-react'
import { listFolders, type Folder } from '@/features/agent'

/**
 * Folders on this computer, one level at a time, like Livebook's file
 * browser. Git repositories are marked. With `onPickFolder`, a folder can be
 * chosen; with `onOpenFile`, the .poney files in it are listed and open on a
 * click.
 */
export function FileBrowser({ start, onPickFolder, onOpenFile }: { start?: string; onPickFolder?(path: string): void; onOpenFile?(path: string): void }) {
  const [dir, setDir] = useState<Folder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const go = (path?: string) =>
    listFolders(path)
      .then((d) => {
        setDir(d)
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  useEffect(() => {
    void go(start)
    // Only the first folder: later moves are the person's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (error) return <p className="text-[12.5px] text-removed">{error}</p>
  if (!dir) return <p className="text-[12.5px] text-ink-3">Reading folders…</p>
  const files = onOpenFile ? dir.files : []
  return (
    <div className="overflow-hidden rounded-xl border border-rule">
      <div className="flex items-center gap-2 border-b border-rule bg-sunken/50 px-2 py-1.5">
        <button type="button" aria-label="Up one folder" disabled={!dir.parent} onClick={() => void go(dir.parent)} className="grid h-7 w-7 place-items-center rounded-md text-ink-2 hover:bg-raised disabled:opacity-30">
          <ArrowUp size={14} />
        </button>
        <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2" title={dir.path}>
          {dir.path}
        </code>
        {onPickFolder && (
          <button type="button" onClick={() => onPickFolder(dir.path)} className="h-7 shrink-0 rounded-md bg-ink px-2.5 text-[12.5px] font-semibold text-paper hover:opacity-90">
            Use this folder
          </button>
        )}
      </div>
      <ul className="scrollbar-quiet max-h-[260px] overflow-y-auto py-1">
        {dir.folders.length === 0 && files.length === 0 && <li className="px-3 py-2 text-[12.5px] text-ink-3">{onOpenFile ? 'No folders or Poney files here.' : 'No folders inside.'}</li>}
        {files.map((f) => (
          <li key={f.path}>
            <button type="button" onClick={() => onOpenFile!(f.path)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-medium hover:bg-sunken">
              <FileText size={14} className="shrink-0 text-poney" />
              <span className="truncate">{f.name}</span>
            </button>
          </li>
        ))}
        {dir.folders.map((f) => (
          <li key={f.path}>
            <button type="button" onDoubleClick={() => onPickFolder?.(f.path)} onClick={() => void go(f.path)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-sunken">
              {f.git ? <GitBranch size={14} className="shrink-0 text-poney" /> : <FolderIcon size={14} className="shrink-0 text-ink-3" />}
              <span className="truncate">{f.name}</span>
              {f.git && <span className="ml-auto shrink-0 text-[11.5px] text-ink-3">Git repository</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
