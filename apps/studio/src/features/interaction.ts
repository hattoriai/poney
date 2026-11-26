import { useCallback } from 'react'
import { useStudio } from '@/features/store'
import { refKey, type Ref } from '@poney/core'
import { startRename } from '@/features/rename'
import { askAbout, elementChip } from '@/features/context'

/**
 * Binds an SVG element to the studio's selection and hover state. Every
 * interactive element in every diagram uses this, so mouse, keyboard and
 * screen-reader behavior is the same everywhere.
 */
export function useBind() {
  const select = useStudio((s) => s.select)
  const setHover = useStudio((s) => s.setHover)
  const selection = useStudio((s) => s.selection)
  const selectedKey = selection ? refKey(selection) : null

  return useCallback(
    (ref: Ref, label: string) => {
      const key = refKey(ref)
      return {
        'data-ref': key,
        className: 'dg-el',
        tabIndex: 0,
        role: 'button',
        'aria-label': label,
        'aria-pressed': selectedKey === key,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation()
          // Pointing at something for the agent: the click adds it to the message, and pointing ends.
          if (useStudio.getState().pointing) {
            const chip = elementChip(ref)
            useStudio.getState().setPointing(false)
            if (chip) askAbout(chip)
            return
          }
          // Keyboard focus follows the click, so Tab continues from here, in the diagram.
          ;(e.currentTarget as SVGElement).focus({ preventScroll: true })
          select(ref)
        },
        // Double-click renames what has a name; F (or the zoom buttons) zooms in.
        onDoubleClick: (e: React.MouseEvent) => {
          e.stopPropagation()
          select(ref)
          if (!startRename(ref, e.currentTarget as Element)) select(ref, { focus: 'zoom' })
        },
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          select(ref)
          useStudio.getState().openContextMenu({ on: 'element', ref, x: e.clientX, y: e.clientY })
        },
        onMouseEnter: () => setHover(ref),
        onMouseLeave: () => setHover(null),
        // The focused element lights up as if hovered, so a keyboard reader sees what Tab reached.
        onFocus: () => setHover(ref),
        onBlur: () => setHover(null),
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            select(ref, { focus: 'center' })
          }
        },
      }
    },
    [select, setHover, selectedKey],
  )
}

/**
 * The element the diagram should emphasize: what is hovered, else what is
 * selected. Hover previews; selection persists.
 */
export function useSubject(): { subject: Ref | null; selection: Ref | null; hover: Ref | null } {
  const selection = useStudio((s) => s.selection)
  const hover = useStudio((s) => s.hover)
  return { subject: hover ?? selection, selection, hover }
}

/**
 * Tab and Shift+Tab inside a diagram: move focus to the next element on
 * screen, in reading order (top to bottom, then left to right), not in the
 * order the elements happen to be drawn. Returns the element focused, or
 * nothing at either end, so Tab can leave the diagram.
 */
export function focusNextElement(container: Element, from: Element | null, back: boolean): SVGElement | undefined {
  const seen = new Set<string>()
  const items = [...container.querySelectorAll<SVGElement>('[data-ref][tabindex]')]
    .filter((el) => {
      const key = el.getAttribute('data-ref')!
      const r = el.getBoundingClientRect()
      if (seen.has(key) || r.width === 0 || getComputedStyle(el).visibility === 'hidden') return false
      seen.add(key)
      return true
    })
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .sort((a, b) => {
      const row = Math.round((a.r.top + a.r.height / 2) / 28) - Math.round((b.r.top + b.r.height / 2) / 28)
      return row || a.r.left - b.r.left
    })
  if (!items.length) return undefined
  const key = from?.closest('[data-ref]')?.getAttribute('data-ref')
  const at = key ? items.findIndex((i) => i.el.getAttribute('data-ref') === key) : -1
  const next = at < 0 ? (back ? items.length - 1 : 0) : at + (back ? -1 : 1)
  // Past the last (or before the first) element, Tab leaves the diagram as usual: no keyboard trap.
  if (next < 0 || next >= items.length) return undefined
  const el = items[next].el
  el.focus({ preventScroll: true })
  return el
}
