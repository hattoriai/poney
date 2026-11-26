/** @jsxRuntime automatic @jsxImportSource react */
import { useMemo } from 'react'
import { GitBranch } from 'lucide-react'
import type { ViewOf } from '@hattoriai/poney-core'
import { measure, type ActivityScene } from '@hattoriai/poney-layout'
import { EdgeLine } from '../shared/Edge'
import { Rings } from '../shared/EntityNode'
import { Glyph } from '../shared/icons'
import { toneColor } from '../shared/tone'
import { LegendShape } from '../shared/Legend'
import type { DiagramModule } from '../types'
import { useRenderBind, useRenderIndex, useRenderSubject } from '../../render'

type View = ViewOf<'activity'>

function Renderer({ scene }: { scene: ActivityScene; view: View }) {
  const idx = useRenderIndex()
  const bind = useRenderBind()
  const { subject, selection } = useRenderSubject()
  const behavior = scene.processId

  const focus = useMemo(() => {
    if (!subject) return null
    const nodes = new Set<string>()
    const edges = new Set<string>()
    if (subject.kind === 'activityNode' && subject.behavior === behavior) {
      nodes.add(subject.id)
      scene.edges.forEach((e) => {
        if (e.from === subject.id || e.to === subject.id) {
          edges.add(e.id)
          nodes.add(e.from)
          nodes.add(e.to)
        }
      })
    } else if (subject.kind === 'activityFlow' && subject.behavior === behavior) {
      const e = scene.edges.find((x) => x.id === subject.id)
      if (!e) return null
      edges.add(e.id)
      nodes.add(e.from)
      nodes.add(e.to)
    } else if (subject.kind === 'entity') {
      const lane = scene.lanes.findIndex((l) => l.entityId === subject.id)
      if (lane < 0) return null
      scene.nodes.forEach((n) => n.lane === lane && nodes.add(n.id))
      scene.edges.forEach((e) => nodes.has(e.from) && nodes.has(e.to) && edges.add(e.id))
    } else return null
    return { nodes, edges }
  }, [subject, scene, behavior])

  const sel = (kind: 'activityNode' | 'activityFlow', id: string) => selection?.kind === kind && selection.behavior === behavior && selection.id === id

  return (
    <g>
      {/* Lanes */}
      {scene.lanes.map((l, i) => {
        const e = l.entityId ? idx.entities.get(l.entityId) : undefined
        const s = e ? idx.style(e) : undefined
        const laneHot = subject?.kind === 'entity' && subject.id === l.entityId
        return (
          <g key={i}>
            <rect x={l.x} y={0} width={l.w} height={scene.height} fill={i % 2 ? 'var(--poney-paper)' : 'transparent'} fillOpacity={0.45} />
            {i > 0 && <line x1={l.x} x2={l.x} y1={0} y2={scene.height} stroke="var(--poney-rule)" />}
            <g {...(e ? bind({ kind: 'entity', id: e.id }, `Lane: ${e.name}`) : {})}>
              <rect x={l.x + 8} y={8} width={l.w - 16} height={scene.laneHeader - 16} rx={8} fill={laneHot ? 'var(--poney-accent-wash)' : 'var(--poney-paper-raised)'} stroke={laneHot ? 'var(--poney-accent)' : 'var(--poney-rule)'} />
              {s && <Glyph name={s.icon} x={l.x + l.w / 2 - measure(l.label, 13, 650) / 2 - 12} y={scene.laneHeader / 2 - 7} size={14} color={toneColor(s.tone)} />}
              <text x={l.x + l.w / 2 + (s ? 9 : 0)} y={scene.laneHeader / 2 + 4.5} textAnchor="middle" fontSize={13} fontWeight={650} fill="var(--poney-ink)">
                {l.label}
              </text>
            </g>
          </g>
        )
      })}

      {/* Flows */}
      {scene.edges.map((e) => {
        const hot = focus?.edges.has(e.id) || sel('activityFlow', e.id)
        const color = hot ? 'var(--poney-accent)' : 'var(--poney-ink-3)'
        return (
          <g key={e.id} {...bind({ kind: 'activityFlow', behavior, id: e.id }, idx.describe({ kind: 'activityFlow', behavior, id: e.id }).title)} className={`poney-el ${focus && !hot ? 'poney-dim' : ''}`}>
            <EdgeLine points={e.points} style={{ color, width: hot ? 1.9 : 1.3, head: 'arrow', dash: e.back ? '6 4' : undefined }} />
            {e.guard && e.guardAt && (
              <g pointerEvents="none">
                <rect
                  x={e.guardAt.anchor === 'end' ? e.guardAt.x - measure(e.guard, 11.5, 650) - 12 : e.guardAt.x - 2}
                  y={e.guardAt.y - 11}
                  width={measure(e.guard, 11.5, 650) + 14}
                  height={19}
                  rx={9.5}
                  fill="var(--poney-plaster)"
                  stroke={hot ? 'var(--poney-accent)' : 'var(--poney-rule-strong)'}
                />
                <text x={e.guardAt.anchor === 'end' ? e.guardAt.x - 5 : e.guardAt.x + 5} y={e.guardAt.y + 2.5} textAnchor={e.guardAt.anchor === 'end' ? 'end' : 'start'} fontSize={11.5} fontWeight={650} fill={hot ? 'var(--poney-accent)' : 'var(--poney-ink-2)'}>
                  {e.guard}
                </text>
              </g>
            )}
          </g>
        )
      })}

      {/* Steps */}
      {scene.nodes.map((n) => {
        const dim = focus && !focus.nodes.has(n.id)
        const selected = sel('activityNode', n.id)
        const ref = { kind: 'activityNode', behavior, id: n.id } as const
        const label = `${idx.describe(ref).kind}: ${n.label}`
        const { x, y, w, h } = n
        const outcome = n.outcome === 'failure' ? 'var(--poney-failure)' : n.outcome === 'success' ? 'var(--poney-success)' : 'var(--poney-ink)'
        let body: React.ReactNode
        switch (n.kind) {
          case 'start':
            body = <circle cx={w / 2} cy={h / 2} r={w / 2} fill="var(--poney-ink)" />
            break
          case 'end':
            body = (
              <>
                <circle cx={w / 2} cy={h / 2} r={w / 2} fill="var(--poney-paper-raised)" stroke={outcome} strokeWidth={1.6} />
                <circle cx={w / 2} cy={h / 2} r={w / 2 - 5.5} fill={outcome} />
                <text x={w / 2} y={h + 17} textAnchor="middle" fontSize={12.5} fontWeight={650} fill={outcome}>
                  {n.label}
                </text>
              </>
            )
            break
          case 'fork':
          case 'join':
            body = <rect width={w} height={h} rx={3} fill="var(--poney-ink)" />
            break
          case 'decision':
          case 'merge':
            body = (
              <>
                <path className="poney-body" d={`M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`} fill="var(--poney-paper-raised)" stroke="var(--poney-ochre)" strokeWidth={1.4} strokeLinejoin="round" />
                <text x={w / 2} y={h / 2 + 4.5} textAnchor="middle" fontSize={12.5} fontWeight={650} fill="var(--poney-ink)">
                  {n.label}
                </text>
              </>
            )
            break
          default:
            body = (
              <>
                <rect className="poney-body" width={w} height={h} rx={10} fill="var(--poney-paper-raised)" stroke="var(--poney-rule-strong)" strokeWidth={1.1} />
                {n.lines.map((line, i) => (
                  <text key={i} x={w / 2} y={h / 2 + 4.5 + (i - (n.lines.length - 1) / 2) * 16} textAnchor="middle" fontSize={13} fontWeight={500} fill="var(--poney-ink)">
                    {line}
                  </text>
                ))}
              </>
            )
        }
        const pad = n.kind === 'fork' || n.kind === 'join' ? 6 : 0
        return (
          <g key={n.id} transform={`translate(${x} ${y})`} {...bind(ref, label)} className={`poney-el ${dim ? 'poney-dim' : ''}`}>
            {pad > 0 && <rect x={0} y={-pad} width={w} height={h + pad * 2} fill="transparent" />}
            {body}
            <Rings w={w} h={h} rx={n.kind === 'start' || n.kind === 'end' ? w / 2 : 10} selected={selected} />
          </g>
        )
      })}
    </g>
  )
}

function Legend() {
  return (
    <div className="poney-legend">
      <LegendShape shape="dot" tone="ink" label="Start" />
      <LegendShape shape="card" tone="slate" label="Action" />
      <LegendShape shape="diamond" tone="ochre" label="Decision: one way out per answer" />
      <LegendShape shape="bar" tone="ink" label="Split into, or join, parallel paths" />
      <LegendShape shape="bullseye" tone="success" label="End, in success" />
      <LegendShape shape="bullseye" tone="failure" label="End, in failure" />
    </div>
  )
}

export const activity: DiagramModule<View, ActivityScene> = {
  key: 'activity',
  label: 'Activity',
  icon: GitBranch,
  howToRead: 'Follow the arrows from the black dot. Each column is who does the step. Diamonds ask a question; dashed arrows go back to an earlier step.',
  Renderer,
  Legend,
}
