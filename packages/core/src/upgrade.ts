/**
 * Upgrades a document written for an earlier version of the format to the
 * current one. Every reader calls it before validating (validateDocument
 * does), so a file written for 0.1.0 opens as it is; anything that writes
 * the document writes the current version.
 *
 * 0.1.0 → 0.2.0: the names that follow the industry's terms.
 * - Entity kinds: "module" → "component" (C4), "queue" → "message-broker"; their
 *   styles too, with the old default labels ("Module", "Event bus") renamed.
 * - Data relation ends (crow's foot): "one" → "exactly-one", "many" → "zero-or-many".
 * - Use cases (UML): model.capabilities → model.useCases; the use case view's
 *   "capabilities" → "useCases"; refs "capability:…" → "useCase:…".
 * - Activities (UML): behaviour kind "process" → "activity"; the activity
 *   view's "process" → "activity"; nodes "start"/"end" → "initial"/"final".
 * - States: kind "normal" → "state".
 * - The tone "poney" → "accent"; the view category "capabilities" → "use-cases".
 */

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObject) : [])

const ENTITY_KIND: Record<string, string> = { module: 'component', queue: 'message-broker' }
/** The old default labels of those kinds; a label someone wrote themselves stays. */
const OLD_LABEL: Record<string, [string, string]> = { module: ['Module', 'Component'], queue: ['Event bus', 'Message broker'] }
const CARDINALITY: Record<string, string> = { one: 'exactly-one', many: 'zero-or-many' }

/** The document in the current version: the same object when it is current already, else an upgraded copy. */
export function upgradeDocument(input: unknown): unknown {
  if (!isObject(input) || input.poneyVersion !== '0.1.0') return input
  const doc = JSON.parse(JSON.stringify(input)) as Json
  doc.poneyVersion = '0.2.0'
  const model = isObject(doc.model) ? doc.model : undefined

  for (const e of list(model?.entities)) if (typeof e.kind === 'string' && ENTITY_KIND[e.kind]) e.kind = ENTITY_KIND[e.kind]

  for (const r of list(model?.dataRelations))
    for (const end of ['fromCardinality', 'toCardinality'])
      if (typeof r[end] === 'string' && CARDINALITY[r[end] as string]) r[end] = CARDINALITY[r[end] as string]

  if (model && 'capabilities' in model) {
    model.useCases = model.capabilities
    delete model.capabilities
  }

  for (const b of list(model?.behaviors)) {
    if (b.kind === 'process') {
      b.kind = 'activity'
      for (const n of list(b.nodes)) n.kind = n.kind === 'start' ? 'initial' : n.kind === 'end' ? 'final' : n.kind
    }
    if (b.kind === 'state-machine') for (const s of list(b.states)) if (s.kind === 'normal') s.kind = 'state'
  }

  const presentation = isObject(doc.presentation) ? doc.presentation : undefined
  const kinds = isObject(presentation?.kinds) ? presentation.kinds : undefined
  if (kinds)
    for (const [from, to] of Object.entries(ENTITY_KIND)) {
      if (!(from in kinds)) continue
      const style = kinds[from]
      if (isObject(style) && style.label === OLD_LABEL[from][0]) style.label = OLD_LABEL[from][1]
      kinds[to] = style
      delete kinds[from]
    }

  // Views, also those written inside walkthrough scenes.
  const views = [...list(doc.views), ...list(doc.walkthroughs).flatMap((w) => [w.overview, ...list(w.scenes).map((s) => s.view)]).filter(isObject)]
  for (const v of views) {
    if (v.type === 'usecase' && 'capabilities' in v) {
      v.useCases = v.capabilities
      delete v.capabilities
    }
    if (v.category === 'capabilities') v.category = 'use-cases'
    if (v.type === 'activity' && 'process' in v) {
      v.activity = v.process
      delete v.process
    }
  }

  return renameDeep(doc)
}

/** Everywhere: refs "capability:…" become "useCase:…", and the tone "poney" becomes "accent". */
function renameDeep(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('capability:')) return `useCase:${value.slice('capability:'.length)}`
    if (key === 'tone' && value === 'poney') return 'accent'
    return value
  }
  if (Array.isArray(value)) return value.map((v) => renameDeep(v, key))
  if (isObject(value)) {
    for (const [k, v] of Object.entries(value)) value[k] = renameDeep(v, k)
    return value
  }
  return value
}
