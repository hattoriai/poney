import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { useIndex, useStudio } from '@/features/store'
import { refKey, type Ref } from '@hattoriai/poney-core'

/** One tooltip for the whole canvas. It follows the pointer and shows what is hovered. */
export function Tooltip({ pointer }: { pointer: MutableRefObject<{ x: number; y: number }> }) {
  const hover = useStudio((s) => s.hover)
  const selection = useStudio((s) => s.selection)
  const idx = useIndex()
  const [shown, setShown] = useState<Ref | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setShown(null)
    if (!hover) return
    const timer = setTimeout(() => setShown(hover), 420)
    return () => clearTimeout(timer)
  }, [hover])

  useEffect(() => {
    if (!shown) return
    let raf = 0
    const tick = () => {
      const el = box.current
      if (el) {
        const parent = el.parentElement!.getBoundingClientRect()
        const x = Math.min(pointer.current.x + 14, parent.width - el.offsetWidth - 8)
        const y = pointer.current.y + 18 + el.offsetHeight > parent.height ? pointer.current.y - el.offsetHeight - 10 : pointer.current.y + 18
        el.style.transform = `translate(${x}px, ${y}px)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [shown, pointer])

  if (!shown || (selection && refKey(selection) === refKey(shown))) return null
  const d = idx.describe(shown)
  return (
    <div
      ref={box}
      role="tooltip"
      className="fade-in pointer-events-none absolute left-0 top-0 z-20 max-w-[280px] rounded-lg border border-rule bg-raised px-3 py-2 shadow-float"
    >
      <div className="text-[11px] text-ink-3">{d.kind}</div>
      <div className="text-[13px] font-semibold leading-snug text-ink">{d.title}</div>
      {d.summary && <div className="mt-0.5 text-[12px] leading-snug text-ink-2">{d.summary}</div>}
    </div>
  )
}
