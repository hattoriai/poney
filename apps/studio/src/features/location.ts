import { indexOf, parseRef } from '@hattoriai/poney-core'
import { OVERVIEW, useStudio } from './store'

/**
 * Keeps the address bar in step with the current view and selection, so a
 * link opens the same place: #/<view>?select=<kind>:<id>.
 */
export function readLocation() {
  const m = /^#\/([^?]*)(?:\?select=(.+))?$/.exec(window.location.hash)
  if (!m) return
  const s = useStudio.getState()
  const idx = indexOf(s.history.present)
  const viewId = decodeURIComponent(m[1]) || OVERVIEW
  const walk = viewId.startsWith('walk:') && idx.doc.walkthroughs.some((w) => `walk:${w.id}` === viewId)
  if (viewId !== OVERVIEW && !walk && !idx.views.has(viewId)) return
  const ref = m[2] ? parseRef(decodeURIComponent(m[2])) : null
  s.navigate(viewId, { select: ref })
}


export function writeLocation(viewId: string, ref: unknown, key: string | null) {
  const hash = `#/${viewId === OVERVIEW ? '' : encodeURIComponent(viewId)}${ref && key ? `?select=${encodeURIComponent(key)}` : ''}`
  if (window.location.hash !== hash) window.history.replaceState(null, '', hash)
}
