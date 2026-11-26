import type { z } from 'zod'
import { PoneyDocument, type Step } from '../schema/document'
import { CoreEntityKind, CoreRelationshipKind } from '../schema/model'
import { namespaceOf, type PoneyExtension } from '../extensions/extension'
import { indexOf } from '../model/query'
import { parseRef, refKey } from '../model/refs'

export interface ValidationIssue {
  path: string
  message: string
  /** Errors make a document invalid. Warnings are information for authors. */
  severity: 'error' | 'warning'
  /** How to fix it, when the reader can tell. Written for people and agents. */
  hint?: string
  /** A stable name for the kind of problem, for lints. */
  code?: string
}

/** The closest candidates to an unknown id, for "did you mean" hints. */
export function suggest(value: string, candidates: Iterable<string>, max = 3): string[] {
  const scored: [number, string][] = []
  for (const c of candidates) {
    const d = distance(value, c)
    const limit = Math.max(2, Math.floor(Math.max(value.length, c.length) / 3))
    if (d <= limit || c.includes(value) || value.includes(c)) scored.push([d, c])
  }
  scored.sort((a, b) => a[0] - b[0])
  // Only the clearly closest: at most one edit further than the best.
  const best = scored[0]?.[0] ?? 0
  return scored.filter(([d]) => d <= best + 1).slice(0, max).map(([, c]) => c)
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]
}

const didYouMean = (value: string, candidates: Iterable<string>, what: string) => {
  const s = suggest(value, candidates)
  return s.length ? `Did you mean ${s.map((x) => `"${x}"`).join(' or ')}?` : `Add a ${what} with this id, or use an existing one.`
}

export type ValidationResult =
  | { ok: true; document: PoneyDocument; issues: ValidationIssue[] }
  | { ok: false; document?: PoneyDocument; issues: ValidationIssue[] }

export interface ValidateOptions {
  /** Extensions this reader understands. Their data is validated too. */
  extensions?: PoneyExtension[]
}

/**
 * Validates an unknown value as a Poney document.
 *
 * Three passes: the schema checks shape and fills defaults; the referential
 * pass checks that every id points at something that exists; the extension
 * pass checks kinds, facets and views that extensions define.
 */
export function validateDocument(input: unknown, options: ValidateOptions = {}): ValidationResult {
  const parsed = PoneyDocument.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message, severity: 'error' as const, hint: shapeHint(i) })),
    }
  }
  const issues = [...checkReferences(parsed.data), ...checkExtensions(parsed.data, options.extensions ?? [])]
  if (issues.some((i) => i.severity === 'error')) return { ok: false, document: parsed.data, issues }
  return { ok: true, document: parsed.data, issues }
}

/** A hint for a shape error, from what Zod knows. */
function shapeHint(issue: z.ZodIssue): string | undefined {
  const i = issue as z.ZodIssue & Record<string, unknown>
  if (i.code === 'invalid_union_discriminator' && Array.isArray(i.options)) return `Use one of: ${(i.options as string[]).join(', ')}.`
  if (i.code === 'invalid_enum_value' && Array.isArray(i.options)) return `Use one of: ${(i.options as string[]).join(', ')}.`
  if (i.code === 'invalid_type' && i.received === 'undefined') return `Add "${i.path[i.path.length - 1]}".`
  if (i.code === 'unrecognized_keys' && Array.isArray(i.keys)) return `Remove ${(i.keys as string[]).map((k) => `"${k}"`).join(', ')}: this place has no such field.`
  if (i.code === 'invalid_string' && /lowercase|ref/.test(i.message)) return 'Ids are lowercase letters, digits, "-", "_" and ".", e.g. "order-service".'
  return undefined
}

/** Parses and validates, throwing on errors. */
export function parseDocument(input: unknown, options: ValidateOptions = {}): PoneyDocument {
  const result = validateDocument(input, options)
  if (!result.ok) {
    const first = result.issues.find((i) => i.severity === 'error')
    throw new Error(`Invalid Poney document: ${first ? `${first.path}: ${first.message}` : 'unknown error'}`)
  }
  return result.document
}

export function checkReferences(doc: PoneyDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const m = doc.model
  const report = (path: string, message: string, hint?: string) => issues.push({ path, message, severity: 'error', ...(hint ? { hint } : {}) })

  const index = <T extends { id: string }>(items: T[], path: string) => {
    const map = new Map<string, T>()
    items.forEach((item, i) => {
      if (map.has(item.id)) report(`${path}.${i}.id`, `Duplicate id "${item.id}"`)
      map.set(item.id, item)
    })
    return map
  }

  const entities = index(m.entities, 'model.entities')
  const relationships = index(m.relationships, 'model.relationships')
  const dataTypes = index(m.dataTypes, 'model.dataTypes')
  index(m.dataRelations, 'model.dataRelations')
  index(m.dataFlows, 'model.dataFlows')
  const behaviors = index(m.behaviors, 'model.behaviors')
  const capabilities = index(m.capabilities, 'model.capabilities')
  index(doc.views, 'views')

  const entity = (id: string | undefined, path: string) => {
    if (id !== undefined && !entities.has(id)) report(path, `Unknown entity "${id}"`, didYouMean(id, entities.keys(), 'entity to model.entities'))
  }
  const dataType = (id: string | undefined, path: string) => {
    if (id !== undefined && !dataTypes.has(id)) report(path, `Unknown data type "${id}"`, didYouMean(id, dataTypes.keys(), 'data type to model.dataTypes'))
  }
  const relationship = (id: string | undefined, path: string) => {
    if (id !== undefined && !relationships.has(id)) report(path, `Unknown relationship "${id}"`, didYouMean(id, relationships.keys(), 'relationship to model.relationships'))
  }

  // Entities: parents exist and containment has no cycles.
  m.entities.forEach((e, i) => {
    entity(e.parent, `model.entities.${i}.parent`)
    const seen = new Set<string>([e.id])
    let cursor = e.parent ? entities.get(e.parent) : undefined
    while (cursor) {
      if (seen.has(cursor.id)) {
        report(`model.entities.${i}.parent`, `Containment cycle through "${cursor.id}"`)
        break
      }
      seen.add(cursor.id)
      cursor = cursor.parent ? entities.get(cursor.parent) : undefined
    }
  })

  m.relationships.forEach((r, i) => {
    entity(r.source, `model.relationships.${i}.source`)
    entity(r.target, `model.relationships.${i}.target`)
    r.data.forEach((d, j) => dataType(d, `model.relationships.${i}.data.${j}`))
  })

  m.dataTypes.forEach((t, i) => {
    entity(t.ownedBy, `model.dataTypes.${i}.ownedBy`)
    entity(t.storedIn, `model.dataTypes.${i}.storedIn`)
    const names = new Set<string>()
    t.fields.forEach((f, j) => {
      const path = `model.dataTypes.${i}.fields.${j}`
      if (names.has(f.name)) report(path, `Duplicate field "${f.name}" in "${t.id}"`)
      names.add(f.name)
      if (f.references) {
        const target = dataTypes.get(f.references.dataType)
        if (!target) report(`${path}.references`, `Unknown data type "${f.references.dataType}"`)
        else if (!target.fields.some((tf) => tf.name === f.references!.field))
          report(`${path}.references`, `"${target.id}" has no field "${f.references.field}"`)
      }
    })
  })

  m.dataRelations.forEach((r, i) => {
    dataType(r.from, `model.dataRelations.${i}.from`)
    dataType(r.to, `model.dataRelations.${i}.to`)
    if (r.via) {
      const has = [r.from, r.to].some((id) => dataTypes.get(id)?.fields.some((f) => f.name === r.via))
      if (!has) report(`model.dataRelations.${i}.via`, `Neither end has field "${r.via}"`)
    }
  })

  m.dataFlows.forEach((f, i) => {
    entity(f.source, `model.dataFlows.${i}.source`)
    entity(f.target, `model.dataFlows.${i}.target`)
    relationship(f.via, `model.dataFlows.${i}.via`)
    f.data.forEach((d, j) => dataType(d, `model.dataFlows.${i}.data.${j}`))
  })

  m.behaviors.forEach((b, i) => {
    const path = `model.behaviors.${i}`
    if (b.kind === 'interaction') {
      b.participants.forEach((p, j) => entity(p, `${path}.participants.${j}`))
      const participants = new Set(b.participants)
      const stepIds = new Set<string>()
      const walk = (steps: Step[], at: string) =>
        steps.forEach((s, j) => {
          const sp = `${at}.${j}`
          if (stepIds.has(s.id)) report(`${sp}.id`, `Duplicate step id "${s.id}"`)
          stepIds.add(s.id)
          if (s.type === 'message') {
            if (!participants.has(s.from)) report(`${sp}.from`, `"${s.from}" is not a participant`, `Add "${s.from}" to participants, or send from one of: ${[...participants].join(', ')}.`)
            if (!participants.has(s.to)) report(`${sp}.to`, `"${s.to}" is not a participant`, `Add "${s.to}" to participants, or send to one of: ${[...participants].join(', ')}.`)
            relationship(s.relationship, `${sp}.relationship`)
            s.data.forEach((d, k) => dataType(d, `${sp}.data.${k}`))
          } else {
            s.branches.forEach((br, k) => walk(br.steps, `${sp}.branches.${k}.steps`))
          }
        })
      walk(b.steps, `${path}.steps`)
    } else if (b.kind === 'process') {
      const nodes = index(b.nodes, `${path}.nodes`)
      b.nodes.forEach((n, j) => entity(n.performedBy, `${path}.nodes.${j}.performedBy`))
      if (b.nodes.filter((n) => n.kind === 'start').length !== 1)
        report(`${path}.nodes`, 'A process needs exactly one start node')
      b.flows.forEach((f, j) => {
        if (!nodes.has(f.from)) report(`${path}.flows.${j}.from`, `Unknown node "${f.from}"`, didYouMean(f.from, nodes.keys(), 'node'))
        if (!nodes.has(f.to)) report(`${path}.flows.${j}.to`, `Unknown node "${f.to}"`, didYouMean(f.to, nodes.keys(), 'node'))
      })
    } else {
      dataType(b.subject, `${path}.subject`)
      entity(b.owner, `${path}.owner`)
      const states = index(b.states, `${path}.states`)
      if (b.states.filter((s) => s.kind === 'initial').length !== 1)
        report(`${path}.states`, 'A state machine needs exactly one initial state')
      b.transitions.forEach((t, j) => {
        if (!states.has(t.from)) report(`${path}.transitions.${j}.from`, `Unknown state "${t.from}"`, didYouMean(t.from, states.keys(), 'state'))
        if (!states.has(t.to)) report(`${path}.transitions.${j}.to`, `Unknown state "${t.to}"`, didYouMean(t.to, states.keys(), 'state'))
        entity(t.triggeredBy, `${path}.transitions.${j}.triggeredBy`)
      })
    }
  })

  m.capabilities.forEach((c, i) => {
    const path = `model.capabilities.${i}`
    c.actors.forEach((a, j) => entity(a, `${path}.actors.${j}`))
    c.supporting.forEach((a, j) => entity(a, `${path}.supporting.${j}`))
    c.realizedBy.forEach((a, j) => entity(a, `${path}.realizedBy.${j}`))
    c.behaviors.forEach((b, j) => {
      if (!behaviors.has(b)) report(`${path}.behaviors.${j}`, `Unknown behavior "${b}"`)
    })
    c.includes.forEach((b, j) => {
      if (!capabilities.has(b)) report(`${path}.includes.${j}`, `Unknown capability "${b}"`)
    })
  })

  const behaviorOfKind = (id: string, kind: string, path: string) => {
    const b = behaviors.get(id)
    if (!b) report(path, `Unknown behavior "${id}"`)
    else if (b.kind !== kind) report(path, `"${id}" is a ${b.kind}, expected ${kind}`)
  }

  doc.views.forEach((v, i) => {
    const path = `views.${i}`
    switch (v.type) {
      case 'architecture':
      case 'map':
      case 'dependency': {
        v.entities.forEach((e, j) => entity(e, `${path}.entities.${j}`))
        v.relationships?.forEach((r, j) => relationship(r, `${path}.relationships.${j}`))
        const shown = new Set(v.entities)
        const groups = v.type === 'architecture' ? v.groups : v.type === 'dependency' ? v.layers : []
        groups.forEach((g, j) =>
          g.members.forEach((mbr, k) => {
            if (!shown.has(mbr)) report(`${path}.groups.${j}.members.${k}`, `"${mbr}" is not in this view`)
          }),
        )
        if (v.type === 'map') {
          v.passThrough.forEach((e, j) => entity(e, `${path}.passThrough.${j}`))
          v.collapsed.forEach((c, j) => {
            if (!shown.has(c)) report(`${path}.collapsed.${j}`, `"${c}" is not in this view`)
            else if (!v.entities.some((e) => entities.get(e)?.parent === c)) report(`${path}.collapsed.${j}`, `"${c}" has nothing inside it in this view`, 'A group is an entity whose children (entities with "parent" set to it) are also in the map.')
          })
        }
        if (v.type === 'architecture')
          v.collapsed.forEach((c, j) => {
            if (!shown.has(c) && !groups.some((g) => g.id === c))
              report(`${path}.collapsed.${j}`, `"${c}" is not in this view`)
          })
        break
      }
      case 'sequence':
        behaviorOfKind(v.interaction, 'interaction', `${path}.interaction`)
        break
      case 'activity':
        behaviorOfKind(v.process, 'process', `${path}.process`)
        break
      case 'state':
        behaviorOfKind(v.stateMachine, 'state-machine', `${path}.stateMachine`)
        break
      case 'erd':
        v.dataTypes.forEach((d, j) => dataType(d, `${path}.dataTypes.${j}`))
        break
      case 'dataflow': {
        const flows = new Set(m.dataFlows.map((f) => f.id))
        v.flows.forEach((f, j) => {
          if (!flows.has(f)) report(`${path}.flows.${j}`, `Unknown data flow "${f}"`)
        })
        break
      }
      case 'extension':
        v.entities.forEach((e, j) => entity(e, `${path}.entities.${j}`))
        break
      case 'usecase':
        v.capabilities.forEach((c, j) => {
          if (!capabilities.has(c)) report(`${path}.capabilities.${j}`, `Unknown capability "${c}"`)
        })
        break
    }
  })

  checkWalkthroughs(doc, report)

  if (doc.project.defaultView && !doc.views.some((v) => v.id === doc.project.defaultView))
    report('project.defaultView', `Unknown view "${doc.project.defaultView}"`)

  const kindsUsed = new Set(m.entities.map((e) => e.kind))
  kindsUsed.forEach((k) => {
    if (!doc.presentation.kinds[k])
      issues.push({ path: `presentation.kinds.${k}`, message: `No style for entity kind "${k}"; readers use a default`, severity: 'warning' })
  })

  return issues
}

/**
 * Extension rules:
 * - every non-core kind and every `ext` key must name a declared extension;
 * - a required extension the reader does not know is an error;
 * - known extensions validate their kinds, facets, views and references;
 * - data of unknown optional extensions is kept and reported as a warning.
 */
export function checkExtensions(doc: PoneyDocument, known: PoneyExtension[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const error = (path: string, message: string) => issues.push({ path, message, severity: 'error' })
  const warn = (path: string, message: string) => issues.push({ path, message, severity: 'warning' })
  const declared = new Map(doc.extensions.map((e) => [e.name, e]))
  const registry = new Map(known.map((e) => [e.name, e]))

  doc.extensions.forEach((use, i) => {
    if (registry.has(use.name)) return
    if (use.required) error(`extensions.${i}`, `This document requires the "${use.name}" extension, which this reader does not know`)
    else warn(`extensions.${i}`, `Extension "${use.name}" is not known here; its data is kept but not checked`)
  })

  const checkKind = (kind: string, path: string, core: readonly string[], field: 'entityKinds' | 'relationshipKinds') => {
    if (core.includes(kind)) return
    const ns = namespaceOf(kind)
    if (!ns) return error(path, `Unknown kind "${kind}"`)
    if (!declared.has(ns)) return error(path, `Kind "${kind}" uses the undeclared extension "${ns}"`)
    const ext = registry.get(ns)
    if (ext && !ext[field]?.[kind.slice(ns.length + 1)]) error(path, `Extension "${ns}" does not define the kind "${kind}"`)
  }

  const checkFacets = (ext: Record<string, unknown>, path: string, target: 'entity' | 'relationship' | 'dataType' | 'capability' | 'view') => {
    for (const [ns, value] of Object.entries(ext)) {
      if (!declared.has(ns)) {
        error(`${path}.ext.${ns}`, `Data for the undeclared extension "${ns}"`)
        continue
      }
      const schema = registry.get(ns)?.facets?.[target]
      if (!registry.has(ns)) continue
      if (!schema) {
        error(`${path}.ext.${ns}`, `Extension "${ns}" defines no data for a ${target}`)
        continue
      }
      const parsed = schema.safeParse(value)
      if (!parsed.success) parsed.error.issues.forEach((i) => error(`${path}.ext.${ns}.${i.path.join('.')}`, i.message))
    }
  }

  doc.model.entities.forEach((e, i) => {
    checkKind(e.kind, `model.entities.${i}.kind`, CoreEntityKind.options, 'entityKinds')
    checkFacets(e.ext, `model.entities.${i}`, 'entity')
  })
  doc.model.relationships.forEach((r, i) => {
    checkKind(r.kind, `model.relationships.${i}.kind`, CoreRelationshipKind.options, 'relationshipKinds')
    checkFacets(r.ext, `model.relationships.${i}`, 'relationship')
  })
  doc.model.dataTypes.forEach((d, i) => checkFacets(d.ext, `model.dataTypes.${i}`, 'dataType'))
  doc.model.capabilities.forEach((c, i) => checkFacets(c.ext, `model.capabilities.${i}`, 'capability'))
  doc.views.forEach((v, i) => {
    checkFacets(v.ext, `views.${i}`, 'view')
    if (v.type !== 'extension') return
    const ns = namespaceOf(v.extension)!
    if (!declared.has(ns)) return error(`views.${i}.extension`, `View uses the undeclared extension "${ns}"`)
    const ext = registry.get(ns)
    if (!ext) return
    const def = ext.views?.[v.extension.slice(ns.length + 1)]
    if (!def) return error(`views.${i}.extension`, `Extension "${ns}" does not define the view "${v.extension}"`)
    const parsed = def.schema.safeParse(v.data)
    if (!parsed.success) parsed.error.issues.forEach((iss) => error(`views.${i}.data.${iss.path.join('.')}`, iss.message))
  })

  if (issues.some((i) => i.severity === 'error')) return issues
  const index = indexOf(doc)
  for (const ext of known) {
    if (!declared.has(ext.name)) continue
    ext.validate?.(doc, { index, report: error })
  }
  return issues
}

/** Rule R13: walkthroughs reference views and elements that exist. */
function checkWalkthroughs(doc: PoneyDocument, report: (path: string, message: string, hint?: string) => void) {
  const idx = indexOf(doc)
  const views = new Set(doc.views.map((v) => v.id))
  doc.walkthroughs.forEach((w, i) => {
    const path = `walkthroughs.${i}`
    const removed = new Set<string>([
      ...w.removed.entities.map((e) => refKey({ kind: 'entity', id: e.id })),
      ...w.removed.relationships.map((r) => refKey({ kind: 'relationship', id: r.id })),
      ...w.removed.transitions.map((t) => refKey({ kind: 'transition', behavior: t.stateMachine, id: t.transition.id })),
    ])
    const removedEntities = new Set(w.removed.entities.map((e) => e.id))
    w.removed.entities.forEach((e, j) => {
      if (idx.entities.has(e.id)) report(`${path}.removed.entities.${j}.id`, `"${e.id}" is removed but still in the model`)
    })
    w.removed.relationships.forEach((r, j) => {
      if (idx.relationships.has(r.id)) report(`${path}.removed.relationships.${j}.id`, `"${r.id}" is removed but still in the model`)
      for (const end of ['source', 'target'] as const)
        if (!idx.entities.has(r[end]) && !removedEntities.has(r[end])) report(`${path}.removed.relationships.${j}.${end}`, `Unknown entity "${r[end]}"`)
    })
    w.removed.transitions.forEach((t, j) => {
      const sm = idx.stateMachine(t.stateMachine)
      if (!sm) return report(`${path}.removed.transitions.${j}.stateMachine`, `Unknown state machine "${t.stateMachine}"`)
      for (const end of ['from', 'to'] as const)
        if (!sm.states.some((s) => s.id === t.transition[end])) report(`${path}.removed.transitions.${j}.transition.${end}`, `Unknown state "${t.transition[end]}"`)
    })
    const known = (key: string, at: string) => {
      const ref = parseRef(key)
      if (!ref)
        return report(at, `"${key}" is not a ref`, 'Write refs as "entity:<id>", "relationship:<id>", "state:<machine>:<id>", "transition:<machine>:<id>", "message:<interaction>:<id>" or "dataType:<id>#<field>".')
      if (!idx.exists(ref) && !removed.has(refKey(ref))) report(at, `Nothing in the model matches "${key}"`, didYouMean(key, allRefKeys(idx, removed), 'element'))
    }
    if (w.kind === 'change')
      for (const side of ['before', 'after'] as const)
        if (!w.story[side]) report(`${path}.story.${side}`, `A change walkthrough needs "story.${side}"`, `Say in one line how it is ${side} the change, or set "kind": "tour" for a tour of code as it is.`)
    if (w.kind === 'tour')
      w.marks.forEach((_, j) => report(`${path}.marks.${j}`, 'A tour has no marks', 'A tour shows code as it is. Remove the marks, or set "kind": "change".'))
    if (w.overview && !views.has(w.overview)) report(`${path}.overview`, `Unknown view "${w.overview}"`)
    w.marks.forEach((m, j) => {
      known(m.ref, `${path}.marks.${j}.ref`)
      const ref = parseRef(m.ref)
      if (ref && (m.state === 'removed') !== removed.has(refKey(ref)))
        report(`${path}.marks.${j}.state`, m.state === 'removed' ? `"${m.ref}" is marked removed but is not in "removed"` : `"${m.ref}" is in "removed" but marked ${m.state}`)
    })
    w.scenes.forEach((s, j) => {
      if (w.kind === 'tour')
        s.code.forEach((c, k) =>
          c.hunks.forEach((h, hi) =>
            h.lines.forEach((l, li) => {
              if (l.kind !== 'ctx') report(`${path}.scenes.${j}.code.${k}.hunks.${hi}.lines.${li}.kind`, `A tour shows code as it is, but this line is "${l.kind}"`, 'Show an excerpt with "start" and "text", or use "ctx" lines.')
            }),
          ),
        )
      if (s.view && !views.has(s.view)) report(`${path}.scenes.${j}.view`, `Unknown view "${s.view}"`)
      s.focus.forEach((f, k) => known(f, `${path}.scenes.${j}.focus.${k}`))
      s.callouts.forEach((c, k) => known(c.target, `${path}.scenes.${j}.callouts.${k}.target`))
      s.trace.forEach((t, k) => known(t.ref, `${path}.scenes.${j}.trace.${k}.ref`))
      s.effects.forEach((e, k) => known(e.target, `${path}.scenes.${j}.effects.${k}.target`))
      s.badges.forEach((b, k) => known(b.target, `${path}.scenes.${j}.badges.${k}.target`))
    })
  })
}

/** Every ref key in a document, for suggestions. */
function allRefKeys(idx: ReturnType<typeof indexOf>, extra: Set<string>): string[] {
  const keys = [...extra]
  idx.entities.forEach((_, id) => keys.push(`entity:${id}`))
  idx.relationships.forEach((_, id) => keys.push(`relationship:${id}`))
  idx.dataTypes.forEach((d, id) => {
    keys.push(`dataType:${id}`)
    d.fields.forEach((f) => keys.push(`dataType:${id}#${f.name}`))
  })
  idx.capabilities.forEach((_, id) => keys.push(`capability:${id}`))
  idx.behaviors.forEach((b, id) => {
    keys.push(`behavior:${id}`)
    if (b.kind === 'interaction') idx.messages(id).forEach((m) => keys.push(`message:${id}:${m.message.id}`))
    if (b.kind === 'process') b.nodes.forEach((n) => keys.push(`activityNode:${id}:${n.id}`))
    if (b.kind === 'state-machine') {
      b.states.forEach((s) => keys.push(`state:${id}:${s.id}`))
      b.transitions.forEach((t) => keys.push(`transition:${id}:${t.id}`))
    }
  })
  return keys
}
