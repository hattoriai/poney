import { useState } from 'react'
import { useStudio } from '@/features/store'
import { cloneRepository, lastFolder, openProjectFolder, rememberFolder } from '@/features/agent'
import { FileBrowser } from '@/components/agent/FileBrowser'
import { Modal } from './Modal'

/**
 * Opens a workspace: a .poney-workspace file, a folder on this computer, or a
 * repository cloned from a Git address. A folder with its own workspace file
 * opens that file; with several, the person chooses one.
 */
export function OpenProjectDialog() {
  const open = useStudio((s) => s.projectOpen)
  const setOpen = useStudio((s) => s.setProjectOpen)
  const [source, setSource] = useState<'local' | 'git'>('local')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [several, setSeveral] = useState<string[] | null>(null)
  const choose = async (path: string) => {
    setError(null)
    try {
      const r = await openProjectFolder(path)
      if (r.choose) return setSeveral(r.choose)
      rememberFolder(path.endsWith('.poney-workspace') ? path.slice(0, path.lastIndexOf('/')) : path)
      setSeveral(null)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <Modal open={open} onOpenChange={setOpen} title="Open a workspace" description="A folder on this computer, usually a Git repository, or a .poney-workspace file. Agents work in its folders." width={620}>
      <div className="space-y-3 px-5 py-5">
        <div role="tablist" className="inline-flex rounded-lg border border-rule bg-sunken/60 p-0.5 text-[12.5px]">
          {(['local', 'git'] as const).map((k) => (
            <button key={k} role="tab" type="button" aria-selected={source === k} onClick={() => setSource(k)} className={`h-7 rounded-md px-3 font-medium ${source === k ? 'bg-raised text-ink shadow-[0_1px_2px_#0000001a]' : 'text-ink-3 hover:text-ink'}`}>
              {k === 'local' ? 'On this computer' : 'From a Git address'}
            </button>
          ))}
        </div>
        {several ? (
          <div className="space-y-1">
            <p className="text-[13px] text-ink-2">This folder has several workspaces. Choose one.</p>
            {several.map((f) => (
              <button key={f} type="button" onClick={() => void choose(f)} className="block w-full truncate rounded-lg border border-rule px-3 py-2 text-left font-mono text-[12.5px] hover:bg-sunken">
                {f.split('/').pop()}
              </button>
            ))}
          </div>
        ) : source === 'local' ? (
          <FileBrowser start={lastFolder()} onPickFolder={(p) => void choose(p)} onOpenFile={(p) => void choose(p)} extensions={['.poney-workspace']} />
        ) : (
          <CloneForm onCloned={(p) => void choose(p)} setBusy={setBusy} setError={setError} />
        )}
        {(error || busy) && (
          <p role={error ? 'alert' : 'status'} className={`text-[12.5px] ${error ? 'text-removed' : 'text-ink-3'}`}>
            {error ?? busy}
          </p>
        )}
      </div>
    </Modal>
  )
}

function CloneForm({ onCloned, setBusy, setError }: { onCloned(path: string): void; setBusy(b: string | null): void; setError(e: string | null): void }) {
  const [url, setUrl] = useState('')
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy('Cloning the repository…')
        setError(null)
        try {
          onCloned((await cloneRepository(url)).path)
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setBusy(null)
        }
      }}
    >
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        aria-label="Git address"
        placeholder="https://github.com/owner/repository"
        className="h-9 min-w-0 flex-1 rounded-lg border border-rule bg-paper px-3 font-mono text-[12.5px] outline-none placeholder:text-ink-4 focus:border-rule-strong"
      />
      <button type="submit" disabled={!url.trim()} className="h-9 shrink-0 rounded-lg border border-rule-strong bg-raised px-3 text-[13px] font-semibold hover:bg-sunken disabled:opacity-35">
        Clone
      </button>
    </form>
  )
}
