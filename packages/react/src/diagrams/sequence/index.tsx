/** @jsxRuntime automatic @jsxImportSource react */
import { useMemo } from 'react'
import { ListOrdered } from 'lucide-react'
import { fragmentLabel, type ViewOf } from '@hattoriai/poney-core'
import { clip, measure, type SequenceScene } from '@hattoriai/poney-layout'
import { ArrowHead } from '../shared/Edge'
import { Rings } from '../shared/EntityNode'
import { Glyph } from '../shared/icons'
import { toneColor, toneWash } from '../shared/tone'
import { LegendRow } from '../shared/Legend'
import type { DiagramModule } from '../types'
import { useRenderBind, useRenderIndex, useRenderSubject } from '../../render'

type View = ViewOf<'sequence'>

function Renderer({ scene }: { scene: SequenceScene; view: View }) {
  const idx = useRenderIndex()
  const bind = useRenderBind()
  const { subject, selection } = useRenderSubject()
  const behavior = scene.interactionId
  const flat = idx.messages(behavior)

  // Which messages and participants the subject points at.
  const focus = useMemo(() => {
    if (!subject) return null
    const msgs = new Set<string>()
    const people = new Set<string>()
    const add = (id: string) => {
      const m = flat.find((f) => f.message.id === id)?.message
      if (!m) return
      msgs.add(id)
      people.add(m.from)
      people.add(m.to)
    }
    if (subject.kind === 'entity') {
      if (!scene.participants.some((p) => p.entityId === subject.id)) return null
      people.add(subject.id)
      flat.forEach((f) => (f.message.from === subject.id || f.message.to === subject.id) && msgs.add(f.message.id))
    } else if (subject.kind === 'message' && subject.behavior === behavior) add(subject.id)
    else if (subject.kind === 'fragment' && subject.behavior === behavior) flat.forEach((f) => f.context.some((c) => c.fragment.id === subject.id) && add(f.message.id))
    else if (subject.kind === 'relationship') flat.forEach((f) => f.message.relationship === subject.id && add(f.message.id))
    else if (subject.kind === 'dataType') flat.forEach((f) => f.message.data.includes(subject.id) && add(f.message.id))
    else return null
    return msgs.size || people.size ? { msgs, people } : null
  }, [subject, flat, scene.participants, behavior])

  const selectedMsg = selection?.kind === 'message' && selection.behavior === behavior ? selection.id : undefined
  const selectedFrag = selection?.kind === 'fragment' && selection.behavior === behavior ? selection.id : undefined
  const selectedEntity = selection?.kind === 'entity' ? selection.id : undefined

  return (
    <g>
      {/* Fragment frames, behind everything */}
      {scene.fragments.map((f) => {
        const hot = focus?.msgs.size && flat.some((m) => focus.msgs.has(m.message.id) && m.context.some((c) => c.fragment.id === f.id))
        return <rect key={`bg-${f.id}`} x={f.x} y={f.y} width={f.w} height={f.h} rx={10} fill="var(--poney-paper)" fillOpacity={0.5} stroke={selectedFrag === f.id ? 'var(--poney-accent)' : hot ? 'var(--poney-ink-4)' : 'var(--poney-rule-strong)'} strokeWidth={selectedFrag === f.id ? 1.6 : 1} />
      })}

      {/* Lifelines */}
      {scene.participants.map((p) => {
        const hot = focus?.people.has(p.entityId)
        return <line key={`l-${p.entityId}`} x1={p.x} x2={p.x} y1={p.lifeline.y1} y2={p.lifeline.y2} stroke={hot && subject?.kind === 'entity' ? 'var(--poney-accent)' : 'var(--poney-ink-4)'} strokeOpacity={hot ? 0.8 : 1} strokeWidth={hot && subject?.kind === 'entity' ? 1.6 : 1} strokeDasharray="4 5" className={focus && !hot ? 'poney-dim' : ''} />
      })}

      {/* Activations */}
      {scene.activations.map((a, i) => {
        const s = idx.style(a.entityId)
        return <rect key={i} x={a.x} y={a.y1} width={10} height={a.y2 - a.y1} rx={2} fill={toneWash(s.tone, 18)} stroke={toneColor(s.tone)} strokeWidth={1} className={focus && !focus.people.has(a.entityId) ? 'poney-dim' : ''} />
      })}

      {/* Messages */}
      {scene.messages.map((m) => {
        const hot = focus?.msgs.has(m.id)
        const selected = selectedMsg === m.id
        const color = selected || (hot && subject?.kind !== 'entity') ? 'var(--poney-accent)' : hot ? 'var(--poney-ink)' : 'var(--poney-ink-2)'
        const dash = m.kind === 'return' ? '5 4' : undefined
        const head = m.kind === 'call' ? 'arrow' : 'open-arrow'
        const textW = measure(m.label, 12.5, 500)
        const badge = (x: number, y: number) => (
          <g>
            <circle cx={x} cy={y} r={9} fill={selected ? 'var(--poney-accent)' : 'var(--poney-paper-raised)'} stroke={selected ? 'var(--poney-accent)' : 'var(--poney-rule-strong)'} />
            <text x={x} y={y + 3.5} textAnchor="middle" fontSize={10} fontWeight={650} fill={selected ? 'var(--poney-paper)' : 'var(--poney-ink-2)'} className="poney-numbers">
              {m.number}
            </text>
          </g>
        )
        const label = `Step ${m.number}: ${idx.entities.get(m.from)?.name} to ${idx.entities.get(m.to)?.name}, ${m.label}`
        if (m.loop) {
          const { x, y1, y2, w } = m.loop
          return (
            <g key={m.id} {...bind({ kind: 'message', behavior, id: m.id }, label)} className={`poney-el ${focus && !hot ? 'poney-dim' : ''}`}>
              <rect x={x - 4} y={y1 - 16} width={w + textW + 60} height={y2 - y1 + 24} fill="transparent" />
              <path d={`M ${x} ${y1} H ${x + w} V ${y2} H ${x + 6}`} fill="none" stroke={color} strokeWidth={selected ? 1.8 : 1.3} strokeLinejoin="round" />
              <ArrowHead at={{ x: x + 2, y: y2 }} angle={Math.PI} kind="arrow" color={color} />
              {badge(x + w + 18, (y1 + y2) / 2)}
              <text x={x + w + 32} y={(y1 + y2) / 2 + 4.5} fontSize={12.5} fontWeight={selected ? 650 : 500} fill={selected ? 'var(--poney-accent)' : 'var(--poney-ink)'}>
                {m.label}
              </text>
              {selected && <rect x={x - 6} y={y1 - 14} width={w + textW + 64} height={y2 - y1 + 22} rx={8} fill="var(--poney-accent-wash)" />}
            </g>
          )
        }
        const right = m.x2 > m.x1
        const mid = (m.x1 + m.x2) / 2
        const total = textW + 26
        return (
          <g key={m.id} {...bind({ kind: 'message', behavior, id: m.id }, label)} className={`poney-el ${focus && !hot ? 'poney-dim' : ''}`}>
            <rect x={Math.min(m.x1, m.x2)} y={m.y - 22} width={Math.abs(m.x2 - m.x1)} height={30} fill={selected ? 'var(--poney-accent-wash)' : 'transparent'} rx={6} />
            <line x1={m.x1} x2={m.x2 + (right ? -6 : 6)} y1={m.y} y2={m.y} stroke={color} strokeWidth={selected ? 1.8 : 1.3} strokeDasharray={dash} />
            <ArrowHead at={{ x: m.x2, y: m.y }} angle={right ? 0 : Math.PI} kind={head} color={color} />
            {badge(mid - total / 2 + 9, m.y - 12)}
            <text x={mid - total / 2 + 24} y={m.y - 7.5} fontSize={12.5} fontWeight={selected ? 650 : 500} fill={selected ? 'var(--poney-accent)' : m.kind === 'return' ? 'var(--poney-ink-2)' : 'var(--poney-ink)'}>
              {m.label}
            </text>
          </g>
        )
      })}

      {/* Fragment tabs and guards, above messages */}
      {[...scene.fragments]
        .sort((a, b) => a.depth - b.depth)
        .map((f) => {
          const name = fragmentLabel(f.kind)
          const tabW = measure(name, 11.5, 650) + 20
          const first = f.branches[0]?.guard
          return (
            <g key={f.id}>
              <g {...bind({ kind: 'fragment', behavior, id: f.id }, `${name}: ${f.branches.map((b) => b.guard).join(', or ')}`)}>
                <path d={`M ${f.x} ${f.y + 24} V ${f.y + 10} Q ${f.x} ${f.y} ${f.x + 10} ${f.y} H ${f.x + tabW} V ${f.y + 16} L ${f.x + tabW - 8} ${f.y + 24} Z`} fill={selectedFrag === f.id ? 'var(--poney-accent)' : 'var(--poney-ink-2)'} />
                <text x={f.x + 10} y={f.y + 16} fontSize={11.5} fontWeight={650} fill="var(--poney-paper)">
                  {name}
                </text>
                <rect x={f.x + tabW + 4} y={f.y + 3} width={measure(f.kind === 'loop' || f.kind === 'opt' ? first : `If ${first}`, 12, 500) + 12} height={18} rx={4} fill="var(--poney-plaster)" />
                <text x={f.x + tabW + 10} y={f.y + 16} fontSize={12} fontWeight={500} fill="var(--poney-ink-2)">
                  {f.kind === 'loop' || f.kind === 'opt' ? first : `If ${first}`}
                </text>
              </g>
              {f.branches.slice(1).map((b, i) => (
                <g key={i}>
                  <line x1={f.x} x2={f.x + f.w} y1={b.y} y2={b.y} stroke="var(--poney-rule-strong)" strokeDasharray="5 4" />
                  <rect x={f.x + 6} y={b.y + 4} width={measure(f.kind === 'par' ? `And ${b.guard}` : `Else, if ${b.guard}`, 12, 500) + 12} height={18} rx={4} fill="var(--poney-plaster)" />
                  <text x={f.x + 12} y={b.y + 17} fontSize={12} fontWeight={500} fill="var(--poney-ink-2)">
                    {f.kind === 'par' ? `And ${b.guard}` : `Else, if ${b.guard}`}
                  </text>
                </g>
              ))}
            </g>
          )
        })}

      {/* Participant headers, on top */}
      {scene.participants.map((p) => {
        const e = idx.entities.get(p.entityId)!
        const s = idx.style(e)
        const hot = focus?.people.has(p.entityId)
        const { x, y, w, h } = p.header
        return (
          <g key={p.entityId} transform={`translate(${x} ${y})`} {...bind({ kind: 'entity', id: e.id }, `${e.name}, ${s.label}`)} className={`poney-el ${focus && !hot ? 'poney-dim' : ''}`}>
            <rect className="poney-body" width={w} height={h} rx={12} fill="var(--poney-paper-raised)" stroke={hot ? toneColor(s.tone) : 'var(--poney-rule-strong)'} strokeDasharray={e.kind === 'external' ? '6 4' : undefined} />
            <rect x={12} y={(h - 32) / 2} width={32} height={32} rx={9} fill={toneWash(s.tone, 14)} />
            <Glyph name={s.icon} x={19.5} y={(h - 32) / 2 + 7.5} size={17} color={toneColor(s.tone)} />
            <text x={54} y={h / 2 - 2} fontSize={14} fontWeight={650} fill="var(--poney-ink)">
              {clip(e.name, w - 64, 14, 650)}
            </text>
            <text x={54} y={h / 2 + 14} fontSize={11.5} fill="var(--poney-ink-3)">
              {clip(e.technology ?? s.label, w - 64, 11.5)}
            </text>
            <Rings w={w} h={h} selected={selectedEntity === e.id} />
          </g>
        )
      })}
    </g>
  )
}

function Legend() {
  return (
    <div className="poney-legend">
      <LegendRow line="solid" label="Request: the sender waits" color="var(--poney-ink-2)" />
      <LegendRow line="dashed" label="Answer to a request" color="var(--poney-ink-2)" />
      <div className="poney-legend-row">
        <svg width="22" height="16" aria-hidden>
          <rect x="7" y="1" width="8" height="14" rx="2" fill="var(--poney-sunken)" stroke="var(--poney-lapis)" />
        </svg>
        Busy: handling a request
      </div>
      <div className="poney-legend-row">
        <svg width="22" height="16" aria-hidden>
          <rect x="1" y="2" width="20" height="12" rx="3" fill="none" stroke="var(--poney-rule-strong)" />
          <rect x="1" y="2" width="9" height="5" rx="1.5" fill="var(--poney-ink-2)" />
        </svg>
        Condition, loop or parallel paths
      </div>
    </div>
  )
}

export const sequence: DiagramModule<View, SequenceScene> = {
  key: 'sequence',
  label: 'Sequence',
  icon: ListOrdered,
  howToRead:
    'Time runs down the page. Each column is a participant; arrows are the messages between them, numbered in order. Boxes mark steps that happen only under a condition, repeat, or run in parallel.',
  Renderer,
  Legend,
  initialView: 'start',
}
