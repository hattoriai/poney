import { indexOf, plainText, refKey, type Ref } from '@hattoriai/poney-core'
import { useStudio, type ContextItem } from './store'

/**
 * Chips: what a question to the agent is about. An element of the model (by
 * its ref, so the agent knows exactly which one), a diagram, or a piece of
 * text quoted from the page.
 */
export function elementChip(ref: Ref): ContextItem | undefined {
  const doc = useStudio.getState().history?.present
  if (!doc) return undefined
  const idx = indexOf(doc)
  if (!idx.exists(ref)) return undefined
  const d = idx.describe(ref)
  return { ref: refKey(ref), title: plainText(d.title), kind: d.kind.toLowerCase() }
}

export function diagramChip(viewId: string): ContextItem | undefined {
  const view = useStudio.getState().history?.present.views.find((v) => v.id === viewId)
  return view ? { ref: `view:${view.id}`, title: view.title, kind: 'diagram' } : undefined
}

export const textChip = (text: string): ContextItem => ({ title: text.length > 60 ? `${text.slice(0, 57)}…` : text, kind: 'text', quote: text.slice(0, 2000) })

/** A line of code as a chip: "code routes.rb:13", with the line's text for the agent. */
export const codeChip = (path: string, line: number, text: string): ContextItem => ({ title: `${path.split('/').slice(-2).join('/')}:${line}`, kind: 'code', quote: `${path}:${line}\n${text}` })

/** Right-click on a line of code or its note; selected text keeps the text menu. */
export function onCodeContextMenu(path: string, line: number, text: string, note?: string) {
  return (e: React.MouseEvent) => {
    if (window.getSelection()?.toString().trim()) return
    e.preventDefault()
    useStudio.getState().openContextMenu({ on: 'code', path, line, text, note, x: e.clientX, y: e.clientY })
  }
}

/** Adds a chip and opens the message box, so the person can say what they want to know. */
export function askAbout(chip: ContextItem | undefined) {
  if (!chip) return
  const s = useStudio.getState()
  s.addChip(chip)
  s.setAgentPanelOpen(true)
  requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[aria-label="Your question"]')?.focus())
}

/** Right-click on a diagram's empty space; elements open their own menu. */
export function onDiagramContextMenu(viewId: string) {
  return (e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-ref]')) return
    e.preventDefault()
    useStudio.getState().openContextMenu({ on: 'diagram', viewId, x: e.clientX, y: e.clientY })
  }
}

/** Right-click on selected text in the page opens the text menu. */
export function installTextMenu() {
  window.addEventListener('contextmenu', (e) => {
    if (e.defaultPrevented) return
    const target = e.target as HTMLElement
    if (target.closest('input, textarea, [contenteditable="true"]') || !target.closest('main')) return
    const text = window.getSelection()?.toString().trim()
    if (!text) return
    e.preventDefault()
    useStudio.getState().openContextMenu({ on: 'text', text, x: e.clientX, y: e.clientY })
  })
}
