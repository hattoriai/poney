import { indexOf, projectDataFlow, refKey, type DataFlowRole, type PoneyDocument, type ViewOf } from '@hattoriai/poney-core'
import { BASE_OPTIONS, runElk } from './elk'
import { union } from './geometry'
import { measure } from './text'
import type { Point, Rect, SceneBase } from './types'

export interface DataFlowScene extends SceneBase {
  nodes: (Rect & { id: string; entityId: string; role: DataFlowRole })[]
  edges: {
    id: string
    control: boolean
    source: string
    target: string
    points: Point[]
    label?: Rect & { text: string }
    data: string[]
  }[]
}

const SIZES: Record<DataFlowRole, { w: number; h: number }> = {
  terminator: { w: 184, h: 64 },
  process: { w: 196, h: 64 },
  store: { w: 204, h: 52 },
}

export async function layoutDataFlow(doc: PoneyDocument, view: ViewOf<'dataflow'>, options: { controlFlow?: boolean } = {}): Promise<DataFlowScene> {
  const idx = indexOf(doc)
  const d = projectDataFlow(doc, view, options)
  // Where the data starts reads first; where it ends reads last.
  const constraint = (id: string) => {
    const role = d.nodes.find((n) => n.id === id)?.role
    if (role !== 'terminator') return {}
    const ins = d.flows.some((f) => f.target === id)
    const outs = d.flows.some((f) => f.source === id)
    const c = !ins ? 'FIRST' : !outs ? 'LAST' : undefined
    return c ? { layoutOptions: { 'elk.layered.layering.layerConstraint': c } } : {}
  }
  const out = await runElk({
    id: 'root',
    layoutOptions: {
      ...BASE_OPTIONS,
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '48',
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeEdge': '16',
      'elk.spacing.edgeLabel': '6',
      'elk.edgeLabels.placement': 'CENTER',
      'elk.padding': '[top=32,left=32,bottom=32,right=32]',
    },
    children: d.nodes.map((n) => ({
      id: n.id,
      width: SIZES[n.role].w,
      height: SIZES[n.role].h,
      ...view.positions[n.id],
      ...constraint(n.id),
    })),
    edges: [
      ...d.flows.map((f) => ({
        id: f.id,
        sources: [f.source],
        targets: [f.target],
        labels: [{ text: f.label, width: measure(f.label, 11.5, 500) + 26, height: 22 }],
      })),
      ...d.control.map((c) => ({ id: c.id, sources: [c.source], targets: [c.target], layoutOptions: { 'elk.layered.priority.direction': '0' } })),
    ],
  })

  const nodes = d.nodes.map((n) => ({ ...out.nodes.get(n.id)!, id: n.id, entityId: n.entityId, role: n.role }))
  const edges: DataFlowScene['edges'] = [
    ...d.control.map((c) => ({ id: c.id, control: true, source: c.source, target: c.target, points: out.edges.get(c.id)?.points ?? [], data: [] })),
    ...d.flows.map((f) => {
      const e = out.edges.get(f.id)
      return { id: f.id, control: false, source: f.source, target: f.target.replace(/~in$/, ''), points: e?.points ?? [], label: e?.labels[0], data: f.data }
    }),
  ].filter((e) => e.points.length >= 2)

  const anchors: Record<string, Rect> = {}
  for (const n of nodes) anchors[refKey({ kind: 'entity', id: n.entityId })] ??= n
  for (const e of edges) {
    const box = union([...e.points.map((p) => ({ x: p.x, y: p.y, w: 1, h: 1 })), ...(e.label ? [e.label] : [])])
    anchors[refKey(e.control ? { kind: 'relationship', id: e.id } : { kind: 'dataFlow', id: e.id })] = box
    const flow = idx.dataFlows.get(e.id)
    if (flow?.via) anchors[refKey({ kind: 'relationship', id: flow.via })] ??= box
  }
  return { width: out.width, height: out.height, nodes, edges, anchors }
}
