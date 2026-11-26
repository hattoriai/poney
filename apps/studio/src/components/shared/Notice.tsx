import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useStudio } from '@/features/store'

/** One short message at a time, announced to screen readers. */
export function Notice() {
  const notice = useStudio((s) => s.notice)
  const notify = useStudio((s) => s.notify)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => notify(null), 4200)
    return () => clearTimeout(t)
  }, [notice, notify])
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2">
      {notice && (
        <div className="fade-in pointer-events-auto flex max-w-[520px] items-center gap-3 rounded-xl bg-ink px-4 py-2.5 text-[13px] text-paper shadow-float">
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss" className="text-paper/60 hover:text-paper" onClick={() => notify(null)}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
