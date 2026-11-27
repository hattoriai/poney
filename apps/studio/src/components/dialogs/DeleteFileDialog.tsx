import { useState } from 'react'
import { useStudio } from '@/features/store'
import { deleteFile } from '@/features/agent'
import { forgetRecent } from '@/features/recent'
import { Modal } from './Modal'

/** Asks before a document's .poney file is deleted for good. After the delete, the document closes and leaves the recent list. */
export function DeleteFileDialog() {
  const deleting = useStudio((s) => s.deleting)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => {
    setError(null)
    useStudio.getState().setDeleting(null)
  }
  const confirm = async () => {
    if (!deleting) return
    setBusy(true)
    setError(null)
    try {
      await deleteFile(deleting.path, deleting.id)
      forgetRecent(deleting.id)
      useStudio.getState().closeDocument(deleting.id)
      useStudio.getState().notify(`Deleted “${deleting.name}”.`)
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={!!deleting} onOpenChange={(open) => !open && close()} title={`Delete “${deleting?.name ?? ''}”?`} width={480}>
      <div className="space-y-3 px-5 py-5 text-[13px]">
        <p className="break-all rounded-lg border border-rule bg-sunken/60 px-3 py-2 font-mono text-[12px]">{deleting?.path}</p>
        <p className="text-ink-2">This deletes the file from your computer. You cannot undo it. If the file is committed, Git can restore it.</p>
        {error && (
          <p role="alert" className="text-[12.5px] text-removed">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={close} className="h-8 rounded-lg border border-rule px-3 font-medium hover:bg-sunken">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void confirm()} className="h-8 rounded-lg bg-removed px-3 font-semibold text-paper hover:opacity-90 disabled:opacity-50">
            Delete file
          </button>
        </div>
      </div>
    </Modal>
  )
}
