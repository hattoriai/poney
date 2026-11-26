import { useEffect } from 'react'
import { Crosshair } from 'lucide-react'
import { agentReady, useStudio } from '@/features/store'

/** While pointing: what to do, and Escape to stop. The pointer becomes a crosshair. */
export function PointingHint() {
  const pointing = useStudio((s) => s.pointing)
  const ready = useStudio(agentReady)
  // Pointing is for a question; with no agent to take it, it stops.
  useEffect(() => {
    if (!ready && pointing) useStudio.getState().setPointing(false)
  }, [ready, pointing])
  useEffect(() => {
    document.documentElement.classList.toggle('pointing', pointing)
    if (!pointing) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && useStudio.getState().setPointing(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [pointing])
  if (!pointing) return null
  return (
    <div role="status" className="fade-in fixed left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper shadow-float">
      <Crosshair size={14} /> Click a part, a line, a message or a state to add it to your message.
      <button type="button" onClick={() => useStudio.getState().setPointing(false)} className="ml-1 rounded-full px-2 py-0.5 text-[12px] text-paper/70 hover:bg-paper/15 hover:text-paper">
        Esc
      </button>
    </div>
  )
}
