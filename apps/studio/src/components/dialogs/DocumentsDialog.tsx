import { useState } from 'react'
import { FilePlus2, FileText } from 'lucide-react'
import { useStudio } from '@/features/store'
import { newDocument, openFile } from '@/features/agent'
import { Modal } from './Modal'

/** Selects a document of the open folder: it opens when the folder has several and none is shown, or from the document menu. */
export function DocumentsDialog() {
  const open = useStudio((s) => s.documentsOpen)
  const { documents, shown } = useStudio((s) => s.folderDocuments)
  const folder = useStudio((s) => s.project)
  const workspace = useStudio((s) => s.workspace)
  const [error, setError] = useState<string | null>(null)
  const close = () => {
    setError(null)
    useStudio.getState().setDocumentsOpen(false)
  }
  const where = workspace?.file ? `The documents of ${workspace.name}.` : folder ? `The documents in ${folder.name}/docs/poney/.` : undefined
  const choose = async (path: string) => {
    setError(null)
    try {
      if (path !== shown) await openFile(path)
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message.split('\n')[0] : String(e))
    }
  }
  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} title="Select a document" description={where} width={520}>
      <div className="space-y-1 px-3 py-3">
        {documents.map((d) => (
          <button
            key={d.path}
            type="button"
            disabled={!!d.invalid}
            title={d.invalid ?? d.path}
            onClick={() => void choose(d.path)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-sunken disabled:opacity-50 ${d.path === shown ? 'bg-sunken' : ''}`}
          >
            <FileText size={15} className="shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium">{d.name}</span>
              <span className="block truncate font-mono text-[11.5px] text-ink-3">{d.invalid ? 'Not a valid document' : d.path.split('/').pop()}</span>
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            close()
            useStudio.getState().setNewDocumentOpen(true)
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] text-ink-2 hover:bg-sunken"
        >
          <FilePlus2 size={15} className="shrink-0 text-ink-3" /> New document…
        </button>
        {error && (
          <p role="alert" className="px-3 pt-1 text-[12.5px] text-removed">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

/** Makes a new, empty document in docs/poney/ of a folder of the workspace, and shows it. */
export function NewDocumentDialog() {
  const open = useStudio((s) => s.newDocumentOpen)
  const workspace = useStudio((s) => s.workspace)
  const folders = workspace?.folders.filter((f) => !f.missing) ?? []
  const [chosen, setChosen] = useState<string | undefined>(undefined)
  const folder = folders.find((f) => f.path === chosen) ?? folders[0]
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const close = () => {
    setName('')
    setError(null)
    useStudio.getState().setNewDocumentOpen(false)
  }
  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} title="New document" description={folder ? `It is saved in ${folder.name}/docs/poney/.` : 'Add a folder first: a new document is saved in its docs/poney/.'} width={460}>
      <form
        className="space-y-3 px-5 py-5"
        onSubmit={async (e) => {
          e.preventDefault()
          setError(null)
          try {
            await newDocument(name, folder?.path)
            close()
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
          }
        }}
      >
        {folders.length > 1 && (
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            Folder
            <select value={folder?.path} onChange={(e) => setChosen(e.target.value)} className="h-8 rounded-lg border border-rule bg-paper px-2 text-[13px]">
              {folders.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Name"
          placeholder="Name, such as Billing"
          className="h-9 w-full rounded-lg border border-rule bg-paper px-3 text-[13.5px] outline-none placeholder:text-ink-4 focus:border-rule-strong"
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
          <button type="submit" disabled={!name.trim()} className="h-8 rounded-lg bg-ink px-3 text-[13px] font-semibold text-paper hover:opacity-90 disabled:opacity-35">
            Make document
          </button>
        </div>
      </form>
    </Modal>
  )
}
