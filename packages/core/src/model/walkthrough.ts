import type { ChangeState, PoneyDocument, Walkthrough } from '../schema/document'
import { parseRef, refKey } from './refs'

/** The change state of each marked element, by ref key. */
export function marksOf(w: Walkthrough): Map<string, ChangeState> {
  const out = new Map<string, ChangeState>()
  for (const m of w.marks) {
    const ref = parseRef(m.ref)
    if (ref) out.set(refKey(ref), m.state)
  }
  return out
}

/** Walkthroughs that show a view, in a scene or as their overview. */
export function walkthroughsShowing(doc: PoneyDocument, viewId: string): Walkthrough[] {
  return doc.walkthroughs.filter((w) => w.overview === viewId || w.scenes.some((s) => s.view === viewId))
}
