import { indexOf, refKey, type Entity, type Relationship, type PoneyDocument, type ViewOf } from '@poney/core'
import { BASE_OPTIONS, runElk, type ElkNode } from './elk'
import { measure } from './text'
import type { Point, Rect, SceneBase } from './types'

/**
 * Map layout: a small, composed picture of how things connect.
 *
 * ELK chooses the columns and the order inside each column. The edges are
 * then drawn as single soft curves from side to side, and each label slides
 * along its curve until it is clear of boxes and other labels. Few shapes,
 * lots of air: a map is read at a glance, not explored.
 *
 * An entity whose parent is also in the map is drawn inside it: the parent
 * becomes a group. A closed group is one box; the lines of everything inside
 * it join at that box, so a large codebase can be shown a few boxes at a time.
 */
export interface MapSceneNode extends Rect {
  entityId: string
  /** A closed group: every entity inside it, drawn as this one box. */
  members?: string[]
}

/** An open group: a frame around the entities inside it. */
export interface MapSceneGroup extends Rect {
  entityId: string
  /** Every entity inside, at any depth. */
  members: string[]
  /** 0 for a group at the top, 1 inside another group, and so on. */
  depth: number
}

export interface MapSceneEdge {
  /** The relationship this line stands for (the first one, for a line through a pass-through entity). */
  id: string
  /** Every relationship the line stands for. */
  relationships: string[]
  source: string
  target: string
  /** The entity the line passes through, when the map leaves it out. */
  via?: string
  /** Cubic Bézier: start, control 1, control 2, end. */
  curve: [Point, Point, Point, Point]
  /** Where the label sits, clear of boxes and other labels. */
  label: Rect & { text: string; sub?: string }
  /** When the label sits beside its curve: the point on the curve its leader line goes to. */
  leader?: Point
}

export interface MapScene extends SceneBase {
  nodes: MapSceneNode[]
  groups: MapSceneGroup[]
  edges: MapSceneEdge[]
}

export interface MapLayoutOptions {
  /** Entities to draw that are not in the model, such as ones a change removed. */
  extraEntities?: Entity[]
  extraRelationships?: Relationship[]
  /** Groups drawn closed. Defaults to the view's own list. */
  collapsed?: string[]
}

/** The space at the top of an open group, for its name. */
export const GROUP = { head: 52, pad: 24 } as const

export const MAP = { h: 72, gapX: 120, gapY: 44, minW: 184, maxW: 260 } as const
export const LABEL = { size: 12, h: 22, subH: 36 } as const

export function mapNodeWidth(name: string) {
  return Math.round(Math.min(MAP.maxW, Math.max(MAP.minW, measure(name, 15, 600) + 76)))
}

export function mapLabelSize(text: string, sub?: string) {
  const w = Math.max(measure(text, LABEL.size, 500), sub ? measure(sub, 11, 400) : 0) + 18
  return { w: Math.ceil(w), h: sub ? LABEL.subH : LABEL.h }
}

interface Line {
  id: string
  relationships: string[]
  source: string
  target: string
  via?: string
  text: string
}

export async function layoutMap(doc: PoneyDocument, view: ViewOf<'map'>, options: MapLayoutOptions = {}): Promise<MapScene> {
  const idx = indexOf(doc)
  const extra = new Map((options.extraEntities ?? []).map((e) => [e.id, e]))
  const entity = (id: string) => idx.entities.get(id) ?? extra.get(id)
  const through = new Set(view.passThrough)
  const ids = [...view.entities.filter((id) => idx.entities.has(id) && !through.has(id)), ...[...extra.keys()].filter((id) => !view.entities.includes(id))]
  const shown = new Set(ids)
  const listed = view.relationships ? new Set(view.relationships) : undefined
  const all = [...doc.model.relationships, ...(options.extraRelationships ?? [])]
  const candidate = (r: Relationship) => !listed || listed.has(r.id) || (options.extraRelationships ?? []).includes(r)

  // Direct lines, and lines through the entities the map leaves out.
  const lines: Line[] = all.filter((r) => candidate(r) && shown.has(r.source) && shown.has(r.target)).map((r) => ({ id: r.id, relationships: [r.id], source: r.source, target: r.target, text: r.label }))
  for (const hop of through) {
    const ins = all.filter((r) => candidate(r) && r.target === hop && shown.has(r.source))
    const outs = all.filter((r) => candidate(r) && r.source === hop && shown.has(r.target))
    for (const a of ins)
      for (const b of outs) lines.push({ id: a.id, relationships: [a.id, b.id], source: a.source, target: b.target, via: hop, text: a.label })
  }

  // Groups: an entity inside another shown entity is drawn inside it.
  const shownParent = (id: string) => {
    let p = entity(id)?.parent
    for (let guard = 0; p && !shown.has(p) && guard < 32; guard++) p = entity(p)?.parent
    return p && shown.has(p) && p !== id ? p : undefined
  }
  const children = new Map<string, string[]>()
  for (const id of ids) {
    const p = shownParent(id)
    if (p) children.set(p, [...(children.get(p) ?? []), id])
  }
  const closed = new Set((options.collapsed ?? view.collapsed).filter((id) => children.has(id)))
  const ancestors = (id: string) => {
    const out: string[] = []
    for (let p = shownParent(id); p && out.length < 32 && !out.includes(p); p = shownParent(p)) out.push(p)
    return out
  }
  /** The box an entity is drawn as: itself, or the outermost closed group around it. */
  const rep = (id: string) => [id, ...ancestors(id)].filter((a, i) => i === 0 || closed.has(a)).pop()!
  const descendants = (id: string): string[] => (children.get(id) ?? []).flatMap((c) => [c, ...descendants(c)])
  const visible = ids.filter((id) => rep(id) === id)
  const openGroup = (id: string) => children.has(id) && !closed.has(id)

  // Lines join at closed groups. Lines inside one closed group, and lines between a group and what it holds, are not drawn.
  const merged = new Map<string, Line & { texts: string[] }>()
  for (const l of lines) {
    const source = rep(l.source)
    const target = rep(l.target)
    if (source === target || ancestors(source).includes(target) || ancestors(target).includes(source)) continue
    const key = `${source}>${target}`
    const m = merged.get(key)
    if (m) {
      m.relationships.push(...l.relationships)
      m.texts.push(l.text)
    } else merged.set(key, { ...l, source, target, relationships: [...l.relationships], texts: [l.text] })
  }
  lines.length = 0
  for (const m of merged.values()) {
    const texts = [...new Set(m.texts)]
    // Several lines joined at a closed group: name them all when that is short, else the first and a count.
    const joined = texts.join(', ')
    const text = texts.length === 1 ? texts[0] : joined.length <= 40 ? joined : `${texts[0]} +${texts.length - 1} more`
    lines.push({ id: m.id, relationships: m.relationships, source: m.source, target: m.target, via: texts.length > 1 ? undefined : m.via, text })
  }

  /** ELK cannot end an edge on a group; it lays out an edge to the first box inside instead. */
  const elkEnd = (id: string): string => (openGroup(id) ? elkEnd(children.get(id)!.find((c) => rep(c) === c) ?? id) : id)
  const elkNode = (id: string): ElkNode => {
    const name = entity(id)?.name ?? id
    if (!openGroup(id)) return { id, width: mapNodeWidth(name), height: MAP.h, ...view.positions[id] }
    const min = Math.ceil(measure(name, 14, 600) + measure(entity(id)?.technology ?? '', 12, 400) + GROUP.pad * 2 + 40)
    return {
      id,
      layoutOptions: {
        'elk.padding': `[top=${GROUP.head},left=${GROUP.pad},bottom=${GROUP.pad},right=${GROUP.pad}]`,
        'elk.nodeSize.constraints': 'MINIMUM_SIZE',
        'elk.nodeSize.minimum': `(${min}, ${MAP.h})`,
      },
      children: children.get(id)!.filter((c) => rep(c) === c).map(elkNode),
    }
  }

  const down = view.layout.direction === 'down'
  const out = await runElk({
    id: 'root',
    layoutOptions: {
      ...BASE_OPTIONS,
      'elk.direction': down ? 'DOWN' : 'RIGHT',
      'elk.spacing.nodeNode': String(down ? 56 : MAP.gapY),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(down ? 84 : MAP.gapX),
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.padding': '[top=48,left=48,bottom=48,right=48]',
      ...(children.size ? { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' } : {}),
    },
    children: visible.filter((id) => !shownParent(id)).map(elkNode),
    edges: lines.flatMap((l, i) => {
      const [a, b] = [elkEnd(l.source), elkEnd(l.target)]
      return a === b ? [] : [{ id: `e${i}`, sources: [a], targets: [b] }]
    }),
  })

  const box = (id: string): Rect => {
    const n = out.nodes.get(id)!
    return { x: n.x, y: n.y, w: n.w, h: n.h }
  }
  const nodes: MapSceneNode[] = visible.filter((id) => !openGroup(id)).map((id) => ({ ...box(id), entityId: id, ...(closed.has(id) ? { members: descendants(id) } : {}) }))
  const groups: MapSceneGroup[] = visible
    .filter(openGroup)
    .map((id) => ({ ...box(id), entityId: id, members: descendants(id), depth: ancestors(id).length }))
    .sort((a, b) => a.depth - b.depth)
  const byId = new Map<string, Rect>([...nodes.map((n) => [n.entityId, n] as const), ...groups.map((g) => [g.entityId, g] as const)])

  // The axis with the larger gap between two boxes carries the curve.
  const sideOf = (l: Line) => {
    const a = byId.get(l.source)!
    const b = byId.get(l.target)!
    const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w))
    const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h))
    if (gapX >= gapY && gapX > 0) return b.x > a.x ? ({ out: 'right', in: 'left' } as const) : ({ out: 'left', in: 'right' } as const)
    return b.y > a.y ? ({ out: 'bottom', in: 'top' } as const) : ({ out: 'top', in: 'bottom' } as const)
  }

  // Spread the ends of lines that share a side, ordered by where they go.
  const ports = new Map<string, number[]>()
  const plan = lines.map((l, i) => {
    const s = sideOf(l)
    const k1 = `${l.source}:${s.out}`
    const k2 = `${l.target}:${s.in}`
    ports.set(k1, [...(ports.get(k1) ?? []), i])
    ports.set(k2, [...(ports.get(k2) ?? []), i])
    return { l, s, k1, k2, i }
  })
  const center = (id: string) => {
    const n = byId.get(id)!
    return { x: n.x + n.w / 2, y: n.y + n.h / 2 }
  }
  const port = (nodeId: string, side: string, key: string, i: number): Point => {
    const n = byId.get(nodeId)!
    const vertical = side === 'left' || side === 'right'
    const other = (j: number) => center(lines[j].source === nodeId ? lines[j].target : lines[j].source)
    const list = (ports.get(key) ?? []).slice().sort((p, q) => (vertical ? other(p).y - other(q).y : other(p).x - other(q).x))
    const k = list.indexOf(i)
    const span = Math.min((vertical ? n.h : n.w) * 0.55, (list.length - 1) * 14)
    const offset = list.length > 1 ? -span / 2 + (k / (list.length - 1)) * span : 0
    if (side === 'right') return { x: n.x + n.w, y: n.y + n.h / 2 + offset }
    if (side === 'left') return { x: n.x, y: n.y + n.h / 2 + offset }
    if (side === 'bottom') return { x: n.x + n.w / 2 + offset, y: n.y + n.h }
    return { x: n.x + n.w / 2 + offset, y: n.y }
  }

  const taken: Rect[] = [...nodes.map((n) => ({ x: n.x - 6, y: n.y - 6, w: n.w + 12, h: n.h + 12 })), ...groups.map((g) => ({ x: g.x, y: g.y, w: g.w, h: GROUP.head - 8 }))]
  const dirs = { right: [1, 0], left: [-1, 0], bottom: [0, 1], top: [0, -1] } as const

  const curveOf = ({ l, s, k1, k2, i }: (typeof plan)[number]): MapSceneEdge['curve'] => {
    const p0 = port(l.source, s.out, k1, i)
    const p3 = port(l.target, s.in, k2, i)
    const horizontal = s.out === 'left' || s.out === 'right'
    const pull = horizontal ? Math.max(48, Math.abs(p3.x - p0.x) * 0.45) : Math.max(36, Math.abs(p3.y - p0.y) * 0.45)
    const [ox, oy] = dirs[s.out]
    const [ix, iy] = dirs[s.in]
    return [p0, { x: p0.x + ox * pull, y: p0.y + oy * pull }, { x: p3.x + ix * pull, y: p3.y + iy * pull }, p3]
  }
  const curves = plan.map(curveOf)

  const edges: MapSceneEdge[] = plan.map(({ l, i }) => {
    const curve = curves[i]
    const sub = l.via ? `through ${entity(l.via)?.name ?? l.via}` : undefined
    const size = mapLabelSize(l.text, sub)
    // A label stays on its own curve, so it can never be read as another line's.
    // Along the curve, take the place that covers the fewest boxes, labels and other lines.
    const others = curves.filter((_, j) => j !== i)
    const cost = (r: Rect) => {
      let c = 0
      for (const t of taken) c += 8 * Math.max(0, Math.min(r.x + r.w, t.x + t.w) - Math.max(r.x, t.x)) * Math.max(0, Math.min(r.y + r.h, t.y + t.h) - Math.max(r.y, t.y))
      for (const o of others) for (let k = 1; k < 24; k++) {
        const p = bezier(o, k / 24)
        if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) c += 600
      }
      return c
    }
    let box: Rect | undefined
    let leader: Point | undefined
    let best = Infinity
    const ts = [0.5, 0.44, 0.56, 0.38, 0.62, 0.32, 0.68, 0.26, 0.74]
    // On the curve first. Beside it only when that is clearly better; then a leader line keeps it tied to its curve.
    for (const off of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
      for (const t of ts) {
        const p = bezier(curve, t)
        const d = tangent(curve, t)
        const len = Math.hypot(d.x, d.y) || 1
        const shift = off * (Math.abs(d.x / len) > 0.7 ? size.h / 2 + 12 : size.w / 2 + 12)
        const n = { x: -d.y / len, y: d.x / len }
        const candidate = { x: p.x + n.x * shift - size.w / 2, y: p.y + n.y * shift - size.h / 2, w: size.w, h: size.h }
        const c = cost(candidate) + Math.abs(t - 0.5) * 40 + Math.abs(off) * 250
        if (c < best) {
          best = c
          box = candidate
          leader = off ? p : undefined
        }
      }
      if (best <= 10) break // a clear place on (or beside) the curve
    }
    box ??= { x: 0, y: 0, ...size }
    taken.push(box)
    return { id: l.id, relationships: l.relationships, source: l.source, target: l.target, via: l.via, curve, label: { ...box, text: l.text, sub }, leader }
  })

  const anchors: Record<string, Rect> = {}
  for (const n of nodes) anchors[refKey({ kind: 'entity', id: n.entityId })] = n
  for (const g of groups) anchors[refKey({ kind: 'entity', id: g.entityId })] = g
  // An entity inside a closed group is found at the group's box.
  for (const id of ids) if (rep(id) !== id) anchors[refKey({ kind: 'entity', id })] = byId.get(rep(id))!
  for (const e of edges) {
    const xs = e.curve.map((p) => p.x)
    const ys = e.curve.map((p) => p.y)
    // A line's anchor holds its label too, so a frame never cuts the words off.
    const lx = [...xs, e.label.x, e.label.x + e.label.w]
    const ly = [...ys, e.label.y, e.label.y + e.label.h]
    const r = { x: Math.min(...lx), y: Math.min(...ly), w: Math.max(...lx) - Math.min(...lx), h: Math.max(...ly) - Math.min(...ly) }
    for (const rel of e.relationships) anchors[refKey({ kind: 'relationship', id: rel })] ??= r
  }
  return { width: out.width, height: out.height, nodes, groups, edges, anchors }
}

export function bezier([p0, p1, p2, p3]: [Point, Point, Point, Point], t: number): Point {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  }
}


function tangent([p0, p1, p2, p3]: [Point, Point, Point, Point], t: number): Point {
  const u = 1 - t
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  }
}
