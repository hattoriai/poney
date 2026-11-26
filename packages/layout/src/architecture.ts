import {
  indexOf,
  projectArchitecture,
  refKey,
  type ArchitectureNode,
  type PoneyDocument,
  type ViewOf,
} from '@poney/core'
import { BASE_OPTIONS, runElk, type ElkNode } from './elk'
import { union } from './geometry'
import type { Point, Rect, SceneBase } from './types'

export interface ArchitectureSceneNode extends Rect {
  id: string
  type: 'entity' | 'group'
  entityId?: string
  groupId?: string
  parent?: string
  /** Has visible children drawn inside it. */
  compound: boolean
  collapsed: boolean
  /** Can be opened or closed. */
  expandable: boolean
  hiddenCount: number
  depth: number
}

export interface ArchitectureSceneEdge {
  id: string
  source: string
  target: string
  relationships: string[]
  lifted: boolean
  points: Point[]
}

export interface ArchitectureScene extends SceneBase {
  nodes: ArchitectureSceneNode[]
  edges: ArchitectureSceneEdge[]
}

/** Sizes per node shape. Renderers draw inside these boxes. */
export const ARCH_SIZES = {
  card: { w: 248, h: 104 },
  cylinder: { w: 240, h: 112 },
  stack: { w: 240, h: 104 },
  person: { w: 176, h: 120 },
  frame: { w: 330, h: 150 },
  chip: { w: 220, h: 64 },
  group: { w: 248, h: 104 },
} as const

export const ARCH_PADDING = { container: 56, group: 38 }

export async function layoutArchitecture(
  doc: PoneyDocument,
  view: ViewOf<'architecture'>,
  options: { collapsed?: string[] } = {},
): Promise<ArchitectureScene> {
  const idx = indexOf(doc)
  const diagram = projectArchitecture(doc, view, options)

  const toElk = (n: ArchitectureNode): ElkNode => {
    const compound = n.children.length > 0
    const shape = n.type === 'group' ? 'group' : idx.style(n.entityId!, view.id).shape
    const size = n.collapsed && n.type === 'entity' ? ARCH_SIZES.frame : ARCH_SIZES[shape]
    const fixed = view.positions[n.id]
    const node: ElkNode = { id: n.id }
    if (compound) {
      const top = n.type === 'group' ? ARCH_PADDING.group : ARCH_PADDING.container
      node.layoutOptions = {
        'elk.padding': `[top=${top},left=24,bottom=24,right=24]`,
        'elk.spacing.nodeNode': '28',
      }
      node.children = n.children.map(toElk)
    } else {
      node.width = size.w
      node.height = size.h
    }
    // People read first and outside systems last, whatever the edge directions say.
    const kind = n.entityId ? idx.entities.get(n.entityId)?.kind : undefined
    if (!compound && (kind === 'person' || kind === 'external'))
      node.layoutOptions = { 'elk.layered.layering.layerConstraint': kind === 'person' ? 'FIRST' : 'LAST' }
    if (fixed) {
      node.x = fixed.x
      node.y = fixed.y
    }
    return node
  }

  // Edges from outside systems into ours (webhooks, callbacks) run against the
  // reading direction. Lay them out reversed, then flip their points back.
  const kindOf = (nodeId: string) => idx.entities.get(nodeId)?.kind
  const reversed = new Set(diagram.edges.filter((e) => kindOf(e.source) === 'external' && kindOf(e.target) !== 'external').map((e) => e.id))

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      ...BASE_OPTIONS,
      'elk.direction': diagram.direction === 'down' ? 'DOWN' : 'RIGHT',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '36',
      'elk.layered.spacing.nodeNodeBetweenLayers': '84',
      'elk.spacing.edgeNode': '22',
      'elk.spacing.edgeEdge': '14',
      'elk.layered.spacing.edgeNodeBetweenLayers': '26',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
    },
    children: diagram.roots.map(toElk),
    edges: diagram.edges.map((e) => (reversed.has(e.id) ? { id: e.id, sources: [e.target], targets: [e.source] } : { id: e.id, sources: [e.source], targets: [e.target] })),
  }

  const out = await runElk(graph)
  const meta = new Map<string, ArchitectureNode>()
  const depthOf = new Map<string, number>()
  const walk = (n: ArchitectureNode, depth: number) => {
    meta.set(n.id, n)
    depthOf.set(n.id, depth)
    n.children.forEach((c) => walk(c, depth + 1))
  }
  diagram.roots.forEach((r) => walk(r, 0))

  // Paint order: parents before children.
  const nodes: ArchitectureSceneNode[] = [...out.nodes.values()]
    .map((r) => {
      const m = meta.get(r.id)!
      return {
        id: r.id,
        type: m.type,
        entityId: m.entityId,
        groupId: m.groupId,
        parent: m.parent,
        compound: m.children.length > 0,
        collapsed: m.collapsed,
        expandable: m.collapsed || m.children.length > 0,
        hiddenCount: m.hiddenCount,
        depth: depthOf.get(r.id) ?? 0,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
      }
    })
    .sort((a, b) => a.depth - b.depth)

  const edges: ArchitectureSceneEdge[] = diagram.edges
    .map((e) => {
      const points = out.edges.get(e.id)?.points ?? []
      return { ...e, points: reversed.has(e.id) ? points.slice().reverse() : points }
    })
    .filter((e) => e.points.length >= 2)

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const anchors: Record<string, Rect> = {}
  for (const n of nodes) {
    if (n.entityId) anchors[refKey({ kind: 'entity', id: n.entityId })] = n
    if (n.groupId) anchors[refKey({ kind: 'group', view: view.id, id: n.groupId })] = n
  }
  for (const [entityId, rep] of Object.entries(diagram.representative)) {
    const r = byId.get(rep)
    if (r && !entityId.startsWith('g:')) anchors[refKey({ kind: 'entity', id: entityId })] ??= r
  }
  for (const e of edges) {
    const box = union(e.points.map((p) => ({ x: p.x, y: p.y, w: 1, h: 1 })))
    for (const r of e.relationships) anchors[refKey({ kind: 'relationship', id: r })] = box
  }

  return { width: out.width, height: out.height, nodes, edges, anchors }
}
