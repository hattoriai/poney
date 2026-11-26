import { PONEY_VERSION, type PoneyDocument, type PoneyDocumentInput } from '../schema/document'
import type { Cardinality, Step } from '../schema/model'
import { DEFAULT_PRESENTATION } from '../defaults'
import { validateDocument } from '../validation/validate'

/**
 * Mermaid → Poney.
 *
 * Converts the common Mermaid diagram types into a Poney document with one
 * view. Mermaid describes one picture; Poney describes the software behind
 * it, so the import creates entities, behaviors and data types from what the
 * picture shows. Styling directives (classDef, style, click) are ignored.
 *
 * Supported: sequenceDiagram, flowchart / graph, stateDiagram(-v2), erDiagram.
 */

export type MermaidKind = 'sequence' | 'flowchart' | 'state' | 'er'

export class MermaidImportError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(line ? `Line ${line}: ${message}` : message)
  }
}

export interface MermaidImport {
  kind: MermaidKind
  document: PoneyDocument
}

export function detectMermaid(text: string): MermaidKind | undefined {
  const first = meaningfulLines(text)[0]?.text ?? ''
  if (/^sequenceDiagram\b/.test(first)) return 'sequence'
  if (/^(flowchart|graph)\b/.test(first)) return 'flowchart'
  if (/^stateDiagram(-v2)?\b/.test(first)) return 'state'
  if (/^erDiagram\b/.test(first)) return 'er'
  return undefined
}

export const looksLikeMermaid = (text: string) => detectMermaid(text) !== undefined

export function fromMermaid(text: string, options: { name?: string } = {}): MermaidImport {
  const kind = detectMermaid(text)
  if (!kind) throw new MermaidImportError('Not a supported Mermaid diagram. Start with sequenceDiagram, flowchart, stateDiagram or erDiagram.')
  const lines = meaningfulLines(text).filter((l) => !/^(title|accTitle|accDescr)\b/.test(l.text))
  const title = options.name ?? findTitle(text)
  const input = { sequence: sequence, flowchart: flowchart, state: state, er: er }[kind](lines.slice(1), title)
  const result = validateDocument(input)
  if (!result.ok) {
    const first = result.issues.find((i) => i.severity === 'error')
    throw new MermaidImportError(`The diagram converted to an invalid model (${first?.path}: ${first?.message})`)
  }
  return { kind, document: result.document }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface Line {
  text: string
  no: number
}

function meaningfulLines(text: string): Line[] {
  const out: Line[] = []
  let inFrontMatter = false
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim()
    if (i === 0 && t === '---') return void (inFrontMatter = true)
    if (inFrontMatter) {
      if (t === '---') inFrontMatter = false
      return
    }
    if (!t || t.startsWith('%%')) return
    out.push({ text: t, no: i + 1 })
  })
  return out
}

function findTitle(text: string): string | undefined {
  return /^\s*title:?\s+(.+)$/m.exec(text)?.[1]?.trim()
}

function slug(value: string): string {
  const s = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s && /^[a-z0-9]/.test(s) ? s : `x-${s || 'item'}`
}

function unquote(s: string) {
  const t = s.trim()
  return t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) ? t.slice(1, -1) : t
}

/** Unique, valid ids. */
function idMaker() {
  const used = new Set<string>()
  return (raw: string) => {
    const base = slug(raw)
    let id = base
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`
    used.add(id)
    return id
  }
}

type ModelInput = NonNullable<PoneyDocumentInput['model']>
/** A document under construction: model and views always present. */
type Draft = Omit<PoneyDocumentInput, 'model' | 'views'> & {
  model: ModelInput & { entities: NonNullable<ModelInput['entities']>; relationships: NonNullable<ModelInput['relationships']> }
  views: NonNullable<PoneyDocumentInput['views']>
}

function shell(name: string, description: string): Draft {
  return {
    poneyVersion: PONEY_VERSION,
    project: { id: slug(name), name, description },
    model: { entities: [], relationships: [] },
    views: [],
    presentation: DEFAULT_PRESENTATION,
  }
}

// ─── sequenceDiagram ───────────────────────────────────────────────────────

const ARROW = /^(.+?)\s*(-->>|->>|--x|-x|--\)|-\)|-->|->)\s*([+-]?)\s*(.+?)\s*:\s*(.*)$/

function sequence(lines: Line[], title?: string): Draft {
  const name = title ?? 'Imported sequence'
  const doc = shell(name, 'Imported from a Mermaid sequence diagram.')
  const newId = idMaker()
  const participants = new Map<string, string>() // mermaid id -> entity id
  const entities = doc.model.entities
  const ensure = (raw: string, label?: string, actor = false) => {
    const key = raw.trim()
    let id = participants.get(key)
    if (!id) {
      id = newId(key)
      participants.set(key, id)
      entities.push({ id, kind: actor ? 'person' : 'service', name: label ?? key, summary: '' })
    }
    return id
  }

  const root: Step[] = []
  const stack: { fragment?: Extract<Step, { type: 'fragment' }>; steps: Step[]; ignore?: boolean }[] = [{ steps: root }]
  const top = () => stack[stack.length - 1]
  let n = 0
  let f = 0

  for (const { text, no } of lines) {
    let m: RegExpExecArray | null
    if (/^(autonumber|activate|deactivate|title|Note|note|create|destroy|links?|properties)\b/.test(text)) continue
    if ((m = /^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/.exec(text))) {
      ensure(m[2], m[3] ? unquote(m[3]) : undefined, m[1] === 'actor')
      continue
    }
    if (/^(box|rect)\b/.test(text)) {
      stack.push({ steps: top().steps, ignore: true })
      continue
    }
    if ((m = /^(alt|opt|loop|par|critical|break)\b\s*(.*)$/.exec(text))) {
      const kind = m[1] === 'critical' || m[1] === 'break' ? 'opt' : (m[1] as 'alt' | 'opt' | 'loop' | 'par')
      const guard = m[2] || m[1]
      const fragment: Extract<Step, { type: 'fragment' }> = {
        type: 'fragment',
        id: `f${++f}`,
        kind,
        label: { alt: 'Alternatives', opt: 'Optional', loop: 'Loop', par: 'In parallel' }[kind],
        branches: [{ guard, steps: [] }],
      }
      top().steps.push(fragment)
      stack.push({ fragment, steps: fragment.branches[0].steps })
      continue
    }
    if ((m = /^(else|and|option)\b\s*(.*)$/.exec(text))) {
      const frame = top()
      if (!frame.fragment) throw new MermaidImportError(`"${m[1]}" outside of a block`, no)
      const branch = { guard: m[2] || 'otherwise', steps: [] as Step[] }
      frame.fragment.branches.push(branch)
      frame.steps = branch.steps
      continue
    }
    if (text === 'end') {
      if (stack.length === 1) throw new MermaidImportError('"end" without a block', no)
      stack.pop()
      continue
    }
    if ((m = ARROW.exec(text))) {
      const from = ensure(m[1])
      const to = ensure(m[4])
      const arrow = m[2]
      const kind = from === to ? 'self' : arrow.startsWith('--') && arrow.endsWith('>') ? 'return' : arrow.endsWith(')') ? 'async' : 'call'
      top().steps.push({ type: 'message', id: `m${++n}`, kind, from, to, label: m[5] || '(message)', data: [] })
      continue
    }
    throw new MermaidImportError(`Cannot read "${text}"`, no)
  }
  if (stack.length > 1) throw new MermaidImportError('A block is missing its "end"')
  if (entities.length < 2) throw new MermaidImportError('A sequence needs at least two participants')
  if (root.length === 0) throw new MermaidImportError('The sequence has no messages')
  doc.model.behaviors = [{ kind: 'interaction', id: 'sequence', name, summary: '', participants: [...participants.values()], steps: root }]
  doc.views = [{ id: 'sequence', type: 'sequence', category: 'behavior', title: name, description: 'Imported from Mermaid.', interaction: 'sequence' }]
  doc.project.defaultView = 'sequence'
  return doc
}

// ─── flowchart ─────────────────────────────────────────────────────────────

type Shape = 'rect' | 'round' | 'stadium' | 'circle' | 'diamond' | 'other'
const NODE = /^([A-Za-z0-9_][\w\-.]*)\s*(\(\[[\s\S]*\]\)|\[\[[\s\S]*\]\]|\[\([\s\S]*\)\]|\(\([\s\S]*\)\)|\{\{[\s\S]*\}\}|\[\/[\s\S]*\/\]|\[\\[\s\S]*\\\]|\[[\s\S]*\]|\([\s\S]*\)|\{[\s\S]*\}|>[\s\S]*\])?\s*(?::::[\w-]+)?$/
const EDGE_SPLIT = /\s*(<-->|-->|---|-\.->|-\.-|==>|===|--x|--o)\s*(?:\|([^|]*)\|)?\s*/

function parseNode(raw: string, no: number): { key: string; label?: string; shape: Shape } {
  const m = NODE.exec(raw.trim())
  if (!m) throw new MermaidImportError(`Cannot read the node "${raw.trim()}"`, no)
  const body = m[2]
  if (!body) return { key: m[1], shape: 'rect' }
  const pairs: [string, string, Shape][] = [
    ['([', '])', 'stadium'],
    ['((', '))', 'circle'],
    ['{{', '}}', 'other'],
    ['[[', ']]', 'rect'],
    ['[(', ')]', 'other'],
    ['[/', '/]', 'other'],
    ['[\\', '\\]', 'other'],
    ['[', ']', 'rect'],
    ['(', ')', 'round'],
    ['{', '}', 'diamond'],
    ['>', ']', 'other'],
  ]
  for (const [open, close, shape] of pairs)
    if (body.startsWith(open) && body.endsWith(close)) return { key: m[1], label: unquote(body.slice(open.length, -close.length)), shape }
  return { key: m[1], shape: 'rect' }
}

function flowchart(lines: Line[], title?: string): Draft {
  const name = title ?? 'Imported flowchart'
  const doc = shell(name, 'Imported from a Mermaid flowchart.')
  const newId = idMaker()
  const nodes = new Map<string, { id: string; label: string; shape: Shape; lane?: string }>()
  const flows: { from: string; to: string; guard?: string }[] = []
  const lanes: { id: string; name: string }[] = []
  const laneStack: string[] = []

  const touch = (raw: string, no: number) => {
    const p = parseNode(raw, no)
    let node = nodes.get(p.key)
    if (!node) {
      node = { id: newId(p.key), label: p.label ?? p.key, shape: p.shape, lane: laneStack[laneStack.length - 1] }
      nodes.set(p.key, node)
    } else if (p.label) {
      node.label = p.label
      node.shape = p.shape
    }
    return node
  }

  for (const { text, no } of lines) {
    let m: RegExpExecArray | null
    if (/^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr|title)\b/.test(text)) continue
    if ((m = /^subgraph\s+(.+)$/.exec(text))) {
      const parts = /^([\w-]+)\s*\[(.+)\]$/.exec(m[1].trim())
      const label = unquote(parts ? parts[2] : m[1])
      const id = newId(`lane-${parts ? parts[1] : label}`)
      lanes.push({ id, name: label })
      laneStack.push(id)
      continue
    }
    if (text === 'end') {
      laneStack.pop()
      continue
    }
    // "A -- text --> B" and friends become "A -->|text| B".
    const normalized = text
      .replace(/;$/, '')
      .replace(/--\s+([^-|>][^>]*?)\s+-->/g, '-->|$1|')
      .replace(/-\.\s+([^.]+?)\s+\.->/g, '-.->|$1|')
      .replace(/==\s+([^=]+?)\s+==>/g, '==>|$1|')
    const parts = normalized.split(EDGE_SPLIT)
    // parts: node, op, label, node, op, label, node...
    const groups = (s: string) => s.split(/\s*&\s*/)
    let previous = groups(parts[0]).map((p) => touch(p, no))
    for (let i = 1; i + 2 < parts.length + 1; i += 3) {
      if (parts[i + 2] === undefined) break
      const label = parts[i + 1]?.trim()
      const next = groups(parts[i + 2]).map((p) => touch(p, no))
      for (const a of previous) for (const b of next) flows.push({ from: a.id, to: b.id, guard: label ? unquote(label) : undefined })
      previous = next
    }
  }
  if (nodes.size === 0) throw new MermaidImportError('The flowchart has no nodes')

  const incoming = new Set(flows.map((f) => f.to))
  const outgoing = new Set(flows.map((f) => f.from))
  const list = [...nodes.values()]
  const kindOf = (n: (typeof list)[number]) => {
    if (n.shape === 'diamond') return 'decision' as const
    if ((n.shape === 'circle' || n.shape === 'stadium') && !incoming.has(n.id)) return 'initial' as const
    if ((n.shape === 'circle' || n.shape === 'stadium') && !outgoing.has(n.id)) return 'final' as const
    return 'action' as const
  }
  const activity = list.map((n) => ({ id: n.id, kind: kindOf(n), label: n.label, performedBy: n.lane }))
  const starts = activity.filter((n) => n.kind === 'initial')
  if (starts.length !== 1) {
    starts.forEach((s) => (s.kind = 'action'))
    const roots = activity.filter((n) => !incoming.has(n.id))
    const start = { id: newId('start'), kind: 'initial' as const, label: 'Start', performedBy: (roots[0] ?? activity[0]).performedBy }
    activity.unshift(start)
    for (const r of roots.length ? roots : [activity[1]]) flows.push({ from: start.id, to: r.id })
  }
  doc.model.entities = lanes.map((l) => ({ id: l.id, kind: 'component', name: l.name, summary: '' }))
  doc.model.behaviors = [
    { kind: 'activity', id: 'flow', name, summary: '', nodes: activity, flows: flows.map((f, i) => ({ id: `e${i + 1}`, ...f })) },
  ]
  doc.views = [{ id: 'flow', type: 'activity', category: 'behavior', title: name, description: 'Imported from Mermaid.', activity: 'flow', swimlanes: lanes.length > 0 }]
  doc.project.defaultView = 'flow'
  return doc
}

// ─── stateDiagram ──────────────────────────────────────────────────────────

function state(lines: Line[], title?: string): Draft {
  const name = title ?? 'Imported lifecycle'
  const doc = shell(name, 'Imported from a Mermaid state diagram.')
  const newId = idMaker()
  const states = new Map<string, { id: string; name: string; description?: string }>()
  const transitions: { from: string; to: string; label?: string }[] = []
  const INITIAL = '[*]:initial'
  const FINAL = '[*]:final'

  const touch = (key: string) => {
    let s = states.get(key)
    if (!s) {
      s = { id: newId(key === INITIAL ? 'start' : key === FINAL ? 'end' : key), name: key === INITIAL ? 'Start' : key === FINAL ? 'End' : key }
      states.set(key, s)
    }
    return s
  }

  for (const { text, no } of lines) {
    let m: RegExpExecArray | null
    if (/^(note|direction|classDef|class|style)\b/i.test(text) || text === '}' || text === '--') continue
    if ((m = /^state\s+"([^"]+)"\s+as\s+([\w-]+)/.exec(text))) {
      touch(m[2]).name = m[1]
      continue
    }
    if ((m = /^state\s+([\w-]+)/.exec(text))) {
      touch(m[1])
      continue
    }
    if ((m = /^(\[\*\]|[\w-]+)\s*-->\s*(\[\*\]|[\w-]+)\s*(?::\s*(.*))?$/.exec(text))) {
      const from = m[1] === '[*]' ? INITIAL : m[1]
      const to = m[2] === '[*]' ? FINAL : m[2]
      touch(from)
      touch(to)
      transitions.push({ from, to, label: m[3]?.trim() })
      continue
    }
    if ((m = /^([\w-]+)\s*:\s*(.+)$/.exec(text))) {
      touch(m[1]).description = m[2]
      continue
    }
    throw new MermaidImportError(`Cannot read "${text}"`, no)
  }
  if (transitions.length === 0) throw new MermaidImportError('The state diagram has no transitions')
  if (!states.has(INITIAL)) {
    const first = transitions[0].from
    touch(INITIAL)
    transitions.unshift({ from: INITIAL, to: first })
  }

  // A state whose only way out is [*] is itself final; otherwise keep an explicit End.
  const finals = new Set<string>()
  const toFinal = transitions.filter((t) => t.to === FINAL)
  for (const t of toFinal) {
    if (!transitions.some((o) => o.from === t.from && o.to !== FINAL)) finals.add(t.from)
  }
  const kept = transitions.filter((t) => !(t.to === FINAL && finals.has(t.from)))
  if (!kept.some((t) => t.to === FINAL)) states.delete(FINAL)

  const parseLabel = (label?: string) => {
    if (!label) return { event: 'Next' }
    const lm = /^(.*?)\s*(?:\[(.*?)\])?\s*(?:\/\s*(.*))?$/.exec(label)!
    return {
      event: lm[1] || label,
      guard: lm[2] || undefined,
      actions: lm[3] ? lm[3].split(/\s*[;,]\s*/).filter(Boolean) : [],
    }
  }
  doc.model.behaviors = [
    {
      kind: 'state-machine',
      id: 'lifecycle',
      name,
      summary: '',
      states: [...states.entries()].map(([key, s]) => ({
        id: s.id,
        kind: key === INITIAL ? 'initial' : key === FINAL || finals.has(key) ? 'final' : 'state',
        name: s.name,
        description: s.description,
      })),
      transitions: kept.map((t, i) => ({ id: `t${i + 1}`, from: states.get(t.from)!.id, to: states.get(t.to)!.id, ...parseLabel(t.label) })),
    },
  ]
  doc.views = [{ id: 'lifecycle', type: 'state', category: 'behavior', title: name, description: 'Imported from Mermaid.', stateMachine: 'lifecycle' }]
  doc.project.defaultView = 'lifecycle'
  return doc
}

// ─── erDiagram ─────────────────────────────────────────────────────────────

const CARD = '(\\|\\||\\|o|o\\||\\}\\||\\|\\{|\\}o|o\\{)'
const REL = new RegExp(`^([\\w-]+)\\s*${CARD}(--|\\.\\.)${CARD}\\s*([\\w-]+)\\s*:\\s*(.+)$`)

function cardinality(token: string): Cardinality {
  if (token === '||') return 'exactly-one'
  if (token === '|o' || token === 'o|') return 'zero-or-one'
  if (token === '}|' || token === '|{') return 'one-or-many'
  return 'zero-or-many'
}

function er(lines: Line[], title?: string): Draft {
  const name = title ?? 'Imported data model'
  const doc = shell(name, 'Imported from a Mermaid ER diagram.')
  const newId = idMaker()
  const tables = new Map<string, { id: string; name: string; fields: { name: string; type: string; primaryKey?: boolean; unique?: boolean; description?: string }[] }>()
  const relations: NonNullable<ModelInput['dataRelations']> = []
  let open: ReturnType<typeof touch> | null = null

  function touch(key: string) {
    let t = tables.get(key)
    if (!t) {
      t = { id: newId(key), name: key, fields: [] }
      tables.set(key, t)
    }
    return t
  }

  for (const { text, no } of lines) {
    let m: RegExpExecArray | null
    if (open) {
      if (text === '}') {
        open = null
        continue
      }
      const fm = /^([\w<>[\](),.-]+)\s+([\w-]+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"([^"]*)")?$/.exec(text)
      if (!fm) throw new MermaidImportError(`Cannot read the attribute "${text}"`, no)
      const keys = (fm[3] ?? '').split(/\s*,\s*/)
      open.fields.push({
        name: fm[2],
        type: fm[1],
        primaryKey: keys.includes('PK') || undefined,
        unique: keys.includes('UK') || undefined,
        description: [keys.includes('FK') ? 'Foreign key.' : '', fm[4] ?? ''].filter(Boolean).join(' ') || undefined,
      })
      continue
    }
    if ((m = /^([\w-]+)(?:\["?([^"\]]+)"?\])?\s*\{$/.exec(text))) {
      open = touch(m[1])
      if (m[2]) open.name = m[2]
      continue
    }
    if ((m = REL.exec(text))) {
      const a = touch(m[1])
      const b = touch(m[5])
      relations.push({
        id: newId(`rel-${m[1]}-${m[5]}`),
        from: a.id,
        to: b.id,
        fromCardinality: cardinality(m[2]),
        toCardinality: cardinality(m[4]),
        label: unquote(m[6]),
        logical: m[3] === '..',
      })
      continue
    }
    if ((m = /^([\w-]+)$/.exec(text))) {
      touch(m[1])
      continue
    }
    throw new MermaidImportError(`Cannot read "${text}"`, no)
  }
  if (tables.size === 0) throw new MermaidImportError('The ER diagram has no entities')
  doc.model.dataTypes = [...tables.values()].map((t) => ({ id: t.id, kind: 'table', name: t.name, summary: '', fields: t.fields }))
  doc.model.dataRelations = relations
  doc.views = [
    { id: 'data-model', type: 'erd', category: 'data', title: name, description: 'Imported from Mermaid.', dataTypes: [...tables.values()].map((t) => t.id) },
  ]
  doc.project.defaultView = 'data-model'
  return doc
}
