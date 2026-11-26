/** @jsxRuntime automatic @jsxImportSource react */
import { useMemo } from 'react'
import { CircleDot } from 'lucide-react'
import type { ViewOf } from '@hattoriai/poney-core'
import type { StateScene } from '@hattoriai/poney-layout'
import { EdgeLine } from '../shared/Edge'
import { Rings } from '../shared/EntityNode'
import { LegendShape } from '../shared/Legend'
import type { DiagramModule } from '../types'
import { useRenderBind, useRenderIndex, useRenderSubject } from '../../render'

type View = ViewOf<'state'>

function Renderer({ scene }: { scene: StateScene; view: View }) {
  const idx = useRenderIndex()
  const bind = useRenderBind()
  const { subject, selection } = useRenderSubject()
  const behavior = scene.machineId
  const sm = idx.stateMachine(behavior)!

  const focus = useMemo(() => {
    if (!subject) return null
    const states = new Set<string>()
    const trans = new Set<string>()
    const take = (t: StateScene['transitions'][number] | undefined) => {
      if (!t) return
      trans.add(t.id)
      states.add(t.from)
      states.add(t.to)
    }
    if (subject.kind === 'state' && subject.behavior === behavior) {
      states.add(subject.id)
      scene.transitions.forEach((t) => (t.from === subject.id || t.to === subject.id) && take(t))
    } else if (subject.kind === 'transition' && subject.behavior === behavior) take(scene.transitions.find((t) => t.id === subject.id))
    else if (subject.kind === 'entity') sm.transitions.forEach((t) => t.triggeredBy === subject.id && take(scene.transitions.find((x) => x.id === t.id)))
    else return null
    return trans.size || states.size ? { states, trans } : null
  }, [subject, scene, behavior, sm])

  const isSel = (kind: 'state' | 'transition', id: string) => selection?.kind === kind && selection.behavior === behavior && selection.id === id

  return (
    <g>
      {scene.transitions.map((t) => {
        const hot = focus?.trans.has(t.id) || isSel('transition', t.id)
        const color = hot ? 'var(--poney-accent)' : 'var(--poney-ink-3)'
        return (
          <g key={t.id} {...bind({ kind: 'transition', behavior, id: t.id }, `Transition: ${t.event}${t.guard ? `, when ${t.guard}` : ''}`)} className={`poney-el ${focus && !hot ? 'poney-dim' : ''}`}>
            <EdgeLine points={t.points} style={{ color, width: hot ? 1.9 : 1.3, head: 'arrow' }} />
            {t.label && (
              <g transform={`translate(${t.label.x} ${t.label.y})`}>
                <rect width={t.label.w} height={t.label.h} rx={7} fill="var(--poney-paper-raised)" stroke={hot ? 'var(--poney-accent)' : 'var(--poney-rule-strong)'} />
                <text x={t.label.w / 2} y={15} textAnchor="middle" fontSize={11.5} fontWeight={650} fill={hot ? 'var(--poney-accent)' : 'var(--poney-ink)'}>
                  {t.event}
                </text>
                {t.guard && (
                  <text x={t.label.w / 2} y={28} textAnchor="middle" fontSize={10.5} fill="var(--poney-ink-3)">
                    [{t.guard}]
                  </text>
                )}
              </g>
            )}
          </g>
        )
      })}
      {scene.states.map((s) => {
        const dim = focus && !focus.states.has(s.id)
        const selected = isSel('state', s.id)
        const ref = { kind: 'state', behavior, id: s.id } as const
        const stroke = s.outcome === 'success' ? 'var(--poney-success)' : s.outcome === 'failure' ? 'var(--poney-failure)' : 'var(--poney-rule-strong)'
        if (s.kind === 'initial')
          return (
            <g key={s.id} transform={`translate(${s.x} ${s.y})`} {...bind(ref, 'Start')} className={`poney-el ${dim ? 'poney-dim' : ''}`}>
              <circle cx={s.w / 2} cy={s.h / 2} r={s.w / 2} fill="var(--poney-ink)" />
              <Rings w={s.w} h={s.h} rx={s.w / 2} selected={selected} />
            </g>
          )
        return (
          <g key={s.id} transform={`translate(${s.x} ${s.y})`} {...bind(ref, `State ${s.name}${s.kind === 'final' ? ', final' : ''}`)} className={`poney-el ${dim ? 'poney-dim' : ''}`}>
            <rect className="poney-body" width={s.w} height={s.h} rx={16} fill="var(--poney-paper-raised)" stroke={stroke} strokeWidth={s.outcome === 'neutral' ? 1.1 : 1.5} />
            {s.kind === 'final' && <rect x={4} y={4} width={s.w - 8} height={s.h - 8} rx={12} fill="none" stroke={stroke} strokeWidth={1.1} />}
            {s.outcome !== 'neutral' && <circle cx={18} cy={s.entryActions.length ? 22 : s.h / 2} r={4} fill={stroke} />}
            <text x={s.w / 2} y={s.entryActions.length ? 27 : s.h / 2 + 5} textAnchor="middle" fontSize={14} fontWeight={650} fill="var(--poney-ink)">
              {s.name}
            </text>
            {s.entryActions.length > 0 && (
              <text x={s.w / 2} y={46} textAnchor="middle" fontSize={11} fill="var(--poney-ink-3)">
                On entry: {s.entryActions[0]}
                {s.entryActions.length > 1 ? ` +${s.entryActions.length - 1}` : ''}
              </text>
            )}
            <Rings w={s.w} h={s.h} rx={16} selected={selected} />
          </g>
        )
      })}
    </g>
  )
}

function Legend() {
  return (
    <div className="poney-legend">
      <LegendShape shape="dot" tone="ink" label="Where it starts" />
      <LegendShape shape="pill" tone="slate" label="A state it can be in" />
      <LegendShape shape="pill" tone="success" label="A good outcome" />
      <LegendShape shape="pill" tone="failure" label="A failed or stopped outcome" />
      <div className="poney-legend-row">
        <svg width="22" height="16" aria-hidden>
          <rect x="1" y="2" width="20" height="12" rx="5" fill="none" stroke="var(--poney-ink-3)" />
          <rect x="3.5" y="4.5" width="15" height="7" rx="3" fill="none" stroke="var(--poney-ink-3)" />
        </svg>
        Final: nothing happens after it
      </div>
      <p className="poney-legend-note">Labels on arrows are events. Text in brackets is the condition that must be true.</p>
    </div>
  )
}

export const state: DiagramModule<View, StateScene> = {
  key: 'state',
  label: 'State machine',
  icon: CircleDot,
  howToRead: 'Each box is a status. Arrows are the events that move it on; select one to see what causes it and what happens next.',
  Renderer,
  Legend,
}
