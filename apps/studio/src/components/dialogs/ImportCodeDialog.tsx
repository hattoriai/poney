import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useStudio } from '@/features/store'
import { listPlugins, runImporter, type PluginItem } from '@/features/agent'
import { Modal } from './Modal'

/**
 * Import from the code: an importer reads a source in the project's folder (a
 * database schema, the module imports) and adds what it finds to the open
 * document. What the document already has stays.
 */
export function ImportCodeDialog() {
  const open = useStudio((s) => s.importCodeOpen)
  const setOpen = useStudio((s) => s.setImportCodeOpen)
  const [items, setItems] = useState<PluginItem[]>([])
  const [root, setRoot] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    void listPlugins().then(
      (r) => {
        setItems(r.importers)
        setRoot(r.root)
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [open])

  const run = async (id: string) => {
    setBusy(id)
    setError(null)
    try {
      const { summary } = await runImporter(id)
      setOpen(false)
      useStudio.getState().notify(summary.split('\n')[0])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onOpenChange={setOpen} title="Import from the code" description={root ? `Adds to this document what it reads in ${root.split('/').pop()}. What the document has stays.` : 'Connect an agent or open a workspace first.'}>
      <ul className="divide-y divide-rule px-5 py-3">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">{i.name}</span>
              <span className="mt-0.5 block text-[12.5px] text-ink-3">{i.files.length ? `Reads ${i.files.join(', ')}` : 'Nothing to read in this folder.'}</span>
            </span>
            <button
              type="button"
              disabled={!i.files.length || !!busy}
              onClick={() => void run(i.id)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rule-strong px-3 text-[13px] font-semibold hover:bg-sunken disabled:opacity-40"
            >
              {busy === i.id && <Loader2 size={13} className="animate-spin" />} Import
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="px-5 pb-4 text-[12.5px] text-removed">{error}</p>}
    </Modal>
  )
}
