import { indexOf, refKey, type PoneyDocument, type ViewOf } from '@poney/core'
import { measure } from './text'
import type { Point, Rect, SceneBase } from './types'

/**
 * Dependency layout: one horizontal band per layer, top to bottom. Nodes in
 * a band are ordered by the average position of what they connect to, which
 * removes most crossings. Edges are smooth curves, so they read as
 * "depends on" rather than as wires.
 */
export interface DependencyScene extends SceneBase {
  bands: (Rect & { id: string; label: string; description?: string })[]
  nodes: (Rect & { entityId: string; band: number })[]
  edges: { id: string; source: string; target: string; kind: string; d: Point[]; direction: 'down' | 'up' | 'across' }[]
}

const BAND_H = 132
const LABEL_W = 168
const NODE_H = 58
const GAP = 28

export function layoutDependency(doc: PoneyDocument, view: ViewOf<'dependency'>): DependencyScene {
  const idx = indexOf(doc)
  const shown = new Set(view.entities)
  const bandOf = new Map<string, number>()
  view.layers.forEach((l, i) => l.members.forEach((m) => shown.has(m) && bandOf.set(m, i)))
  for (const id of view.entities) if (!bandOf.has(id)) bandOf.set(id, view.layers.length - 1)
  const rels = (view.relationships ?? doc.model.relationships.filter((r) => shown.has(r.source) && shown.has(r.target)).map((r) => r.id))
    .map((id) => idx.relationships.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r && shown.has(r.source) && shown.has(r.target))

  const width = (id: string) => Math.ceil(Math.max(184, measure(idx.entities.get(id)?.name ?? id, 13.5, 600) + 70))
  const rows: string[][] = view.layers.map((_, i) => view.entities.filter((id) => bandOf.get(id) === i))

  // Barycentric ordering: two sweeps down, one up.
  const pos = new Map<string, number>()
  const assign = () => rows.forEach((row) => row.forEach((id, i) => pos.set(id, i / Math.max(1, row.length - 1))))
  assign()
  const neighbors = (id: string) => rels.flatMap((r) => (r.source === id ? [r.target] : r.target === id ? [r.source] : []))
  const sweep = (order: number[]) => {
    for (const b of order) {
      const row = rows[b]
      const score = new Map(row.map((id) => {
        const ns = neighbors(id).filter((n) => bandOf.get(n) !== b)
        return [id, ns.length ? ns.reduce((s, n) => s + pos.get(n)!, 0) / ns.length : pos.get(id)!]
      }))
      row.sort((a, c) => score.get(a)! - score.get(c)!)
      row.forEach((id, i) => pos.set(id, i / Math.max(1, row.length - 1)))
    }
  }
  const down = rows.map((_, i) => i)
  sweep(down.slice(1))
  sweep(down.slice(0, -1).reverse())
  sweep(down.slice(1))

  const rowWidth = rows.map((row) => row.reduce((s, id) => s + width(id), 0) + Math.max(0, row.length - 1) * GAP)
  const content = Math.max(...rowWidth, 400)
  const nodes: DependencyScene['nodes'] = []
  rows.forEach((row, b) => {
    let x = LABEL_W + 24 + (content - rowWidth[b]) / 2
    for (const id of row) {
      nodes.push({ entityId: id, band: b, x, y: b * BAND_H + (BAND_H - NODE_H) / 2, w: width(id), h: NODE_H })
      x += width(id) + GAP
    }
  })
  const byId = new Map(nodes.map((n) => [n.entityId, n]))
  const totalW = LABEL_W + 24 + content + 40
  const bands = view.layers.map((l, i) => ({ id: l.id, label: l.label, description: l.description, x: 0, y: i * BAND_H, w: totalW, h: BAND_H }))

  // Spread ports so parallel edges do not overlap.
  const ports = new Map<string, string[]>()
  const portKey = (id: string, side: 'top' | 'bottom') => `${id}:${side}`
  const plan = rels.map((r) => {
    const a = byId.get(r.source)!
    const b = byId.get(r.target)!
    const direction: 'down' | 'up' | 'across' = b.band > a.band ? 'down' : b.band < a.band ? 'up' : 'across'
    const out = direction === 'down' ? 'bottom' : 'top'
    const inn = direction === 'down' ? 'top' : direction === 'up' ? 'bottom' : 'top'
    ports.set(portKey(r.source, out), [...(ports.get(portKey(r.source, out)) ?? []), r.id])
    ports.set(portKey(r.target, inn), [...(ports.get(portKey(r.target, inn)) ?? []), r.id])
    return { r, a, b, direction, out, inn } as const
  })
  const portX = (id: string, side: 'top' | 'bottom', relId: string, other: Rect) => {
    const n = byId.get(id)!
    const list = (ports.get(portKey(id, side)) ?? []).slice()
    const center = (relOther: string) => {
      const r = idx.relationships.get(relOther)!
      const o = byId.get(r.source === id ? r.target : r.source)!
      return o.x + o.w / 2
    }
    list.sort((p, q) => center(p) - center(q))
    const i = list.indexOf(relId)
    const span = Math.min(n.w * 0.6, (list.length - 1) * 18)
    void other
    return n.x + n.w / 2 - span / 2 + (list.length > 1 ? (i / (list.length - 1)) * span : 0)
  }

  const edges: DependencyScene['edges'] = plan.map(({ r, a, b, direction, out, inn }) => {
    const p0 = { x: portX(r.source, out, r.id, b), y: out === 'bottom' ? a.y + a.h : a.y }
    const p3 = { x: portX(r.target, inn, r.id, a), y: inn === 'top' ? b.y : b.y + b.h }
    let c1: Point
    let c2: Point
    if (direction === 'across') {
      const lift = 46
      c1 = { x: p0.x, y: p0.y - lift }
      c2 = { x: p3.x, y: p3.y - lift }
    } else {
      const k = Math.max(40, Math.abs(p3.y - p0.y) * 0.45)
      const s = direction === 'down' ? 1 : -1
      c1 = { x: p0.x, y: p0.y + k * s }
      c2 = { x: p3.x, y: p3.y - k * s }
    }
    return { id: r.id, source: r.source, target: r.target, kind: r.kind, d: [p0, c1, c2, p3], direction }
  })

  const anchors: Record<string, Rect> = {}
  for (const n of nodes) anchors[refKey({ kind: 'entity', id: n.entityId })] = n
  for (const b of bands) anchors[refKey({ kind: 'group', view: view.id, id: b.id })] = b
  for (const e of edges) {
    const xs = e.d.map((p) => p.x)
    const ys = e.d.map((p) => p.y)
    anchors[refKey({ kind: 'relationship', id: e.id })] = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  }
  return { width: totalW, height: view.layers.length * BAND_H, bands, nodes, edges, anchors }
}
