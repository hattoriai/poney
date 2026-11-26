import { indexOf, isDefined, refKey, type PoneyDocument, type ViewOf } from '@poney/core'
import { measure } from './text'
import type { Point, Rect, SceneBase } from './types'

/**
 * Use case layout: people on the left, supporting systems on the right, the
 * system boundary in the middle with capabilities grouped by area. Each actor
 * sits level with the capabilities it uses, so lines stay short.
 */
export interface UseCaseScene extends SceneBase {
  boundary: Rect & { title: string }
  areas: (Rect & { label: string })[]
  capabilities: (Rect & { id: string; name: string })[]
  actors: (Rect & { entityId: string; side: 'left' | 'right' })[]
  associations: { id: string; actor: string; capability: string; side: 'left' | 'right'; from: Point; to: Point }[]
  includes: { id: string; from: string; to: string; a: Point; b: Point; bulge: number }[]
}

const ACTOR = { w: 168, h: 96 }
const PILL_H = 40
const ROW = 52

export function layoutUseCase(doc: PoneyDocument, view: ViewOf<'usecase'>): UseCaseScene {
  const idx = indexOf(doc)
  const caps = view.capabilities.map((id) => idx.capabilities.get(id)).filter(isDefined)
  const areaNames: string[] = []
  for (const c of caps) if (!areaNames.includes(c.area)) areaNames.push(c.area)

  const pillW = Math.min(340, Math.max(240, ...caps.map((c) => measure(c.name, 13.5, 600) + 56)))
  const boundaryX = ACTOR.w + 200
  const boundaryW = pillW + 140
  const capX = boundaryX + (boundaryW - pillW) / 2
  let y = 76
  const areas: UseCaseScene['areas'] = []
  const capabilities: UseCaseScene['capabilities'] = []
  for (const area of areaNames) {
    const top = y
    y += 34
    for (const c of caps.filter((x) => x.area === area)) {
      capabilities.push({ id: c.id, name: c.name, x: capX, y, w: pillW, h: PILL_H })
      y += ROW
    }
    y += 6
    areas.push({ label: area, x: boundaryX + 16, y: top, w: boundaryW - 32, h: y - top })
    y += 14
  }
  const boundary = { x: boundaryX, y: 24, w: boundaryW, h: y + 4 - 24, title: doc.project.name }
  const capById = new Map(capabilities.map((c) => [c.id, c]))

  const place = (ids: string[], side: 'left' | 'right') => {
    const x = side === 'left' ? 24 : boundaryX + boundaryW + 176
    const wanted = ids.map((id) => {
      const mine = caps.filter((c) => (side === 'left' ? c.actors : c.supporting).includes(id)).map((c) => capById.get(c.id)!)
      const cy = mine.reduce((s, r) => s + r.y + r.h / 2, 0) / Math.max(1, mine.length)
      return { id, cy }
    })
    wanted.sort((a, b) => a.cy - b.cy)
    let floor = 0
    return wanted.map(({ id, cy }) => {
      const top = Math.max(floor, cy - ACTOR.h / 2)
      floor = top + ACTOR.h + 28
      return { entityId: id, side, x, y: top, w: ACTOR.w, h: ACTOR.h }
    })
  }
  const primary = [...new Set(caps.flatMap((c) => c.actors))]
  const supporting = [...new Set(caps.flatMap((c) => c.supporting))].filter((id) => !primary.includes(id))
  const actors = [...place(primary, 'left'), ...place(supporting, 'right')]
  const actorById = new Map(actors.map((a) => [a.entityId, a]))

  const associations: UseCaseScene['associations'] = []
  for (const c of caps) {
    const r = capById.get(c.id)!
    for (const a of c.actors) {
      const box = actorById.get(a)
      if (box) associations.push({ id: `${a}->${c.id}`, actor: a, capability: c.id, side: 'left', from: { x: box.x + box.w - 22, y: box.y + 30 }, to: { x: r.x, y: r.y + r.h / 2 } })
    }
    for (const a of c.supporting) {
      const box = actorById.get(a)
      if (box?.side === 'right') associations.push({ id: `${a}->${c.id}`, actor: a, capability: c.id, side: 'right', from: { x: box.x + 22, y: box.y + 30 }, to: { x: r.x + r.w, y: r.y + r.h / 2 } })
    }
  }
  const includes: UseCaseScene['includes'] = []
  for (const c of caps)
    for (const inc of c.includes) {
      const a = capById.get(c.id)
      const b = capById.get(inc)
      if (!a || !b) continue
      includes.push({ id: `${c.id}=>${inc}`, from: c.id, to: inc, a: { x: a.x + a.w - 24, y: a.y + a.h }, b: { x: b.x + b.w - 24, y: b.y }, bulge: 0 })
    }

  const width = Math.max(...actors.map((a) => a.x + a.w), boundary.x + boundary.w) + 32
  const height = Math.max(boundary.y + boundary.h, ...actors.map((a) => a.y + a.h)) + 32
  const anchors: Record<string, Rect> = {}
  for (const c of capabilities) anchors[refKey({ kind: 'capability', id: c.id })] = c
  for (const a of actors) anchors[refKey({ kind: 'entity', id: a.entityId })] = a
  return { width, height, boundary, areas, capabilities, actors, associations, includes, anchors }
}
