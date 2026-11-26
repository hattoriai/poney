import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Compass, Copy, FileCode2, Lightbulb, MessageCircle, Pencil } from 'lucide-react'
import { refKey } from '@poney/core'
import { agentReady, useStudio, type ContextMenu as Menu } from '@/features/store'
import { askAbout, codeChip, diagramChip, elementChip, textChip } from '@/features/context'
import { ask } from '@/features/agent'
import { startRename, canRename } from '@/features/rename'
import { revealRef } from '@/features/navigation'

interface Item {
  label: string
  icon: ReactNode
  run(): void
  hint?: string
}

/**
 * The right-click menu. On an element: talk to the agent about it, rename it,
 * explore it, copy its reference. On selected text: ask about the text. On a
 * diagram's empty space: ask about the diagram. Agent items show only while
 * Poney on this computer is linked.
 */
export function ContextMenu() {
  const menu = useStudio((s) => s.contextMenu)
  const close = () => useStudio.getState().openContextMenu(null)
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState({ x: 0, y: 0 })
  const [active, setActive] = useState(0)

  const items = menu ? itemsFor(menu) : []

  // Kept inside the window, next to the pointer.
  useLayoutEffect(() => {
    if (!menu || !box.current) return
    const r = box.current.getBoundingClientRect()
    setAt({ x: Math.min(menu.x, window.innerWidth - r.width - 8), y: Math.min(menu.y, window.innerHeight - r.height - 8) })
    setActive(0)
    box.current.focus()
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && close()
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  if (!menu || !items.length) return null
  const choose = (i: number) => {
    const item = items[i]
    if (!item || item.label === '-') return
    close()
    item.run()
  }
  const move = (d: number) => {
    let i = active
    do i = (i + d + items.length) % items.length
    while (items[i].label === '-')
    setActive(i)
  }
  return (
    <div
      ref={box}
      role="menu"
      tabIndex={-1}
      aria-label="Actions"
      className="fade-in fixed z-50 min-w-[230px] rounded-xl border border-rule bg-raised p-1 shadow-float outline-none"
      style={{ left: at.x, top: at.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close()
        else if (e.key === 'ArrowDown') move(1)
        else if (e.key === 'ArrowUp') move(-1)
        else if (e.key === 'Enter') choose(active)
        else return
        e.preventDefault()
      }}
    >
      {items.map((item, i) =>
        item.label === '-' ? (
          <div key={i} className="my-1 h-px bg-rule" role="separator" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(i)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${i === active ? 'bg-sunken' : ''}`}
          >
            <span className="shrink-0 text-ink-3">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.hint && <kbd className="font-sans text-[11.5px] text-ink-4">{item.hint}</kbd>}
          </button>
        ),
      )}
    </div>
  )
}

const SEPARATOR: Item = { label: '-', icon: null, run: () => {} }

function itemsFor(menu: Menu): Item[] {
  const live = agentReady(useStudio.getState())
  /** Asks at once, with the chip, and shows the panel with the answer coming in. */
  const askNow = (text: string, chip: ReturnType<typeof elementChip>) => {
    if (!chip) return
    useStudio.getState().setAgentPanelOpen(true)
    void ask(text, [chip])
  }
  if (menu.on === 'element') {
    const chip = elementChip(menu.ref)
    const kind = chip?.kind ?? 'element'
    const agent: Item[] = live
      ? [
          { label: 'Ask the agent about this', icon: <MessageCircle size={14} />, run: () => askAbout(chip) },
          { label: 'Explain this', icon: <Lightbulb size={14} />, run: () => askNow(`Explain this ${kind}: what it does, why it is here, and where its code is.`, chip) },
          { label: 'Show its code in a scene', icon: <FileCode2 size={14} />, run: () => askNow(`Add a scene to the open document that shows the code of this ${kind}, with short excerpts and notes, and open it.`, chip) },
          SEPARATOR,
        ]
      : []
    return [
      ...agent,
      ...(canRename(menu.ref)
        ? [
            {
              label: 'Rename',
              icon: <Pencil size={14} />,
              hint: 'F2',
              run: () => {
                const el = document.elementFromPoint(menu.x, menu.y)?.closest('[data-ref]') ?? document.querySelector(`[data-ref="${CSS.escape(refKey(menu.ref))}"]`)
                if (el) startRename(menu.ref, el)
              },
            },
          ]
        : []),
      { label: 'Explore in the whole system', icon: <Compass size={14} />, run: () => revealRef(menu.ref) },
      { label: 'Copy reference', icon: <Copy size={14} />, hint: refKey(menu.ref), run: () => void navigator.clipboard?.writeText(refKey(menu.ref)) },
    ]
  }
  if (menu.on === 'code') {
    const chip = codeChip(menu.path, menu.line, menu.text)
    const where = `${menu.path}:${menu.line}`
    return [
      ...(live
        ? [
            { label: menu.note ? 'Ask the agent about this note' : 'Ask the agent about this line', icon: <MessageCircle size={14} />, run: () => askAbout(menu.note ? { ...chip, quote: `${chip.quote}\nNote: ${menu.note}` } : chip) },
            { label: 'Explain this line', icon: <Lightbulb size={14} />, run: () => askNow('Explain this line of code: what it does and why it is here.', chip) },
            SEPARATOR,
          ]
        : []),
      ...(menu.note ? [{ label: 'Copy note', icon: <Copy size={14} />, run: () => void navigator.clipboard?.writeText(menu.note!) }] : []),
      { label: 'Copy line', icon: <Copy size={14} />, run: () => void navigator.clipboard?.writeText(menu.text.trim()) },
      { label: 'Copy location', icon: <Copy size={14} />, hint: where.split('/').pop(), run: () => void navigator.clipboard?.writeText(where) },
    ]
  }
  if (menu.on === 'text')
    return [
      ...(live ? [{ label: 'Ask the agent about this text', icon: <MessageCircle size={14} />, run: () => askAbout(textChip(menu.text)) }] : []),
      { label: 'Copy', icon: <Copy size={14} />, run: () => void navigator.clipboard?.writeText(menu.text) },
    ]
  const chip = diagramChip(menu.viewId)
  return live
    ? [
        { label: 'Ask the agent about this diagram', icon: <MessageCircle size={14} />, run: () => askAbout(chip) },
        { label: 'Explain this diagram', icon: <Lightbulb size={14} />, run: () => askNow('Explain what this diagram shows, in a few sentences, and what to look at first.', chip) },
      ]
    : []
}
