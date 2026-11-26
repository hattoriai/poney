import type { PoneyDocument, ViewOf } from '../schema/document'
import { indexOf, isDefined } from '../model/query'

/**
 * Data flow projection. Entities play one of three roles: terminators
 * (people and outside systems), processes (code that transforms data) and
 * stores (where data rests). Flows carry data; control edges are the
 * relationships between the same entities that carry no flow in this view.
 */
export type DataFlowRole = 'terminator' | 'process' | 'store'

export interface DataFlowDiagram {
  /**
   * `id` is unique in the diagram. A terminator that both sends and receives
   * appears twice (DFD convention), as "<entity>" and "<entity>~in".
   */
  nodes: { id: string; entityId: string; role: DataFlowRole }[]
  flows: { id: string; source: string; target: string; label: string; data: string[] }[]
  control: { id: string; source: string; target: string }[]
}

export function roleOf(kind: string): DataFlowRole {
  if (kind === 'person' || kind === 'external') return 'terminator'
  if (kind === 'database' || kind === 'cache' || kind === 'message-broker') return 'store'
  return 'process'
}

export function projectDataFlow(doc: PoneyDocument, view: ViewOf<'dataflow'>, options: { controlFlow?: boolean } = {}): DataFlowDiagram {
  const idx = indexOf(doc)
  const flows = view.flows.map((id) => idx.dataFlows.get(id)).filter(isDefined)
  const ids: string[] = []
  for (const f of flows) for (const e of [f.source, f.target]) if (!ids.includes(e)) ids.push(e)
  const shown = new Set(ids)
  const carried = new Set(flows.map((f) => f.via).filter(isDefined))
  const showControl = options.controlFlow ?? view.showControlFlow
  const control = showControl
    ? doc.model.relationships
        .filter((r) => shown.has(r.source) && shown.has(r.target) && !carried.has(r.id) && r.kind !== 'depends-on' && r.kind !== 'implements')
        .map((r) => ({ id: r.id, source: r.source, target: r.target }))
    : []
  const role = (id: string) => roleOf(idx.entities.get(id)?.kind ?? 'service')
  // A terminator that starts the flow and also receives its result from
  // another terminator (the customer who gets an email) is drawn at both ends.
  const sends = new Set(flows.map((f) => f.source))
  const twice = new Set(
    ids.filter((id) => {
      if (role(id) !== 'terminator' || !sends.has(id)) return false
      const incoming = flows.filter((f) => f.target === id)
      return incoming.length > 0 && incoming.every((f) => role(f.source) === 'terminator')
    }),
  )
  const nodes = ids.map((id) => ({ id, entityId: id, role: role(id) }))
  for (const id of twice) nodes.push({ id: `${id}~in`, entityId: id, role: 'terminator' })
  return {
    nodes,
    flows: flows.map((f) => ({ id: f.id, source: f.source, target: twice.has(f.target) ? `${f.target}~in` : f.target, label: f.label, data: f.data })),
    control,
  }
}
