import { useEffect, useState } from 'react'
import { useStudio, type OpenWorkspace } from '@/features/store'
import { addFolder, lastFolder, saveWorkspace } from '@/features/agent'
import { FileBrowser } from '@/components/agent/FileBrowser'
import { Modal } from './Modal'

/** The file a workspace is saved to by default: next to its document when it is a document opened alone, else in its first folder; named after it. */
const defaultFile = (w: OpenWorkspace, name = w.name) => {
  const dir = w.key.startsWith('document:') ? w.key.slice('document:'.length, w.key.lastIndexOf('/')) : w.folders[0].path
  return `${dir}/${name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace'}.poney-workspace`
}

/** Adds a folder to the open workspace (or attaches one to a document opened alone). Nothing to save first. */
export function AddFolderDialog() {
  const open = useStudio((s) => s.workspaceDialog === 'add-folder')
  const workspace = useStudio((s) => s.workspace)
  const liveFile = useStudio((s) => s.liveFile)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) setError(null)
  }, [open])
  const close = () => useStudio.getState().setWorkspaceDialog(null)
  const add = async (path: string) => {
    setError(null)
    try {
      await addFolder(path)
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  // Start next to the last folder, or the document, or where the person browsed last.
  const near = workspace?.folders.at(-1)?.path ?? liveFile ?? undefined
  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} title="Add a folder" description="Usually a repository. The agent can read every folder of the workspace." width={620}>
      <div className="space-y-3 px-5 py-5">
        <FileBrowser start={near ? near.slice(0, near.lastIndexOf('/')) : lastFolder()} onPickFolder={(p) => void add(p)} />
        {error && (
          <p role="alert" className="text-[12.5px] text-removed">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

/** Saves the open workspace as a .poney-workspace file. Its conversation and agent session go with it. */
export function SaveWorkspaceDialog() {
  const open = useStudio((s) => s.workspaceDialog === 'save')
  const workspace = useStudio((s) => s.workspace)
  const [name, setName] = useState('')
  const [file, setFile] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!open || !workspace) return
    setError(null)
    setName(workspace.name)
    setFile(defaultFile(workspace))
  }, [open, workspace])
  const close = () => useStudio.getState().setWorkspaceDialog(null)
  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} title="Save the workspace" description="As a file that you can commit and share. The conversation and the agent session go with it." width={560}>
      <form
        className="space-y-3 px-5 py-5"
        onSubmit={async (e) => {
          e.preventDefault()
          setError(null)
          try {
            await saveWorkspace(file, name)
            close()
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
          }
        }}
      >
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (workspace) setFile(defaultFile(workspace, e.target.value))
          }}
          aria-label="Name"
          placeholder="Name"
          className="h-9 w-full rounded-lg border border-rule bg-paper px-3 text-[13.5px] outline-none focus:border-rule-strong"
        />
        <input
          value={file}
          onChange={(e) => setFile(e.target.value)}
          aria-label="Workspace file"
          className="h-9 w-full rounded-lg border border-rule bg-paper px-3 font-mono text-[12.5px] outline-none focus:border-rule-strong"
        />
        {error && (
          <p role="alert" className="text-[12.5px] text-removed">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="h-8 rounded-lg border border-rule px-3 text-[13px] font-medium hover:bg-sunken">
            Cancel
          </button>
          <button type="submit" disabled={!name.trim() || !file.endsWith('.poney-workspace')} className="h-8 rounded-lg bg-ink px-3 text-[13px] font-semibold text-paper hover:opacity-90 disabled:opacity-35">
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}
