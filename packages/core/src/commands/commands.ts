import type { Entity, Relationship, PoneyDocument, View } from '../schema/document'
import { Entity as EntitySchema, Relationship as RelationshipSchema } from '../schema/model'
import { checkReferences, type ValidationIssue } from '../validation/validate'

/**
 * Commands are the only way to change a document.
 *
 * Each command is plain, serializable data. `applyCommand` is a pure
 * function: it returns a new document and never mutates the old one. That
 * gives undo/redo (keep the previous documents), a log for collaboration
 * (send the commands), and a single place to enforce integrity.
 *
 * Commands declare a scope so that semantic changes (what the software is),
 * layout changes (where things sit in one view) and presentation changes
 * (how things look) stay separate.
 */
export type Command =
  | { type: 'entity.add'; entity: Entity }
  | { type: 'entity.update'; id: string; changes: Partial<Omit<Entity, 'id'>> }
  | { type: 'entity.remove'; id: string }
  | { type: 'relationship.add'; relationship: Relationship }
  | { type: 'relationship.update'; id: string; changes: Partial<Omit<Relationship, 'id'>> }
  | { type: 'relationship.remove'; id: string }
  | { type: 'view.addEntity'; viewId: string; entityId: string }
  | { type: 'view.removeEntity'; viewId: string; entityId: string }
  | { type: 'layout.move'; viewId: string; elementId: string; position: { x: number; y: number } | null }
  | { type: 'presentation.override'; elementId: string; changes: PoneyDocument['presentation']['elements'][string] | null }
  /**
   * Renames an element inside a behavior: a message's label, a state's name,
   * a transition's event, a process step's label.
   */
  | { type: 'behavior.rename'; behaviorId: string; element: 'message' | 'state' | 'transition' | 'activityNode'; id: string; value: string }
  /** Changes one text field of a walkthrough, by its path inside the walkthrough, e.g. ["scenes", 2, "text"]. */
  | { type: 'walkthrough.setText'; walkthroughId: string; path: (string | number)[]; value: string }

export type CommandScope = 'semantic' | 'layout' | 'presentation'

export function scopeOf(command: Command): CommandScope {
  // Text in a walkthrough is part of what the document says.
  if (command.type.startsWith('layout.')) return 'layout'
  if (command.type.startsWith('presentation.')) return 'presentation'
  return 'semantic'
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(message)
  }
}

export function applyCommand(doc: PoneyDocument, command: Command): PoneyDocument {
  const next = reduce(doc, command)
  const issues = checkReferences(next).filter((i) => i.severity === 'error')
  if (issues.length > 0) throw new CommandError(`"${command.type}" would break the model: ${issues[0].message}`, issues)
  return next
}

function reduce(doc: PoneyDocument, c: Command): PoneyDocument {
  const model = doc.model
  switch (c.type) {
    case 'entity.add': {
      const entity = EntitySchema.parse(c.entity)
      return { ...doc, model: { ...model, entities: [...model.entities, entity] } }
    }
    case 'entity.update': {
      requireEntity(doc, c.id)
      const entities = model.entities.map((e) => (e.id === c.id ? EntitySchema.parse({ ...e, ...c.changes, id: e.id }) : e))
      return { ...doc, model: { ...model, entities } }
    }
    case 'entity.remove': {
      requireEntity(doc, c.id)
      if (model.entities.some((e) => e.parent === c.id))
        throw new CommandError(`Move or remove the children of "${c.id}" first`)
      const usedBy = indexOfBehaviorsUsing(doc, c.id)
      if (usedBy) throw new CommandError(`"${c.id}" takes part in "${usedBy}". Change that behavior first`)
      // Removing an entity removes the relationships and data flows that end at
      // it, its place in use cases, and its place in views.
      const relationships = model.relationships.filter((r) => r.source !== c.id && r.target !== c.id)
      const removedRels = new Set(model.relationships.filter((r) => !relationships.includes(r)).map((r) => r.id))
      const dataFlows = model.dataFlows
        .filter((f) => f.source !== c.id && f.target !== c.id)
        .map((f) => (f.via && removedRels.has(f.via) ? { ...f, via: undefined } : f))
      const removedFlows = new Set(model.dataFlows.filter((f) => !dataFlows.some((k) => k.id === f.id)).map((f) => f.id))
      const useCases = model.useCases.map((cap) => ({
        ...cap,
        supporting: cap.supporting.filter((x) => x !== c.id),
        realizedBy: cap.realizedBy.filter((x) => x !== c.id),
      }))
      if (useCases.some((cap) => cap.actors.includes(c.id)))
        throw new CommandError(`"${c.id}" is an actor of a use case. Change the use case first`)
      const views = doc.views.map((v) =>
        v.type === 'dataflow' ? { ...v, flows: v.flows.filter((f) => !removedFlows.has(f)) } : withoutEntity(v, c.id, removedRels),
      )
      return {
        ...doc,
        model: { ...model, entities: model.entities.filter((e) => e.id !== c.id), relationships, dataFlows, useCases },
        views,
      }
    }
    case 'relationship.add': {
      const relationship = RelationshipSchema.parse(c.relationship)
      return { ...doc, model: { ...model, relationships: [...model.relationships, relationship] } }
    }
    case 'relationship.update': {
      if (!model.relationships.some((r) => r.id === c.id)) throw new CommandError(`Unknown relationship "${c.id}"`)
      const relationships = model.relationships.map((r) =>
        r.id === c.id ? RelationshipSchema.parse({ ...r, ...c.changes, id: r.id }) : r,
      )
      return { ...doc, model: { ...model, relationships } }
    }
    case 'relationship.remove': {
      if (!model.relationships.some((r) => r.id === c.id)) throw new CommandError(`Unknown relationship "${c.id}"`)
      const removed = new Set([c.id])
      return {
        ...doc,
        model: { ...model, relationships: model.relationships.filter((r) => r.id !== c.id) },
        views: doc.views.map((v) =>
          (v.type === 'architecture' || v.type === 'dependency' || v.type === 'map') && v.relationships
            ? { ...v, relationships: v.relationships.filter((r) => !removed.has(r)) }
            : v,
        ),
      }
    }
    case 'view.addEntity':
    case 'view.removeEntity': {
      const views = doc.views.map((v) => {
        if (v.id !== c.viewId) return v
        if (v.type !== 'architecture' && v.type !== 'dependency' && v.type !== 'map')
          throw new CommandError(`Entities are added to ${v.type} views through their behavior, not directly`)
        if (c.type === 'view.addEntity') {
          requireEntity(doc, c.entityId)
          return v.entities.includes(c.entityId) ? v : { ...v, entities: [...v.entities, c.entityId] }
        }
        return withoutEntity(v, c.entityId, new Set())
      })
      return { ...doc, views }
    }
    case 'layout.move': {
      const views = doc.views.map((v) => {
        if (v.id !== c.viewId) return v
        const positions = { ...v.positions }
        if (c.position) positions[c.elementId] = c.position
        else delete positions[c.elementId]
        return { ...v, positions }
      })
      return { ...doc, views }
    }
    case 'presentation.override': {
      const elements = { ...doc.presentation.elements }
      if (c.changes) elements[c.elementId] = { ...elements[c.elementId], ...c.changes }
      else delete elements[c.elementId]
      return { ...doc, presentation: { ...doc.presentation, elements } }
    }
    case 'behavior.rename': {
      const value = c.value.trim()
      if (!value) throw new CommandError('A name cannot be empty')
      let found = false
      const behaviors = model.behaviors.map((b) => {
        if (b.id !== c.behaviorId) return b
        if (b.kind === 'interaction' && c.element === 'message') {
          const rename = (steps: typeof b.steps): typeof b.steps =>
            steps.map((st) => {
              if (st.type === 'message' && st.id === c.id) {
                found = true
                return { ...st, label: value }
              }
              if (st.type === 'fragment') return { ...st, branches: st.branches.map((br) => ({ ...br, steps: rename(br.steps) })) }
              return st
            })
          return { ...b, steps: rename(b.steps) }
        }
        if (b.kind === 'state-machine' && c.element === 'state')
          return { ...b, states: b.states.map((st) => (st.id === c.id ? ((found = true), { ...st, name: value }) : st)) }
        if (b.kind === 'state-machine' && c.element === 'transition')
          return { ...b, transitions: b.transitions.map((t) => (t.id === c.id ? ((found = true), { ...t, event: value }) : t)) }
        if (b.kind === 'activity' && c.element === 'activityNode')
          return { ...b, nodes: b.nodes.map((n) => (n.id === c.id ? ((found = true), { ...n, label: value }) : n)) }
        return b
      })
      if (!found) throw new CommandError(`No ${c.element} "${c.id}" in "${c.behaviorId}"`)
      return { ...doc, model: { ...model, behaviors } }
    }
    case 'walkthrough.setText': {
      const at = doc.walkthroughs.findIndex((w) => w.id === c.walkthroughId)
      if (at < 0) throw new CommandError(`Unknown walkthrough "${c.walkthroughId}"`)
      const walkthrough = setText(doc.walkthroughs[at], c.path, c.value)
      return { ...doc, walkthroughs: doc.walkthroughs.map((w, i) => (i === at ? walkthrough : w)) }
    }
  }
}

/** Sets a text field by path, copying only the objects on the way. Only an existing text can change, or an optional one be added. */
function setText<T>(node: T, path: (string | number)[], value: string): T {
  const [key, ...rest] = path
  if (key === undefined || node === null || typeof node !== 'object') throw new CommandError(`No text at "${path.join('.')}"`)
  const current = (node as Record<string | number, unknown>)[key]
  if (rest.length === 0) {
    if (current !== undefined && typeof current !== 'string') throw new CommandError(`"${key}" is not text`)
    if (current === undefined && Array.isArray(node)) throw new CommandError(`No item ${key}`)
  } else if (current === null || typeof current !== 'object') throw new CommandError(`No text at "${path.join('.')}"`)
  const next = rest.length === 0 ? value : setText(current, rest, value)
  if (Array.isArray(node)) return node.map((v, i) => (i === key ? next : v)) as T
  return { ...(node as object), [key]: next } as T
}

function requireEntity(doc: PoneyDocument, id: string) {
  if (!doc.model.entities.some((e) => e.id === id)) throw new CommandError(`Unknown entity "${id}"`)
}

function indexOfBehaviorsUsing(doc: PoneyDocument, id: string): string | undefined {
  return doc.model.behaviors.find((b) => {
    if (b.kind === 'interaction') return b.participants.includes(id)
    if (b.kind === 'activity') return b.nodes.some((n) => n.performedBy === id)
    return b.owner === id || b.transitions.some((t) => t.triggeredBy === id)
  })?.id
}

function withoutEntity(v: View, id: string, removedRels: Set<string>): View {
  const positions = { ...v.positions }
  delete positions[id]
  if (v.type === 'architecture') {
    return {
      ...v,
      positions,
      entities: v.entities.filter((e) => e !== id),
      relationships: v.relationships?.filter((r) => !removedRels.has(r)),
      groups: v.groups.map((g) => ({ ...g, members: g.members.filter((m) => m !== id) })),
      collapsed: v.collapsed.filter((e) => e !== id),
    }
  }
  if (v.type === 'dependency') {
    return {
      ...v,
      positions,
      entities: v.entities.filter((e) => e !== id),
      relationships: v.relationships?.filter((r) => !removedRels.has(r)),
      layers: v.layers.map((g) => ({ ...g, members: g.members.filter((m) => m !== id) })),
    }
  }
  if (v.type === 'extension' || v.type === 'map') return { ...v, positions, entities: v.entities.filter((e) => e !== id) }
  return v
}
