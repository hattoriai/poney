import { indexOf, type Ref } from '@poney/core'
import { OVERVIEW, useStudio } from './store'

/**
 * Shows an element: in the current diagram when it is there, otherwise in
 * the diagram that shows it best. The element stays selected after the move.
 */
export function revealRef(ref: Ref) {
  const s = useStudio.getState()
  const idx = indexOf(s.history.present)
  const current = s.viewId !== OVERVIEW ? idx.views.get(s.viewId) : undefined
  if (current && idx.viewShows(current, ref)) {
    s.select(ref, { focus: 'center' })
    return
  }
  const best = idx.bestViewFor(ref)
  if (best) s.navigate(best.id, { select: ref, focus: 'center' })
  else s.select(ref)
}

/** Opens a diagram and, when given, selects an element in it. */
export function openView(viewId: string, ref?: Ref | null) {
  useStudio.getState().navigate(viewId, { select: ref ?? null, focus: ref ? 'center' : undefined })
}
