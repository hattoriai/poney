import type {
  Behavior,
  Capability,
  DataFlow,
  DataRelation,
  DataType,
  Entity,
  Interaction,
  KindStyle,
  Message,
  Process,
  Relationship,
  PoneyDocument,
  StateMachine,
  Step,
  View,
} from '../schema/document'
import type { Ref } from './refs'

export interface FlatMessage {
  message: Message
  /** 1-based order of the message in the interaction. */
  number: number
  /** Fragments around this message, outermost first, with the branch guard. */
  context: { fragment: Extract<Step, { type: 'fragment' }>; guard: string }[]
}

export interface ResolvedStyle extends KindStyle {
  emphasis: boolean
}

const FALLBACK_STYLE: KindStyle = { shape: 'card', tone: 'slate', icon: 'box', label: 'Element' }

/**
 * Read-only lookups over a document. Built once per document instance and
 * cached, so components can ask questions freely.
 */
export class ModelIndex {
  readonly entities = new Map<string, Entity>()
  readonly relationships = new Map<string, Relationship>()
  readonly dataTypes = new Map<string, DataType>()
  readonly dataRelations = new Map<string, DataRelation>()
  readonly dataFlows = new Map<string, DataFlow>()
  readonly behaviors = new Map<string, Behavior>()
  readonly capabilities = new Map<string, Capability>()
  readonly views = new Map<string, View>()
  private readonly out = new Map<string, Relationship[]>()
  private readonly in = new Map<string, Relationship[]>()
  private readonly kids = new Map<string, Entity[]>()
  private readonly flatCache = new Map<string, FlatMessage[]>()

  constructor(readonly doc: PoneyDocument) {
    const m = doc.model
    m.entities.forEach((e) => this.entities.set(e.id, e))
    m.relationships.forEach((r) => {
      this.relationships.set(r.id, r)
      push(this.out, r.source, r)
      push(this.in, r.target, r)
    })
    m.dataTypes.forEach((d) => this.dataTypes.set(d.id, d))
    m.dataRelations.forEach((d) => this.dataRelations.set(d.id, d))
    m.dataFlows.forEach((d) => this.dataFlows.set(d.id, d))
    m.behaviors.forEach((b) => this.behaviors.set(b.id, b))
    m.capabilities.forEach((c) => this.capabilities.set(c.id, c))
    m.entities.forEach((e) => e.parent && push(this.kids, e.parent, e))
    doc.views.forEach((v) => this.views.set(v.id, v))
  }

  outgoing = (id: string) => this.out.get(id) ?? []
  incoming = (id: string) => this.in.get(id) ?? []
  children = (id: string) => this.kids.get(id) ?? []

  ancestors(id: string): Entity[] {
    const result: Entity[] = []
    let cursor = this.entities.get(id)?.parent
    while (cursor) {
      const e = this.entities.get(cursor)
      if (!e) break
      result.push(e)
      cursor = e.parent
    }
    return result
  }

  /** Style for an entity, with per-element and per-view overrides applied. */
  style(entityOrId: Entity | string, viewId?: string): ResolvedStyle {
    const e = typeof entityOrId === 'string' ? this.entities.get(entityOrId) : entityOrId
    const p = this.doc.presentation
    const base = (e && p.kinds[e.kind]) ?? FALLBACK_STYLE
    const own = (e ? p.elements[e.id] : undefined) ?? {}
    const inView = (e && viewId ? p.views[viewId]?.[e.id] : undefined) ?? {}
    return {
      ...base,
      tone: inView.tone ?? own.tone ?? base.tone,
      icon: inView.icon ?? own.icon ?? base.icon,
      emphasis: inView.emphasis ?? own.emphasis ?? false,
    }
  }

  interaction(id: string): Interaction | undefined {
    const b = this.behaviors.get(id)
    return b?.kind === 'interaction' ? b : undefined
  }
  process(id: string): Process | undefined {
    const b = this.behaviors.get(id)
    return b?.kind === 'process' ? b : undefined
  }
  stateMachine(id: string): StateMachine | undefined {
    const b = this.behaviors.get(id)
    return b?.kind === 'state-machine' ? b : undefined
  }

  /** Messages of an interaction in reading order, numbered. */
  messages(interactionId: string): FlatMessage[] {
    const cached = this.flatCache.get(interactionId)
    if (cached) return cached
    const out: FlatMessage[] = []
    const walk = (steps: Step[], context: FlatMessage['context']) => {
      for (const s of steps) {
        if (s.type === 'message') out.push({ message: s, number: out.length + 1, context })
        else s.branches.forEach((b) => walk(b.steps, [...context, { fragment: s, guard: b.guard }]))
      }
    }
    const interaction = this.interaction(interactionId)
    if (interaction) walk(interaction.steps, [])
    this.flatCache.set(interactionId, out)
    return out
  }

  findFragment(interactionId: string, fragmentId: string) {
    let found: Extract<Step, { type: 'fragment' }> | undefined
    const walk = (steps: Step[]) =>
      steps.forEach((s) => {
        if (s.type !== 'fragment') return
        if (s.id === fragmentId) found = s
        s.branches.forEach((b) => walk(b.steps))
      })
    const interaction = this.interaction(interactionId)
    if (interaction) walk(interaction.steps)
    return found
  }

  /** Behaviors an entity takes part in. */
  behaviorsInvolving(entityId: string): Behavior[] {
    return this.doc.model.behaviors.filter((b) => {
      if (b.kind === 'interaction') return b.participants.includes(entityId)
      if (b.kind === 'process') return b.nodes.some((n) => n.performedBy === entityId)
      return b.owner === entityId || b.transitions.some((t) => t.triggeredBy === entityId)
    })
  }

  /** Data an entity receives (consumes) and sends (produces), from data flows. */
  dataOf(entityId: string) {
    const consumed = new Map<string, DataFlow[]>()
    const produced = new Map<string, DataFlow[]>()
    for (const f of this.doc.model.dataFlows) {
      if (f.target === entityId) f.data.forEach((d) => push(consumed, d, f))
      if (f.source === entityId) f.data.forEach((d) => push(produced, d, f))
    }
    const owned = this.doc.model.dataTypes.filter((d) => d.ownedBy === entityId || d.storedIn === entityId)
    return { consumed, produced, owned }
  }

  capabilitiesOf(entityId: string) {
    return this.doc.model.capabilities.filter(
      (c) => c.actors.includes(entityId) || c.supporting.includes(entityId) || c.realizedBy.includes(entityId),
    )
  }

  /** Every place a data type appears: flows, messages, relationships, state machines. */
  usagesOfData(dataTypeId: string) {
    const flows = this.doc.model.dataFlows.filter((f) => f.data.includes(dataTypeId))
    const relationships = this.doc.model.relationships.filter((r) => r.data.includes(dataTypeId))
    const messages: { interaction: Interaction; item: FlatMessage }[] = []
    for (const b of this.doc.model.behaviors) {
      if (b.kind !== 'interaction') continue
      for (const item of this.messages(b.id)) if (item.message.data.includes(dataTypeId)) messages.push({ interaction: b, item })
    }
    const lifecycles = this.doc.model.behaviors.filter((b): b is StateMachine => b.kind === 'state-machine' && b.subject === dataTypeId)
    const relations = this.doc.model.dataRelations.filter((r) => r.from === dataTypeId || r.to === dataTypeId)
    return { flows, relationships, messages, lifecycles, relations }
  }

  /** Messages that travel along a relationship, across all interactions. */
  messagesAlong(relationshipId: string) {
    const out: { interaction: Interaction; item: FlatMessage }[] = []
    for (const b of this.doc.model.behaviors) {
      if (b.kind !== 'interaction') continue
      for (const item of this.messages(b.id)) if (item.message.relationship === relationshipId) out.push({ interaction: b, item })
    }
    return out
  }

  /** True when the view draws the referenced element. */
  viewShows(view: View, ref: Ref): boolean {
    switch (view.type) {
      case 'architecture':
      case 'map':
      case 'dependency': {
        if (ref.kind === 'entity') return view.entities.includes(ref.id)
        if (ref.kind === 'relationship') {
          const r = this.relationships.get(ref.id)
          if (!r) return false
          if (view.relationships) return view.relationships.includes(r.id)
          if (view.type === 'map' && (view.passThrough.includes(r.source) || view.passThrough.includes(r.target))) return true
          return view.entities.includes(r.source) && view.entities.includes(r.target)
        }
        if (ref.kind === 'group') return ref.view === view.id && view.type !== 'map'
        return false
      }
      case 'sequence': {
        const flat = this.messages(view.interaction)
        if (ref.kind === 'entity') return !!this.interaction(view.interaction)?.participants.includes(ref.id)
        if (ref.kind === 'behavior') return ref.id === view.interaction
        if (ref.kind === 'message' || ref.kind === 'fragment') return ref.behavior === view.interaction
        if (ref.kind === 'relationship') return flat.some((f) => f.message.relationship === ref.id)
        if (ref.kind === 'dataType') return flat.some((f) => f.message.data.includes(ref.id))
        return false
      }
      case 'dataflow': {
        const flows = view.flows.map((id) => this.dataFlows.get(id)).filter(isDefined)
        if (ref.kind === 'entity') return flows.some((f) => f.source === ref.id || f.target === ref.id)
        if (ref.kind === 'dataFlow') return view.flows.includes(ref.id)
        if (ref.kind === 'dataType') return flows.some((f) => f.data.includes(ref.id))
        if (ref.kind === 'relationship') return flows.some((f) => f.via === ref.id)
        return false
      }
      case 'activity': {
        const p = this.process(view.process)
        if (ref.kind === 'entity') return !!p?.nodes.some((n) => n.performedBy === ref.id)
        if (ref.kind === 'behavior') return ref.id === view.process
        if (ref.kind === 'activityNode' || ref.kind === 'activityFlow') return ref.behavior === view.process
        return false
      }
      case 'erd': {
        if (ref.kind === 'dataType') return view.dataTypes.includes(ref.id)
        if (ref.kind === 'dataRelation') {
          const r = this.dataRelations.get(ref.id)
          return !!r && view.dataTypes.includes(r.from) && view.dataTypes.includes(r.to)
        }
        if (ref.kind === 'entity') return view.dataTypes.some((d) => this.dataTypes.get(d)?.storedIn === ref.id)
        return false
      }
      case 'state': {
        const sm = this.stateMachine(view.stateMachine)
        if (!sm) return false
        if (ref.kind === 'behavior') return ref.id === sm.id
        if (ref.kind === 'state' || ref.kind === 'transition') return ref.behavior === sm.id
        if (ref.kind === 'entity') return sm.transitions.some((t) => t.triggeredBy === ref.id)
        if (ref.kind === 'dataType') return ref.id === sm.subject
        return false
      }
      case 'extension':
        return ref.kind === 'entity' && view.entities.includes(ref.id)
      case 'usecase': {
        const caps = view.capabilities.map((id) => this.capabilities.get(id)).filter(isDefined)
        if (ref.kind === 'capability') return view.capabilities.includes(ref.id)
        if (ref.kind === 'entity') return caps.some((c) => c.actors.includes(ref.id) || c.supporting.includes(ref.id))
        return false
      }
    }
  }

  viewsShowing(ref: Ref): View[] {
    return this.doc.views.filter((v) => this.viewShows(v, ref))
  }

  /** The best view to open for a ref: the current one when it shows it, else by preference. */
  bestViewFor(ref: Ref, currentViewId?: string): View | undefined {
    const current = currentViewId ? this.views.get(currentViewId) : undefined
    if (current && this.viewShows(current, ref)) return current
    const candidates = this.viewsShowing(ref)
    const order: View['type'][] = ['architecture', 'dependency', 'sequence', 'state', 'activity', 'dataflow', 'erd', 'usecase', 'map', 'extension']
    // Prefer the most detailed architecture (a view where the entity is not collapsed away).
    return candidates.sort((a, b) => {
      const byType = order.indexOf(a.type) - order.indexOf(b.type)
      if (byType !== 0) return byType
      const ac = a.type === 'architecture' ? a.collapsed.length : 0
      const bc = b.type === 'architecture' ? b.collapsed.length : 0
      return ac - bc
    })[0]
  }

  /** Views that tell a behavior's story. */
  viewsForBehavior(behaviorId: string): View[] {
    return this.doc.views.filter(
      (v) =>
        (v.type === 'sequence' && v.interaction === behaviorId) ||
        (v.type === 'activity' && v.process === behaviorId) ||
        (v.type === 'state' && v.stateMachine === behaviorId),
    )
  }

  /** True when the referenced element exists in the model. */
  exists(ref: Ref): boolean {
    switch (ref.kind) {
      case 'entity':
        return this.entities.has(ref.id)
      case 'relationship':
        return this.relationships.has(ref.id)
      case 'dataType': {
        const d = this.dataTypes.get(ref.id)
        return !!d && (!ref.field || d.fields.some((f) => f.name === ref.field))
      }
      case 'dataRelation':
        return this.dataRelations.has(ref.id)
      case 'dataFlow':
        return this.dataFlows.has(ref.id)
      case 'capability':
        return this.capabilities.has(ref.id)
      case 'behavior':
        return this.behaviors.has(ref.id)
      case 'message':
        return this.messages(ref.behavior).some((m) => m.message.id === ref.id)
      case 'fragment':
        return !!this.findFragment(ref.behavior, ref.id)
      case 'activityNode':
        return !!this.process(ref.behavior)?.nodes.some((n) => n.id === ref.id)
      case 'activityFlow':
        return !!this.process(ref.behavior)?.flows.some((f) => f.id === ref.id)
      case 'state':
        return !!this.stateMachine(ref.behavior)?.states.some((s) => s.id === ref.id)
      case 'transition':
        return !!this.stateMachine(ref.behavior)?.transitions.some((t) => t.id === ref.id)
      case 'group': {
        const v = this.views.get(ref.view)
        const groups = v?.type === 'architecture' ? v.groups : v?.type === 'dependency' ? v.layers : []
        return groups.some((g) => g.id === ref.id)
      }
    }
  }

  /** A short human description of any ref, for tooltips, search and breadcrumbs. */
  describe(ref: Ref): { title: string; kind: string; summary?: string } {
    switch (ref.kind) {
      case 'entity': {
        const e = this.entities.get(ref.id)
        return { title: e?.name ?? ref.id, kind: e ? this.style(e).label : 'Entity', summary: e?.summary }
      }
      case 'relationship': {
        const r = this.relationships.get(ref.id)
        if (!r) return { title: ref.id, kind: 'Relationship' }
        const s = this.entities.get(r.source)?.name ?? r.source
        const t = this.entities.get(r.target)?.name ?? r.target
        return { title: `${s} → ${t}`, kind: r.protocol ? `Connection · ${r.protocol}` : 'Connection', summary: r.label }
      }
      case 'group': {
        const v = this.views.get(ref.view)
        const groups = v?.type === 'architecture' ? v.groups : v?.type === 'dependency' ? v.layers : []
        const g = groups.find((x) => x.id === ref.id)
        return { title: g?.label ?? ref.id, kind: 'Group', summary: g?.description }
      }
      case 'dataType': {
        const d = this.dataTypes.get(ref.id)
        if (ref.field) {
          const f = d?.fields.find((x) => x.name === ref.field)
          return { title: `${d?.name ?? ref.id}.${ref.field}`, kind: `Field · ${f?.type ?? ''}`, summary: f?.description }
        }
        return { title: d?.name ?? ref.id, kind: d ? dataKindLabel(d.kind) : 'Data', summary: d?.summary }
      }
      case 'dataRelation': {
        const r = this.dataRelations.get(ref.id)
        if (!r) return { title: ref.id, kind: 'Relation' }
        return { title: `${this.dataTypes.get(r.from)?.name} ${r.label} ${this.dataTypes.get(r.to)?.name}`, kind: r.logical ? 'Logical relation' : 'Foreign key' }
      }
      case 'dataFlow': {
        const f = this.dataFlows.get(ref.id)
        if (!f) return { title: ref.id, kind: 'Data flow' }
        return {
          title: f.label,
          kind: 'Data flow',
          summary: `${this.entities.get(f.source)?.name} → ${this.entities.get(f.target)?.name}`,
        }
      }
      case 'message': {
        const item = this.messages(ref.behavior).find((m) => m.message.id === ref.id)
        if (!item) return { title: ref.id, kind: 'Message' }
        const m = item.message
        return {
          title: m.label,
          kind: `Message ${item.number}`,
          summary: `${this.entities.get(m.from)?.name} → ${this.entities.get(m.to)?.name}`,
        }
      }
      case 'fragment': {
        const f = this.findFragment(ref.behavior, ref.id)
        return { title: f?.label ?? ref.id, kind: f ? fragmentLabel(f.kind) : 'Fragment', summary: f?.branches.map((b) => b.guard).join(' · ') }
      }
      case 'activityNode': {
        const n = this.process(ref.behavior)?.nodes.find((x) => x.id === ref.id)
        return { title: n?.label ?? ref.id, kind: n ? activityKindLabel(n.kind) : 'Step', summary: n?.description }
      }
      case 'activityFlow': {
        const p = this.process(ref.behavior)
        const f = p?.flows.find((x) => x.id === ref.id)
        const from = p?.nodes.find((n) => n.id === f?.from)?.label
        const to = p?.nodes.find((n) => n.id === f?.to)?.label
        return { title: f?.guard ? `${f.guard}: ${to}` : `${from} → ${to}`, kind: 'Flow' }
      }
      case 'state': {
        const s = this.stateMachine(ref.behavior)?.states.find((x) => x.id === ref.id)
        return { title: s?.name ?? ref.id, kind: 'State', summary: s?.description }
      }
      case 'transition': {
        const t = this.stateMachine(ref.behavior)?.transitions.find((x) => x.id === ref.id)
        return { title: t?.event ?? ref.id, kind: 'Transition', summary: t?.guard ? `Only when ${t.guard}` : t?.description }
      }
      case 'capability': {
        const c = this.capabilities.get(ref.id)
        return { title: c?.name ?? ref.id, kind: `Use case · ${c?.area ?? ''}`, summary: c?.summary }
      }
      case 'behavior': {
        const b = this.behaviors.get(ref.id)
        return { title: b?.name ?? ref.id, kind: b ? behaviorKindLabel(b.kind) : 'Behavior', summary: b?.summary }
      }
    }
  }
}

const cache = new WeakMap<PoneyDocument, ModelIndex>()
export function indexOf(doc: PoneyDocument): ModelIndex {
  let idx = cache.get(doc)
  if (!idx) {
    idx = new ModelIndex(doc)
    cache.set(doc, idx)
  }
  return idx
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

export function isDefined<T>(v: T | undefined | null): v is T {
  return v !== undefined && v !== null
}

export function dataKindLabel(kind: DataType['kind']) {
  return { table: 'Table', record: 'Record', event: 'Event', document: 'Document' }[kind]
}
export function fragmentLabel(kind: 'alt' | 'opt' | 'loop' | 'par') {
  return { alt: 'Alternatives', opt: 'Optional', loop: 'Loop', par: 'In parallel' }[kind]
}
export function activityKindLabel(kind: Process['nodes'][number]['kind']) {
  return { start: 'Start', end: 'End', action: 'Action', decision: 'Decision', merge: 'Merge', fork: 'Parallel split', join: 'Parallel join' }[kind]
}
export function behaviorKindLabel(kind: Behavior['kind']) {
  return { interaction: 'Interaction', process: 'Process', 'state-machine': 'Lifecycle' }[kind]
}
