import { indexOf, refKey, type PoneyDocument, type ViewOf } from '@hattoriai/poney-core'
import { measure } from './text'
import type { Point, Rect, SceneBase } from './types'

/**
 * Dependency layout: one horizontal band per layer, top to bottom. Nodes in
 * a band are ordered by the average position of what they connect to, which
 * removes most crossings. Edges are smooth curves, so they read as
 * "depends on" rather than as wires. An edge that crosses more than one
 * band goes through a free gap between the nodes of each band it crosses,
 * so it never passes behind a node.
 */
export interface DependencyScene extends SceneBase {
  bands: (Rect & { id: string; label: string; description?: string })[]
  nodes: (Rect & { entityId: string; band: number })[]
  /** Cubic Bézier segments, chained: start, then (control, control, end) for each segment. */
  edges: { id: string; source: string; target: string; kind: string; d: Point[]; direction: 'down' | 'up' | 'across' }[]
}

const BAND_H = 132
const LABEL_W = 168
const NODE_H = 58
const GAP = 28
/** Space kept between an edge and a node it passes. */
const CLEAR = 14
/** Space between edges that share a gap. */
const LANE = 9

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

  // Free gaps in each band, and how many edges already pass through each.
  const used = new Map<string, number>()
  const gaps = rows.map((row) => {
    const xs = row.map((id) => byId.get(id)!).sort((m, n) => m.x - n.x)
    const out: { from: number; to: number }[] = []
    let left = LABEL_W + 24 - GAP
    for (const n of xs) {
      out.push({ from: left + CLEAR, to: n.x - CLEAR })
      left = n.x + n.w
    }
    out.push({ from: left + CLEAR, to: totalW - CLEAR })
    return out.filter((g) => g.to >= g.from)
  })
  /** Where an edge crosses band b, near x: inside a free gap, beside the edges already there. */
  const corridor = (b: number, x: number) => {
    let best = { gap: 0, x, cost: Infinity }
    gaps[b].forEach((g, i) => {
      const at = Math.min(g.to, Math.max(g.from, x))
      if (Math.abs(at - x) < best.cost) best = { gap: i, x: at, cost: Math.abs(at - x) }
    })
    const key = `${b}:${best.gap}`
    const n = used.get(key) ?? 0
    used.set(key, n + 1)
    const g = gaps[b][best.gap]
    // Later edges step aside, alternately right and left, staying in the gap.
    const shifted = best.x + (n === 0 ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) * LANE)
    return Math.min(g.to, Math.max(g.from, shifted))
  }
  /** A vertical curve from p to q, leaving and arriving straight. */
  const curve = (p: Point, q: Point): Point[] => {
    const k = Math.max(20, Math.abs(q.y - p.y) * 0.45) * (q.y >= p.y ? 1 : -1)
    return [{ x: p.x, y: p.y + k }, { x: q.x, y: q.y - k }, q]
  }

  const edges: DependencyScene['edges'] = plan.map(({ r, a, b, direction, out, inn }) => {
    const p0 = { x: portX(r.source, out, r.id, b), y: out === 'bottom' ? a.y + a.h : a.y }
    const p3 = { x: portX(r.target, inn, r.id, a), y: inn === 'top' ? b.y : b.y + b.h }
    if (direction === 'across') {
      const lift = 46
      return { id: r.id, source: r.source, target: r.target, kind: r.kind, d: [p0, { x: p0.x, y: p0.y - lift }, { x: p3.x, y: p3.y - lift }, p3], direction }
    }
    // Through each band between the two, straight down a free gap, past the nodes' top and bottom.
    const s = direction === 'down' ? 1 : -1
    const between: number[] = []
    for (let k = a.band + s; k !== b.band; k += s) between.push(k)
    const d: Point[] = [p0]
    let at = p0
    between.forEach((k, i) => {
      const t = (i + 1) / (between.length + 1)
      const x = corridor(k, p0.x + (p3.x - p0.x) * t)
      const top = k * BAND_H + (BAND_H - NODE_H) / 2 - 6
      const bottom = top + NODE_H + 12
      const enter = { x, y: s > 0 ? top : bottom }
      const exit = { x, y: s > 0 ? bottom : top }
      d.push(...curve(at, enter), { x, y: enter.y + (exit.y - enter.y) / 3 }, { x, y: enter.y + ((exit.y - enter.y) * 2) / 3 }, exit)
      at = exit
    })
    d.push(...curve(at, p3))
    return { id: r.id, source: r.source, target: r.target, kind: r.kind, d, direction }
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
