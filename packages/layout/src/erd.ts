import { projectErd, refKey, type Cardinality, type ErdTable, type Field, type PoneyDocument, type ViewOf } from '@poney/core'
import { BASE_OPTIONS, runElk, type ElkNode } from './elk'
import { union } from './geometry'
import { measure } from './text'
import type { Point, Rect, SceneBase } from './types'

export const ERD = { header: 40, row: 26, more: 28, bottom: 6 } as const

export interface ErdSceneTable extends Rect {
  dataTypeId: string
  name: string
  rows: (Field & { y: number; foreign: boolean })[]
  hiddenCount: number
  expanded: boolean
  store?: string
}

export interface ErdSceneRelation {
  id: string
  from: string
  to: string
  points: Point[]
  fromCardinality: Cardinality
  toCardinality: Cardinality
  logical: boolean
  label: string
  via?: string
}

export interface ErdScene extends SceneBase {
  stores: (Rect & { entityId: string })[]
  tables: ErdSceneTable[]
  relations: ErdSceneRelation[]
}

function tableSize(t: ErdTable) {
  const nameW = measure(t.name, 13.5, 650) + 64
  const rowW = Math.max(0, ...t.fields.map((f) => measure(f.name, 12.5, 500, 'mono') + measure(f.type, 11.5, 400, 'mono') + 78))
  const w = Math.ceil(Math.max(232, nameW, rowW))
  const h = ERD.header + t.fields.length * ERD.row + (t.hiddenCount > 0 || t.expanded ? ERD.more : 0) + ERD.bottom
  return { w, h }
}

export async function layoutErd(doc: PoneyDocument, view: ViewOf<'erd'>, options: { expanded?: string[] } = {}): Promise<ErdScene> {
  const d = projectErd(doc, view, options)
  const tableNode = (t: ErdTable): ElkNode => {
    const s = tableSize(t)
    return { id: t.dataTypeId, width: s.w, height: s.h, ...view.positions[t.dataTypeId] }
  }
  const out = await runElk({
    id: 'root',
    layoutOptions: {
      ...BASE_OPTIONS,
      'elk.direction': 'RIGHT',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '36',
      'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeEdge': '16',
      'elk.padding': '[top=32,left=32,bottom=32,right=32]',
    },
    children: [
      ...d.stores.map((s) => ({
        id: `store:${s}`,
        layoutOptions: { 'elk.padding': '[top=44,left=20,bottom=20,right=20]', 'elk.spacing.nodeNode': '28' },
        children: d.tables.filter((t) => t.store === s).map(tableNode),
      })),
      ...d.tables.filter((t) => !t.store).map(tableNode),
    ],
    edges: d.relations.map((r) => ({ id: r.id, sources: [r.from], targets: [r.to] })),
  })

  const tables: ErdSceneTable[] = d.tables.map((t) => {
    const r = out.nodes.get(t.dataTypeId)!
    const refs = new Set(d.relations.filter((x) => x.via && (x.from === t.dataTypeId || x.to === t.dataTypeId)).map((x) => x.via))
    return {
      ...r,
      dataTypeId: t.dataTypeId,
      name: t.name,
      store: t.store,
      hiddenCount: t.hiddenCount,
      expanded: t.expanded,
      rows: t.fields.map((f, i) => ({ ...f, y: r.y + ERD.header + i * ERD.row, foreign: !!f.references || (refs.has(f.name) && !f.primaryKey) })),
    }
  })
  const byId = new Map(tables.map((t) => [t.dataTypeId, t]))

  // Attach each end of a relation to the row that implements it.
  const rowY = (t: ErdSceneTable, via?: string) => {
    const row = t.rows.find((f) => f.name === via) ?? t.rows.find((f) => f.primaryKey)
    return row ? row.y + ERD.row / 2 : undefined
  }
  const snapEnd = (pts: Point[], t: ErdSceneTable, y: number | undefined): Point[] => {
    if (y === undefined || pts.length < 2) return pts
    const end = pts[pts.length - 1]
    const prev = pts[pts.length - 2]
    if (Math.abs(prev.y - end.y) > 0.5 || Math.abs(end.y - y) < 0.5) return pts
    const onLeft = Math.abs(end.x - t.x) < 2
    const jx = end.x + (onLeft ? -18 : 18)
    if ((onLeft && prev.x > jx) || (!onLeft && prev.x < jx)) return pts
    return [...pts.slice(0, -1), { x: jx, y: end.y }, { x: jx, y }, { x: end.x, y }]
  }
  const relations: ErdSceneRelation[] = d.relations
    .map((r) => {
      let points = out.edges.get(r.id)?.points ?? []
      const from = byId.get(r.from)!
      const to = byId.get(r.to)!
      const fromVia = from.rows.some((f) => f.name === r.via) && r.from !== r.to ? r.via : undefined
      points = snapEnd(points, to, rowY(to, r.via))
      points = snapEnd(points.slice().reverse(), from, rowY(from, fromVia)).reverse()
      return { ...r, points }
    })
    .filter((r) => r.points.length >= 2)

  const stores = d.stores.map((s) => ({ ...out.nodes.get(`store:${s}`)!, entityId: s }))
  const anchors: Record<string, Rect> = {}
  for (const t of tables) {
    anchors[refKey({ kind: 'dataType', id: t.dataTypeId })] = t
    for (const f of t.rows) anchors[refKey({ kind: 'dataType', id: t.dataTypeId, field: f.name })] = { x: t.x, y: f.y, w: t.w, h: ERD.row }
  }
  for (const s of stores) anchors[refKey({ kind: 'entity', id: s.entityId })] = s
  for (const r of relations) anchors[refKey({ kind: 'dataRelation', id: r.id })] = union(r.points.map((p) => ({ ...p, w: 1, h: 1 })))
  return { width: out.width, height: out.height, stores, tables, relations, anchors }
}
