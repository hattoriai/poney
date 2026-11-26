import type { PoneyDocument, ViewOf } from '../schema/document'
import { indexOf } from '../model/query'

/**
 * Architecture projection: entities nested by containment and view groups,
 * with relationships lifted to the nearest visible node when a container or
 * group is collapsed.
 */
export interface ArchitectureNode {
  /** Entity id, or "g:<group id>" for groups. */
  id: string
  type: 'entity' | 'group'
  entityId?: string
  groupId?: string
  parent?: string
  children: ArchitectureNode[]
  /** True when the node could show children but they are hidden. */
  collapsed: boolean
  /** Number of entities hidden inside a collapsed node. */
  hiddenCount: number
}

export interface ArchitectureEdge {
  id: string
  source: string
  target: string
  /** The relationships this edge stands for. More than one when lifted. */
  relationships: string[]
  /** True when at least one end was lifted to a collapsed container. */
  lifted: boolean
}

export interface ArchitectureDiagram {
  roots: ArchitectureNode[]
  edges: ArchitectureEdge[]
  /** For every entity in the view: the id of the node that shows it. */
  representative: Record<string, string>
  direction: 'right' | 'down'
}

export const groupNodeId = (groupId: string) => `g:${groupId}`

export function projectArchitecture(
  doc: PoneyDocument,
  view: ViewOf<'architecture'>,
  options: { collapsed?: string[] } = {},
): ArchitectureDiagram {
  const idx = indexOf(doc)
  const shown = new Set(view.entities.filter((id) => idx.entities.has(id)))
  const collapsed = new Set(options.collapsed ?? view.collapsed)

  const nearestShownParent = (id: string): string | undefined => idx.ancestors(id).find((a) => shown.has(a.id))?.id
  const groupOf = new Map<string, string>()
  for (const g of view.groups) for (const m of g.members) if (shown.has(m)) groupOf.set(m, g.id)
  const groupContainer = new Map<string, string | undefined>()
  for (const g of view.groups) {
    const first = g.members.find((m) => shown.has(m))
    if (first) groupContainer.set(g.id, nearestShownParent(first))
  }

  // The visual parent of every node.
  const parentOf = new Map<string, string | undefined>()
  for (const id of shown) {
    const g = groupOf.get(id)
    parentOf.set(id, g ? groupNodeId(g) : nearestShownParent(id))
  }
  for (const [g, container] of groupContainer) parentOf.set(groupNodeId(g), container)

  const childrenOf = new Map<string | undefined, string[]>()
  for (const [id, parent] of parentOf) {
    const list = childrenOf.get(parent) ?? []
    list.push(id)
    childrenOf.set(parent, list)
  }
  // Keep the view's order: entities as listed, groups where their first member is.
  const order = new Map<string, number>()
  view.entities.forEach((id, i) => order.set(id, i))
  view.groups.forEach((g) => order.set(groupNodeId(g.id), Math.min(...g.members.map((m) => order.get(m) ?? Infinity))))
  for (const list of childrenOf.values()) list.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))

  const countLeaves = (id: string): number => {
    const kids = childrenOf.get(id) ?? []
    return kids.reduce((n, k) => n + (k.startsWith('g:') ? 0 : 1) + countLeaves(k), 0)
  }

  const build = (id: string): ArchitectureNode => {
    const isGroup = id.startsWith('g:')
    const rawId = isGroup ? id.slice(2) : id
    const kids = childrenOf.get(id) ?? []
    const isCollapsed = kids.length > 0 && collapsed.has(rawId)
    return {
      id,
      type: isGroup ? 'group' : 'entity',
      entityId: isGroup ? undefined : id,
      groupId: isGroup ? rawId : undefined,
      parent: parentOf.get(id),
      children: isCollapsed ? [] : kids.map(build),
      collapsed: isCollapsed,
      hiddenCount: isCollapsed ? countLeaves(id) : 0,
    }
  }
  const roots = (childrenOf.get(undefined) ?? []).map(build)

  // Each entity is drawn by its outermost collapsed ancestor, or by itself.
  const representative: Record<string, string> = {}
  for (const id of shown) {
    let rep = id
    let cursor = parentOf.get(id)
    while (cursor) {
      const raw = cursor.startsWith('g:') ? cursor.slice(2) : cursor
      if (collapsed.has(raw)) rep = cursor
      cursor = parentOf.get(cursor)
    }
    representative[id] = rep
  }
  for (const g of view.groups) {
    const node = groupNodeId(g.id)
    let rep = node
    let cursor = parentOf.get(node)
    while (cursor) {
      if (collapsed.has(cursor.startsWith('g:') ? cursor.slice(2) : cursor)) rep = cursor
      cursor = parentOf.get(cursor)
    }
    representative[node] = rep
  }

  const relIds = view.relationships ?? doc.model.relationships.filter((r) => shown.has(r.source) && shown.has(r.target)).map((r) => r.id)
  const merged = new Map<string, ArchitectureEdge>()
  for (const relId of relIds) {
    const r = idx.relationships.get(relId)
    if (!r || !shown.has(r.source) || !shown.has(r.target)) continue
    const s = representative[r.source]
    const t = representative[r.target]
    if (s === t) continue
    const key = `${s}->${t}`
    const lifted = s !== r.source || t !== r.target
    const existing = merged.get(key)
    if (existing) {
      existing.relationships.push(r.id)
      existing.lifted ||= lifted
    } else merged.set(key, { id: r.id, source: s, target: t, relationships: [r.id], lifted })
  }
  const edges = [...merged.values()].map((e) => (e.relationships.length > 1 ? { ...e, id: `lifted:${e.source}->${e.target}` } : e))

  return { roots, edges, representative, direction: view.layout.direction }
}
