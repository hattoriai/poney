import { useMemo } from 'react'
import type { Badge, Effect } from '@hattoriai/poney-core'
import { useStudio } from './store'

/**
 * The live facts shown on the parts (test coverage, recent changes…), as
 * effects and badges. Walkthrough scenes add them to their own; explorer
 * diagrams draw them alone.
 */
export function useOverlayFacts(): { effects: Effect[]; badges: Badge[] } {
  const overlays = useStudio((s) => s.overlays)
  return useMemo(() => {
    const marks = Object.values(overlays).flatMap((o) => o.marks)
    return {
      effects: marks.flatMap((m) => (m.effect ? [{ target: m.target, as: m.effect }] : [])),
      badges: marks.flatMap((m) => (m.badge ? [{ target: m.target, text: m.badge.text, tone: m.badge.tone }] : [])),
    }
  }, [overlays])
}

/** Items by their target ref key. */
export function byTarget<T extends { target: string }>(items: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const it of items) out.set(it.target, [...(out.get(it.target) ?? []), it])
  return out
}
