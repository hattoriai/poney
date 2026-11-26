import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { agentReady, useStudio } from '@/features/store'
import { askAbout, textChip } from '@/features/context'

/**
 * A small bubble over selected text in a page, while an agent can be reached:
 * one click adds the text to the next question, as a quote. Not shown while
 * editing, in fields, or over diagrams.
 */
export function SelectionBubble() {
  const live = useStudio(agentReady)
  const [at, setAt] = useState<{ x: number; y: number; text: string } | null>(null)
  useEffect(() => {
    if (!live) return
    const update = () => {
      const sel = window.getSelection()
      const text = sel?.toString().trim()
      const node = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement
      if (!sel || !text || sel.rangeCount === 0 || !node?.closest('main') || node.closest('input, textarea, [contenteditable="true"], svg')) return setAt(null)
      // Over the first line of the selection, where the eye starts.
      const range = sel.getRangeAt(0)
      const r = range.getClientRects()[0] ?? range.getBoundingClientRect()
      if (!r.width) return setAt(null)
      setAt({ x: r.left + r.width / 2, y: r.top, text })
    }
    const hide = () => setAt(null)
    document.addEventListener('selectionchange', update)
    window.addEventListener('scroll', hide, true)
    return () => {
      document.removeEventListener('selectionchange', update)
      window.removeEventListener('scroll', hide, true)
    }
  }, [live])
  if (!at) return null
  return (
    <button
      type="button"
      // Keeps the selection: the click must not clear it first.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        askAbout(textChip(at.text))
        window.getSelection()?.removeAllRanges()
        setAt(null)
      }}
      className="fade-in fixed z-50 inline-flex -translate-x-1/2 -translate-y-full items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-paper shadow-float hover:opacity-95"
      style={{ left: at.x, top: at.y - 8 }}
    >
      <MessageCircle size={13} /> Ask the agent
    </button>
  )
}
