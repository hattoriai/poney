import type { Command, ModelIndex, Ref } from '@hattoriai/poney-core'
import { indexOf } from '@hattoriai/poney-core'
import { useStudio } from './store'

/**
 * Renaming an element where it is drawn. One model feeds every diagram, so a
 * new name shows everywhere the element appears. Undo puts the old name back.
 */

/** The kinds of element that have a name a person can change. */
const RENAMEABLE = new Set(['entity', 'relationship', 'message', 'state', 'transition', 'activityNode'])
export const canRename = (ref: Ref) => RENAMEABLE.has(ref.kind)

/** The name as drawn: an entity's or state's name, a line's or message's label, a transition's event. */
export function nameOf(idx: ModelIndex, ref: Ref): string | undefined {
  switch (ref.kind) {
    case 'entity':
      return idx.entities.get(ref.id)?.name
    case 'relationship':
      return idx.relationships.get(ref.id)?.label
    case 'message':
      return idx.messages(ref.behavior).find((m) => m.message.id === ref.id)?.message.label
    case 'state':
      return idx.stateMachine(ref.behavior)?.states.find((s) => s.id === ref.id)?.name
    case 'transition':
      return idx.stateMachine(ref.behavior)?.transitions.find((t) => t.id === ref.id)?.event
    case 'activityNode': {
      const b = idx.behaviors.get(ref.behavior)
      return b?.kind === 'activity' ? b.nodes.find((n) => n.id === ref.id)?.label : undefined
    }
    default:
      return undefined
  }
}

function commandFor(ref: Ref, value: string): Command | undefined {
  switch (ref.kind) {
    case 'entity':
      return { type: 'entity.update', id: ref.id, changes: { name: value } }
    case 'relationship':
      return { type: 'relationship.update', id: ref.id, changes: { label: value } }
    case 'message':
    case 'state':
    case 'transition':
    case 'activityNode':
      return { type: 'behavior.rename', behaviorId: ref.behavior, element: ref.kind, id: ref.id, value }
    default:
      return undefined
  }
}

/**
 * Opens the name field on the element: exactly over its drawn name, in the
 * same font at the current zoom, when the name is drawn inside it; else over
 * the element.
 */
export function startRename(ref: Ref, element: Element) {
  const s = useStudio.getState()
  if (!s.history || !canRename(ref)) return false
  const value = nameOf(indexOf(s.history.present), ref)
  if (value === undefined) return false
  const box = element.getBoundingClientRect()
  // The drawn name may be cut with "…", so it is the text the name starts with.
  const text = [...element.querySelectorAll<SVGTextElement>('text')].find((t) => {
    const shown = (t.textContent ?? '').replace(/…$/, '')
    return shown.length > 0 && value.startsWith(shown)
  })
  if (text) {
    const r = text.getBoundingClientRect()
    const scale = text.getScreenCTM()?.a ?? 1
    const size = parseFloat(text.getAttribute('font-size') ?? getComputedStyle(text).fontSize) * scale
    const center = text.getAttribute('text-anchor') === 'middle'
    // The box widens to fit the name once it is saved; while typing, the field may grow past it.
    const room = center ? Math.max(r.width, box.width - 16 * scale, 280) : Math.max(box.right - r.left - 12 * scale, 320)
    s.setRenaming({ ref, value, text, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, room, font: { size, weight: text.getAttribute('font-weight') ?? '600' }, align: center ? 'center' : 'left' })
  } else {
    s.setRenaming({ ref, value, rect: { x: box.x, y: box.y, w: box.width, h: box.height }, room: Math.max(box.width, 160), font: { size: 14, weight: '600' }, align: 'center' })
  }
  return true
}

export function finishRename(value: string | null) {
  const s = useStudio.getState()
  const r = s.renaming
  s.setRenaming(null)
  if (!r || value === null) return
  const next = value.trim()
  if (!next || next === r.value) return
  const command = commandFor(r.ref, next)
  if (command) s.dispatch(command)
}
