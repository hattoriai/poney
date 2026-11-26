import type { ELK as ElkEngine, ElkNode, LayoutOptions } from 'elkjs/lib/elk-api'
import type { Point, Rect } from './types'

/**
 * ELK is the automatic layout engine for graph-shaped diagrams. It runs
 * before rendering and knows nothing about any UI framework.
 */
let engine: Promise<ElkEngine> | undefined
/** ELK is large, so it loads the first time a diagram needs it. */
const elk = () => (engine ??= import('elkjs/lib/elk.bundled.js').then((m) => new m.default()))

export const BASE_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
}

export interface FlatElkNode extends Rect {
  id: string
  parent?: string
}

export interface FlatElkEdge {
  id: string
  points: Point[]
  labels: (Rect & { text: string })[]
}

export interface FlatElkGraph {
  width: number
  height: number
  nodes: Map<string, FlatElkNode>
  edges: Map<string, FlatElkEdge>
}

/**
 * Runs ELK and returns every node and edge in root coordinates.
 * ELK reports nodes relative to their parent and edges relative to the
 * node named in `container`; this adds those offsets up once.
 */
export async function runElk(graph: ElkNode): Promise<FlatElkGraph> {
  const out = await (await elk()).layout(graph)
  const nodes = new Map<string, FlatElkNode>()
  const origin = new Map<string, Point>([[out.id, { x: 0, y: 0 }]])
  const visit = (n: ElkNode, ox: number, oy: number, parent?: string) => {
    const x = ox + (n.x ?? 0)
    const y = oy + (n.y ?? 0)
    origin.set(n.id, { x, y })
    nodes.set(n.id, { id: n.id, parent, x, y, w: n.width ?? 0, h: n.height ?? 0 })
    n.children?.forEach((c) => visit(c, x, y, n.id))
  }
  out.children?.forEach((c) => visit(c, 0, 0))

  const edges = new Map<string, FlatElkEdge>()
  const collect = (n: ElkNode) => {
    n.edges?.forEach((e) => {
      const container = (e as { container?: string }).container ?? n.id
      const o = origin.get(container) ?? { x: 0, y: 0 }
      const shift = (p: Point) => ({ x: p.x + o.x, y: p.y + o.y })
      const section = e.sections?.[0]
      const points = section ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(shift) : []
      const labels = (e.labels ?? []).map((l) => ({ text: l.text ?? '', x: (l.x ?? 0) + o.x, y: (l.y ?? 0) + o.y, w: l.width ?? 0, h: l.height ?? 0 }))
      edges.set(e.id, { id: e.id, points, labels })
    })
    n.children?.forEach(collect)
  }
  collect(out)
  return { width: out.width ?? 0, height: out.height ?? 0, nodes, edges }
}

export type { ElkNode, LayoutOptions }
