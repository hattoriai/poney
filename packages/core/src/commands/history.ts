import type { PoneyDocument } from '../schema/document'
import { applyCommand, type Command } from './commands'

/**
 * Undo/redo over immutable documents. Because commands never mutate, the
 * previous document is the undo state; structural sharing keeps it cheap.
 */
export interface History {
  past: { doc: PoneyDocument; command: Command }[]
  present: PoneyDocument
  future: { doc: PoneyDocument; command: Command }[]
}

export const createHistory = (doc: PoneyDocument): History => ({ past: [], present: doc, future: [] })

export function execute(h: History, command: Command): History {
  const next = applyCommand(h.present, command)
  return { past: [...h.past, { doc: h.present, command }], present: next, future: [] }
}

export function undo(h: History): History {
  const last = h.past[h.past.length - 1]
  if (!last) return h
  return { past: h.past.slice(0, -1), present: last.doc, future: [{ doc: h.present, command: last.command }, ...h.future] }
}

export function redo(h: History): History {
  const [next, ...rest] = h.future
  if (!next) return h
  return { past: [...h.past, { doc: h.present, command: next.command }], present: next.doc, future: rest }
}
