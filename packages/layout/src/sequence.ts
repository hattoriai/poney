import { indexOf, refKey, type Message, type PoneyDocument, type Step, type ViewOf } from '@hattoriai/poney-core'
import { measure } from './text'
import type { Rect, SceneBase } from './types'

export interface SequenceParticipant {
  entityId: string
  x: number
  header: Rect
  lifeline: { y1: number; y2: number }
}

export interface SequenceMessage {
  id: string
  number: number
  kind: Message['kind']
  from: string
  to: string
  label: string
  y: number
  x1: number
  x2: number
  /** Self messages loop to the right of their lifeline. */
  loop?: { x: number; y1: number; y2: number; w: number }
  /** Fragment ids around the message, outermost first. */
  fragments: string[]
}

export interface SequenceActivation {
  entityId: string
  x: number
  y1: number
  y2: number
}

export interface SequenceFragment extends Rect {
  id: string
  kind: 'alt' | 'opt' | 'loop' | 'par'
  label: string
  depth: number
  branches: { guard: string; y: number }[]
}

export interface SequenceScene extends SceneBase {
  interactionId: string
  participants: SequenceParticipant[]
  messages: SequenceMessage[]
  activations: SequenceActivation[]
  fragments: SequenceFragment[]
}

export const SEQ = {
  headerH: 64,
  headerGap: 30,
  row: 44,
  selfRow: 58,
  fragmentHeader: 34,
  branchHeader: 30,
  fragmentEnd: 14,
  activationW: 10,
  margin: 32,
  labelSize: 12.5,
} as const

export interface SequenceLayoutOptions {
  /**
   * Draw only these messages, the fragments around them and their
   * participants. Numbers stay those of the whole interaction.
   */
  only?: string[]
  /**
   * Narrower columns for stories: labels may cross a lifeline (renderers
   * draw them with a halo), so columns need only part of each label's width.
   */
  compact?: boolean
}

/** Keeps the messages in `keep`, and the fragments and branches that still hold one. */
function prune(steps: Step[], keep: Set<string>): Step[] {
  const out: Step[] = []
  for (const s of steps) {
    if (s.type === 'message') {
      if (keep.has(s.id)) out.push(s)
      continue
    }
    const branches = s.branches.map((b) => ({ ...b, steps: prune(b.steps, keep) })).filter((b) => b.steps.length > 0)
    if (branches.length) out.push({ ...s, branches })
  }
  return out
}

export function layoutSequence(doc: PoneyDocument, view: ViewOf<'sequence'>, options: SequenceLayoutOptions = {}): SequenceScene {
  const idx = indexOf(doc)
  const full = idx.interaction(view.interaction)
  if (!full) throw new Error(`Unknown interaction "${view.interaction}"`)
  const numberOf = new Map(idx.messages(full.id).map((f) => [f.message.id, f.number]))
  const keep = options.only?.length ? new Set(options.only) : undefined
  const steps = keep ? prune(full.steps, keep) : full.steps
  const used = new Set<string>()
  const collect = (list: Step[]) =>
    list.forEach((s) => (s.type === 'message' ? (used.add(s.from), used.add(s.to)) : s.branches.forEach((b) => collect(b.steps))))
  collect(steps)
  const interaction = { ...full, steps, participants: keep ? full.participants.filter((p) => used.has(p)) : full.participants }
  const flat: { message: Message }[] = []
  const walkFlat = (list: Step[]) => list.forEach((s) => (s.type === 'message' ? flat.push({ message: s }) : s.branches.forEach((b) => walkFlat(b.steps))))
  walkFlat(steps)
  const ids = interaction.participants
  const col = new Map(ids.map((id, i) => [id, i]))

  // ── Columns: wide enough for names, then for message labels. ───────────
  const compact = !!options.compact
  const widths = ids.map((id) => Math.max(compact ? 128 : 156, measure(idx.entities.get(id)?.name ?? id, 14.5, 650) + (compact ? 60 : 70)))
  const gaps = ids.map((_, i) => (i === 0 ? 0 : widths[i - 1] / 2 + widths[i] / 2 + (compact ? 28 : 36)))
  // A label is the message number, the text and room for a "New" tag.
  const labelWidth = (m: Message) => (measure(m.label, SEQ.labelSize, 500) + 44 + (compact ? 60 : 0)) * (compact ? 0.62 : 1)
  for (const { message: m } of flat) {
    const a = col.get(m.from)!
    const b = col.get(m.to)!
    if (a === b) {
      // A self message needs room before the next lifeline.
      if (a + 1 < ids.length) gaps[a + 1] = Math.max(gaps[a + 1], labelWidth(m) + (compact ? 40 : 56))
      continue
    }
    const [lo, hi] = a < b ? [a, b] : [b, a]
    const span = gaps.slice(lo + 1, hi + 1).reduce((s, g) => s + g, 0)
    const need = labelWidth(m) + 24
    if (span < need) for (let i = lo + 1; i <= hi; i++) gaps[i] += (need - span) / (hi - lo)
  }
  const xs: number[] = []
  ids.forEach((_, i) => xs.push(i === 0 ? SEQ.margin + 40 + widths[0] / 2 : xs[i - 1] + gaps[i]))
  const xOf = (id: string) => xs[col.get(id)!]

  // ── Rows, fragments and activations. ────────────────────────────────────
  const messages: SequenceMessage[] = []
  const fragments: SequenceFragment[] = []
  const activations: SequenceActivation[] = []
  const open = new Map<string, number[]>(ids.map((id) => [id, []])) // start y of open activations
  const depth = (id: string) => open.get(id)!.length
  const barX = (id: string, d: number) => xOf(id) - SEQ.activationW / 2 + Math.max(0, d - 1) * 4
  const edgeX = (id: string, towardsRight: boolean) => {
    const d = depth(id)
    if (d === 0) return xOf(id)
    const bx = barX(id, d)
    return towardsRight ? bx + SEQ.activationW : bx
  }
  const push = (id: string, y: number) => open.get(id)!.push(y)
  const pop = (id: string, y: number) => {
    const stack = open.get(id)!
    const start = stack.pop()
    if (start !== undefined) activations.push({ entityId: id, x: barX(id, stack.length + 1), y1: start, y2: Math.max(y, start + 12) })
  }
  const snapshot = () => new Map([...open].map(([k, v]) => [k, v.length]))
  const restore = (snap: Map<string, number>, y: number) => {
    for (const id of ids) {
      while (depth(id) > 0) pop(id, y)
      for (let i = 0; i < (snap.get(id) ?? 0); i++) push(id, y)
    }
  }

  let y = SEQ.headerH + SEQ.headerGap
  let maxRight = xs[xs.length - 1] + widths[widths.length - 1] / 2
  const involved = (steps: Step[], acc = new Set<string>()) => {
    for (const s of steps) {
      if (s.type === 'message') {
        acc.add(s.from)
        acc.add(s.to)
      } else s.branches.forEach((b) => involved(b.steps, acc))
    }
    return acc
  }
  const nesting = (steps: Step[]): number =>
    Math.max(0, ...steps.map((s) => (s.type === 'fragment' ? 1 + Math.max(...s.branches.map((b) => nesting(b.steps))) : 0)))

  const walk = (steps: Step[], stackIds: string[], level: number) => {
    for (const s of steps) {
      if (s.type === 'message') {
        const m = s
        if (m.kind === 'self') {
          const x = edgeX(m.from, true)
          push(m.from, y + 6)
          const w = 34
          messages.push({ id: m.id, number: numberOf.get(m.id)!, kind: m.kind, from: m.from, to: m.to, label: m.label, y, x1: x, x2: x, loop: { x, y1: y - 2, y2: y + 20, w }, fragments: stackIds })
          maxRight = Math.max(maxRight, x + w + measure(m.label, SEQ.labelSize, 500) + 48)
          pop(m.from, y + 28)
          y += SEQ.selfRow
          continue
        }
        const right = xOf(m.to) > xOf(m.from)
        if (m.kind === 'call') {
          if (depth(m.from) === 0 && !compact) push(m.from, y - 10)
          const x1 = edgeX(m.from, right)
          push(m.to, y)
          const x2 = edgeX(m.to, !right)
          messages.push({ id: m.id, number: numberOf.get(m.id)!, kind: m.kind, from: m.from, to: m.to, label: m.label, y, x1, x2, fragments: stackIds })
        } else if (m.kind === 'return') {
          const x1 = edgeX(m.from, right)
          pop(m.from, y)
          const x2 = edgeX(m.to, !right)
          messages.push({ id: m.id, number: numberOf.get(m.id)!, kind: m.kind, from: m.from, to: m.to, label: m.label, y, x1, x2, fragments: stackIds })
        } else {
          const x1 = edgeX(m.from, right)
          const x2 = edgeX(m.to, !right)
          messages.push({ id: m.id, number: numberOf.get(m.id)!, kind: m.kind, from: m.from, to: m.to, label: m.label, y, x1, x2, fragments: stackIds })
        }
        y += SEQ.row
        continue
      }
      // Fragment
      const f = s
      const top = y - 18
      const who = [...involved([f])].map((id) => col.get(id)!).sort((a, b) => a - b)
      // Outer fragments get more padding than the fragments they contain.
      const pad = 30 + (nesting([f]) - 1) * 12
      const x = xs[who[0]] - pad
      let right = xs[who[who.length - 1]] + pad
      y = top + SEQ.fragmentHeader + 18
      const branches: SequenceFragment['branches'] = []
      const snap = snapshot()
      const before = messages.length
      f.branches.forEach((b, i) => {
        if (i > 0) {
          const sepY = y - 18
          branches.push({ guard: b.guard, y: sepY })
          restore(snap, sepY)
          y = sepY + SEQ.branchHeader + 18
        } else branches.push({ guard: b.guard, y: top })
        walk(b.steps, [...stackIds, f.id], level + 1)
      })
      for (const m of messages.slice(before)) if (m.loop) right = Math.max(right, m.loop.x + m.loop.w + measure(m.label, SEQ.labelSize, 500) + 48)
      const bottom = y - 18 + SEQ.fragmentEnd
      fragments.push({ id: f.id, kind: f.kind, label: f.label, depth: level, branches, x, y: top, w: right - x, h: bottom - top })
      maxRight = Math.max(maxRight, right)
      y = bottom + 26
    }
  }
  walk(interaction.steps, [], 0)
  const end = y + 4
  for (const id of ids) while (depth(id) > 0) pop(id, end - 18)

  const participants: SequenceParticipant[] = ids.map((id, i) => ({
    entityId: id,
    x: xs[i],
    header: { x: xs[i] - widths[i] / 2, y: 0, w: widths[i], h: SEQ.headerH },
    lifeline: { y1: SEQ.headerH, y2: end },
  }))
  const minX = Math.min(0, ...fragments.map((f) => f.x - SEQ.margin))
  const shift = -minX
  if (shift) {
    participants.forEach((p) => {
      p.x += shift
      p.header.x += shift
    })
    messages.forEach((m) => {
      m.x1 += shift
      m.x2 += shift
      if (m.loop) m.loop.x += shift
    })
    activations.forEach((a) => (a.x += shift))
    fragments.forEach((f) => (f.x += shift))
    maxRight += shift
  }

  const anchors: Record<string, Rect> = {}
  anchors[refKey({ kind: 'behavior', id: interaction.id })] = { x: 0, y: 0, w: maxRight + SEQ.margin, h: end }
  for (const p of participants) anchors[refKey({ kind: 'entity', id: p.entityId })] = p.header
  for (const m of messages) {
    const x = Math.min(m.x1, m.x2)
    const w = Math.max(Math.abs(m.x2 - m.x1), m.loop ? m.loop.w + 120 : 0)
    anchors[refKey({ kind: 'message', behavior: interaction.id, id: m.id })] = { x, y: m.y - 22, w, h: 32 }
  }
  for (const f of fragments) anchors[refKey({ kind: 'fragment', behavior: interaction.id, id: f.id })] = f

  return { interactionId: interaction.id, width: maxRight + SEQ.margin, height: end + 24, participants, messages, activations, fragments, anchors }
}
