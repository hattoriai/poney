import { indexOf, refKey, type ActivityNode, type PoneyDocument, type ViewOf } from '@hattoriai/poney-core'
import { union } from './geometry'
import { measure, wrap } from './text'
import type { Point, Rect, SceneBase } from './types'

/**
 * Activity layout: one column per performer (swimlanes), one row per step
 * of the longest path from the start. Loops route back up a channel on the
 * right so they never cross the forward flow.
 */
export interface ActivityLane {
  entityId?: string
  label: string
  x: number
  w: number
}

export interface ActivitySceneNode extends Rect {
  id: string
  kind: ActivityNode['kind']
  label: string
  lines: string[]
  outcome?: 'success' | 'failure'
  lane: number
  rank: number
}

export interface ActivitySceneEdge {
  id: string
  from: string
  to: string
  points: Point[]
  guard?: string
  guardAt?: Point & { anchor: 'start' | 'end' | 'middle' }
  back: boolean
}

export interface ActivityScene extends SceneBase {
  processId: string
  lanes: ActivityLane[]
  laneHeader: number
  nodes: ActivitySceneNode[]
  edges: ActivitySceneEdge[]
}

const ROW = 92
const HEADER = 52
const TOP = HEADER + 40
const CELL = 212

export function layoutActivity(doc: PoneyDocument, view: ViewOf<'activity'>): ActivityScene {
  const idx = indexOf(doc)
  const process = idx.activity(view.activity)
  if (!process) throw new Error(`Unknown activity "${view.activity}"`)
  const nodes = process.nodes
  const out = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  for (const f of process.flows) {
    out.set(f.from, [...(out.get(f.from) ?? []), f.to])
    incoming.set(f.to, [...(incoming.get(f.to) ?? []), f.from])
  }

  // ── Back edges by depth-first search from the start. ───────────────────
  const start = nodes.find((n) => n.kind === 'initial') ?? nodes[0]
  const back = new Set<string>()
  const state = new Map<string, 'open' | 'done'>()
  const dfs = (id: string) => {
    state.set(id, 'open')
    for (const f of process.flows.filter((x) => x.from === id)) {
      const s = state.get(f.to)
      if (s === 'open') back.add(f.id)
      else if (!s) dfs(f.to)
    }
    state.set(id, 'done')
  }
  dfs(start.id)
  nodes.forEach((n) => !state.has(n.id) && dfs(n.id))

  // ── Ranks: longest path over forward edges. ─────────────────────────────
  const forward = process.flows.filter((f) => !back.has(f.id))
  const rank = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  forward.forEach((f) => indeg.set(f.to, (indeg.get(f.to) ?? 0) + 1))
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id)
  while (queue.length) {
    const id = queue.shift()!
    for (const f of forward.filter((x) => x.from === id)) {
      rank.set(f.to, Math.max(rank.get(f.to)!, rank.get(id)! + 1))
      indeg.set(f.to, indeg.get(f.to)! - 1)
      if (indeg.get(f.to) === 0) queue.push(f.to)
    }
  }

  // ── Lanes. ──────────────────────────────────────────────────────────────
  const performers: (string | undefined)[] = []
  if (view.swimlanes) for (const n of nodes) if (!performers.includes(n.performedBy)) performers.push(n.performedBy)
  if (performers.length === 0) performers.push(undefined)
  const laneOf = (n: ActivityNode) => (view.swimlanes ? performers.indexOf(n.performedBy) : 0)
  const cells = new Map<string, string[]>()
  for (const n of nodes) {
    const key = `${laneOf(n)}:${rank.get(n.id)}`
    cells.set(key, [...(cells.get(key) ?? []), n.id])
  }
  const laneWidth = performers.map((_, li) => Math.max(240, ...[...cells.entries()].filter(([k]) => k.startsWith(`${li}:`)).map(([, v]) => v.length * CELL + 28)))
  const lanes: ActivityLane[] = []
  let lx = 0
  performers.forEach((p, i) => {
    lanes.push({ entityId: p, label: p ? idx.entities.get(p)?.name ?? p : view.swimlanes ? 'Unassigned' : process.name, x: lx, w: laneWidth[i] })
    lx += laneWidth[i]
  })

  // ── Node boxes. ─────────────────────────────────────────────────────────
  const scene = new Map<string, ActivitySceneNode>()
  for (const n of nodes) {
    const li = laneOf(n)
    const r = rank.get(n.id)!
    const cell = cells.get(`${li}:${r}`)!
    const slot = cell.indexOf(n.id)
    const cx = lanes[li].x + lanes[li].w / 2 + (slot - (cell.length - 1) / 2) * CELL
    const cy = TOP + r * ROW
    let w = 0
    let h = 0
    let lines = [n.label]
    switch (n.kind) {
      case 'initial':
        w = h = 22
        break
      case 'final':
        w = h = 26
        break
      case 'fork':
      case 'join':
        w = 120
        h = 6
        break
      case 'decision':
      case 'merge':
        w = Math.max(96, measure(n.label, 12.5, 600) + 60)
        h = 54
        break
      default:
        lines = wrap(n.label, 156, 13, 500, 2)
        w = Math.min(188, Math.max(124, Math.max(...lines.map((l) => measure(l, 13, 500))) + 32))
        h = lines.length > 1 ? 58 : 42
    }
    scene.set(n.id, { id: n.id, kind: n.kind, label: n.label, lines, outcome: n.outcome, lane: li, rank: r, x: cx - w / 2, y: cy - h / 2, w, h })
  }
  // Bars span the nodes they split to or join from.
  for (const n of scene.values()) {
    if (n.kind !== 'fork' && n.kind !== 'join') continue
    const others = (n.kind === 'fork' ? out.get(n.id) : incoming.get(n.id))?.map((id) => scene.get(id)!) ?? []
    if (others.length < 2) continue
    const xs = others.map((o) => o.x + o.w / 2)
    const lo = Math.min(...xs, n.x + n.w / 2) - 28
    const hi = Math.max(...xs, n.x + n.w / 2) + 28
    n.x = lo
    n.w = hi - lo
  }

  // ── Edges. ──────────────────────────────────────────────────────────────
  const cx = (n: Rect) => n.x + n.w / 2
  const cy = (n: Rect) => n.y + n.h / 2
  // Each branch of a decision leaves from its own corner.
  const exits = new Map<string, 'left' | 'right' | 'bottom'>()
  for (const n of scene.values()) {
    if (n.kind !== 'decision') continue
    const outs = process.flows.filter((f) => f.from === n.id && !back.has(f.id))
    const sorted = outs.slice().sort((a, b) => cx(scene.get(a.to)!) - cx(scene.get(b.to)!))
    const free = new Set<'left' | 'right' | 'bottom'>(['left', 'bottom', 'right'])
    const want = (f: (typeof outs)[number]) => {
      const d = cx(scene.get(f.to)!) - cx(n)
      return Math.abs(d) < 2 ? 'bottom' : d < 0 ? 'left' : 'right'
    }
    for (const f of sorted) {
      const w = want(f)
      const order: ('left' | 'right' | 'bottom')[] = w === 'left' ? ['left', 'bottom', 'right'] : w === 'right' ? ['right', 'bottom', 'left'] : ['bottom', 'left', 'right']
      const pick = order.find((o) => free.has(o)) ?? 'bottom'
      free.delete(pick)
      exits.set(f.id, pick)
    }
    for (const f of process.flows.filter((x) => x.from === n.id && back.has(x.id))) exits.set(f.id, free.has('right') ? 'right' : 'bottom')
  }

  const edges: ActivitySceneEdge[] = []
  let channels = 0
  for (const f of process.flows) {
    const a = scene.get(f.from)!
    const b = scene.get(f.to)!
    if (back.has(f.id)) {
      const lo = Math.min(b.rank, a.rank)
      const hi = Math.max(b.rank, a.rank)
      const minX = Math.min(a.x, b.x)
      const maxX = Math.max(a.x + a.w, b.x + b.w)
      const between = [...scene.values()].filter((n) => n.rank >= lo && n.rank <= hi && n.x + n.w >= minX - CELL / 2 && n.x <= maxX + CELL / 2)
      const channel = Math.max(...between.map((n) => n.x + n.w)) + 28 + channels++ * 14
      // Leave downward into the gap between rows, then run to the channel and up.
      const gapY = a.y + a.h + 16 + (channels - 1) * 6
      const start = exits.get(f.id) === 'right' ? { x: a.x + a.w, y: cy(a) } : { x: cx(a), y: a.y + a.h }
      const points =
        exits.get(f.id) === 'right'
          ? [start, { x: channel, y: start.y }, { x: channel, y: cy(b) }, { x: b.x + b.w, y: cy(b) }]
          : [start, { x: start.x, y: gapY }, { x: channel, y: gapY }, { x: channel, y: cy(b) }, { x: b.x + b.w, y: cy(b) }]
      edges.push({ id: f.id, from: f.from, to: f.to, points, guard: f.guard, guardAt: f.guard ? { x: start.x + 8, y: start.y + 14, anchor: 'start' } : undefined, back: true })
      continue
    }
    const ex = b.kind === 'join' ? cx(a) : cx(b)
    const end = { x: ex, y: b.y }
    let points: Point[]
    let guardAt: ActivitySceneEdge['guardAt']
    const exit = a.kind === 'decision' ? exits.get(f.id) : undefined
    if (exit === 'left' || exit === 'right') {
      const s = { x: exit === 'right' ? a.x + a.w : a.x, y: cy(a) }
      points = Math.abs(ex - s.x) < 1 ? [s, end] : [s, { x: ex, y: s.y }, end]
      guardAt = { x: s.x + (exit === 'right' ? 10 : -10), y: s.y - 9, anchor: exit === 'right' ? 'start' : 'end' }
    } else {
      const sx = a.kind === 'fork' ? cx(b) : cx(a)
      const s = { x: sx, y: a.y + a.h }
      const midY = end.y - 22
      points = Math.abs(s.x - end.x) < 1 ? [s, end] : [s, { x: s.x, y: midY }, { x: end.x, y: midY }, end]
      guardAt = { x: s.x + 8, y: s.y + 16, anchor: 'start' }
    }
    edges.push({ id: f.id, from: f.from, to: f.to, points, guard: f.guard, guardAt: f.guard ? guardAt : undefined, back: false })
  }

  const all = [...scene.values()]
  const maxRight = Math.max(lx, ...edges.flatMap((e) => e.points.map((p) => p.x + 24)))
  const height = Math.max(...all.map((n) => n.y + n.h)) + 72
  if (maxRight > lx) lanes[lanes.length - 1].w += maxRight - lx

  const anchors: Record<string, Rect> = {}
  for (const n of all) anchors[refKey({ kind: 'activityNode', behavior: process.id, id: n.id })] = n
  for (const e of edges) anchors[refKey({ kind: 'activityFlow', behavior: process.id, id: e.id })] = union(e.points.map((p) => ({ ...p, w: 1, h: 1 })))
  lanes.forEach((l) => {
    if (l.entityId) anchors[refKey({ kind: 'entity', id: l.entityId })] = { x: l.x, y: 0, w: l.w, h: HEADER }
  })
  anchors[refKey({ kind: 'behavior', id: process.id })] = { x: 0, y: 0, w: maxRight, h: height }

  return { processId: process.id, width: Math.max(lx, maxRight), height, lanes, laneHeader: HEADER, nodes: all, edges, anchors }
}
