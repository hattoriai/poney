import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStudio } from '@/features/store'
import { finishRename } from '@/features/rename'

/**
 * Editing a name where it is drawn. The field takes the place of the drawn
 * name: same position, font and size at the current zoom, with a caret and an
 * underline. Enter or a click outside saves; Escape cancels. The name changes
 * in every diagram, and Undo puts the old one back.
 */
export function RenameField() {
  const renaming = useStudio((s) => s.renaming)
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const measure = useRef<HTMLSpanElement>(null)
  const [width, setWidth] = useState(0)

  // The drawn name hides while the field covers it.
  useEffect(() => {
    if (!renaming) return
    setValue(renaming.value)
    const text = renaming.text
    if (text) text.style.visibility = 'hidden'
    requestAnimationFrame(() => input.current?.select())
    const close = () => finishRename(input.current?.value ?? null)
    window.addEventListener('resize', close)
    window.addEventListener('wheel', close, { passive: true })
    return () => {
      if (text) text.style.visibility = ''
      window.removeEventListener('resize', close)
      window.removeEventListener('wheel', close)
    }
  }, [renaming])

  // The field is as wide as its text, up to the room the element has.
  useLayoutEffect(() => {
    if (renaming && measure.current) setWidth(Math.min(Math.max(measure.current.offsetWidth + 6, renaming.rect.w + 6, 40), Math.max(renaming.room, renaming.rect.w + 6)))
  }, [value, renaming])

  if (!renaming) return null
  const { rect, font, align } = renaming
  const lineHeight = Math.round(font.size * 1.35)
  const left = align === 'center' ? rect.x + rect.w / 2 - width / 2 : rect.x - 2
  const top = rect.y + rect.h / 2 - lineHeight / 2
  const style = { fontSize: font.size, fontWeight: Number(font.weight) || 600, lineHeight: `${lineHeight}px` }
  return (
    <>
      <span ref={measure} aria-hidden className="pointer-events-none invisible fixed left-0 top-0 whitespace-pre font-sans" style={style}>
        {value || ' '}
      </span>
      <input
        ref={input}
        value={value}
        aria-label={`New name for ${renaming.value}`}
        title="Enter to save, Esc to cancel. The name changes in every diagram."
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finishRename(value)
          if (e.key === 'Escape') finishRename(null)
        }}
        onBlur={() => finishRename(value)}
        className={`fixed z-50 rounded-sm border-0 border-b-2 border-poney p-0 px-[2px] font-sans text-ink caret-[var(--poney)] ${align === 'center' ? 'text-center' : ''}`}
        // On the element's own fill, so it reads as the element's name, also where it grows past the box.
        style={{ ...style, left, top, width, height: lineHeight + 2, outline: 'none', boxShadow: 'none', background: 'var(--story-node)' }}
      />
    </>
  )
}
