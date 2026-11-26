import { useState } from 'react'
import { useStudio } from '@/features/store'
import { lastFolder, openFile } from '@/features/agent'
import { FileBrowser } from '@/components/agent/FileBrowser'
import { Modal } from './Modal'

/** Opens a .poney file from this computer, like a notebook in Livebook: the Studio keeps it saved, and shows changes made on disk. */
export function OpenFileDialog() {
  const open = useStudio((s) => s.fileOpen)
  const setOpen = useStudio((s) => s.setFileOpen)
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal open={open} onOpenChange={setOpen} title="Open a Poney file" description="A .poney file on this computer. Changes are saved to it, and changes made to it elsewhere show here." width={600}>
      <div className="space-y-3 px-5 py-5">
        <FileBrowser
          start={lastFolder()}
          onOpenFile={async (path) => {
            try {
              await openFile(path)
              setError(null)
              setOpen(false)
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            }
          }}
        />
        {error && <p role="alert" className="whitespace-pre-wrap text-[12.5px] text-removed">{error}</p>}
      </div>
    </Modal>
  )
}
