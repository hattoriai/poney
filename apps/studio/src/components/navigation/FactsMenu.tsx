import { useEffect, useRef, useState } from 'react'
import { Activity, Check, Loader2 } from 'lucide-react'
import { useStudio } from '@/features/store'
import { clearOverlay, listPlugins, showOverlay, type PluginItem } from '@/features/agent'

/**
 * Live facts on the parts of the document, from the code's folder: test
 * coverage, recent changes, and the person's own overlays. Scenes show them
 * as badges, and mark the parts that need a look.
 */
export function FactsMenu() {
  const live = useStudio((s) => s.live.state === 'on')
  const project = useStudio((s) => s.project)
  const shown = useStudio((s) => s.overlays)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<PluginItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void listPlugins().then(
      (r) => setItems(r.overlays),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  if (!live || !project) return null
  const on = Object.keys(shown).length
  const toggle = async (id: string) => {
    setBusy(id)
    setError(null)
    try {
      await (shown[id] ? clearOverlay(id) : showOverlay(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div ref={box} className="relative mr-1">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title="Live facts on the parts: test coverage, recent changes"
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium ${on ? 'bg-poney-wash text-poney' : 'text-ink-2 hover:bg-sunken'}`}
      >
        <Activity size={15} />
        <span className="hidden lg:inline">Facts{on ? ` (${on})` : ''}</span>
      </button>
      {open && (
        <div role="menu" aria-label="Facts" className="fade-in absolute right-0 top-10 z-50 w-80 rounded-xl border border-rule bg-raised p-1 shadow-float">
          {items.map((o) => {
            const active = !!shown[o.id]
            const can = o.files.length > 0
            return (
              <button
                key={o.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={active}
                disabled={!can && !active}
                onClick={() => void toggle(o.id)}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-sunken disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${active ? 'border-poney bg-poney text-paper' : 'border-rule-strong'}`}>
                  {busy === o.id ? <Loader2 size={11} className="animate-spin text-ink-3" /> : active && <Check size={11} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{o.name}</span>
                  <span className="block text-[12px] text-ink-3">{active ? shown[o.id].notes[0] : can ? o.description : 'Nothing to read in this folder.'}</span>
                </span>
              </button>
            )
          })}
          {error && <p className="px-2.5 py-1.5 text-[12px] text-removed">{error}</p>}
        </div>
      )}
    </div>
  )
}
