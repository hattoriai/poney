import { useMemo } from 'react'
import { ArrowRightLeft, Waypoints } from 'lucide-react'
import type { ViewOf } from '@poney/core'
import { clip, type DataFlowScene } from '@poney/layout'
import { useIndex, useStudio } from '@/features/store'
import { ToolbarButton } from '@/components/shared/Toolbar'
import { useBind, useSubject } from '../shared/interaction'
import { EdgeLine } from '../shared/Edge'
import { Rings } from '../shared/EntityNode'
import { Glyph } from '../shared/icons'
import { toneColor, toneWash } from '../shared/tone'
import { LegendRow, LegendShape } from '../shared/Legend'
import type { DiagramModule } from '../types'

type View = ViewOf<'dataflow'>

function Renderer({ scene }: { scene: DataFlowScene; view: View }) {
  const idx = useIndex()
  const bind = useBind()
  const { subject, selection } = useSubject()

  const focus = useMemo(() => {
    if (!subject) return null
    const nodes = new Set<string>()
    const edges = new Set<string>()
    const take = (e: DataFlowScene['edges'][number]) => {
      edges.add(e.id)
      nodes.add(e.source)
      nodes.add(e.target)
    }
    if (subject.kind === 'entity') {
      if (!scene.nodes.some((n) => n.entityId === subject.id)) return null
      nodes.add(subject.id)
      scene.edges.forEach((e) => (e.source === subject.id || e.target === subject.id) && take(e))
    } else if (subject.kind === 'dataFlow' || subject.kind === 'relationship') {
      scene.edges.forEach((e) => (e.id === subject.id || idx.dataFlows.get(e.id)?.via === subject.id) && take(e))
    } else if (subject.kind === 'dataType') scene.edges.forEach((e) => e.data.includes(subject.id) && take(e))
    else return null
    return edges.size || nodes.size ? { nodes, edges } : null
  }, [subject, scene, idx])

  const selectedEdge = selection?.kind === 'dataFlow' || selection?.kind === 'relationship' ? selection.id : undefined
  const selectedNode = selection?.kind === 'entity' ? selection.id : undefined

  return (
    <g>
      {scene.edges.map((e) => {
        const hot = focus?.edges.has(e.id)
        const selected = selectedEdge === e.id
        const ref = e.control ? ({ kind: 'relationship', id: e.id } as const) : ({ kind: 'dataFlow', id: e.id } as const)
        const color = selected || hot ? 'var(--poney)' : e.control ? 'var(--ink-4)' : 'var(--ink-2)'
        return (
          <g key={e.id} {...bind(ref, idx.describe(ref).title)} className={`dg-el ${focus && !hot ? 'dg-dim' : ''}`}>
            <EdgeLine points={e.points} style={{ color, width: e.control ? 1 : selected || hot ? 2 : 1.6, dash: e.control ? '1.5 4' : undefined, head: e.control ? 'open-arrow' : 'arrow', flowing: !e.control && (selected || hot) }} />
          </g>
        )
      })}

      {scene.nodes.map((n) => {
        const e = idx.entities.get(n.entityId)!
        const s = idx.style(e)
        const tone = toneColor(s.tone)
        const dim = focus && !focus.nodes.has(n.entityId)
        const { w, h } = n
        return (
          <g key={n.id} transform={`translate(${n.x} ${n.y})`} {...bind({ kind: 'entity', id: e.id }, `${e.name}, ${n.role}`)} className={`dg-el ${dim ? 'dg-dim' : ''}`}>
            {n.role === 'process' && <rect className="dg-body" width={w} height={h} rx={h / 2} fill="var(--paper-raised)" stroke={tone} strokeWidth={1.3} />}
            {n.role === 'terminator' && <rect className="dg-body" width={w} height={h} rx={4} fill={toneWash(s.tone, 10)} stroke={tone} strokeWidth={1.3} />}
            {n.role === 'store' && (
              <>
                <rect width={w} height={h} fill={toneWash(s.tone, 10)} />
                <line x1={0} x2={w} y1={0.5} y2={0.5} stroke={tone} strokeWidth={1.5} />
                <line x1={0} x2={w} y1={h - 0.5} y2={h - 0.5} stroke={tone} strokeWidth={1.5} />
                <line x1={34} x2={34} y1={0} y2={h} stroke={tone} strokeWidth={1} />
              </>
            )}
            <Glyph name={s.icon} x={n.role === 'store' ? 9 : n.role === 'process' ? 20 : 14} y={h / 2 - 8} size={16} color={tone} />
            <text x={n.role === 'store' ? 46 : n.role === 'process' ? 44 : 38} y={h / 2 + (n.role === 'store' ? 4.5 : -1)} fontSize={13.5} fontWeight={650} fill="var(--ink)">
              {clip(e.name, w - 60, 13.5, 650)}
            </text>
            {n.role !== 'store' && (
              <text x={n.role === 'process' ? 44 : 38} y={h / 2 + 15} fontSize={11.5} fill="var(--ink-3)">
                {n.role === 'process' ? 'Process' : s.label}
              </text>
            )}
            <Rings w={w} h={h} rx={n.role === 'process' ? h / 2 : 4} selected={selectedNode === e.id} />
          </g>
        )
      })}

      {scene.edges.map((e) => {
        if (!e.label) return null
        const hot = focus?.edges.has(e.id) || selectedEdge === e.id
        const { x, y, w, h } = e.label
        return (
          <g key={`l-${e.id}`} transform={`translate(${x} ${y})`} className={focus && !hot ? 'dg-dim' : ''} pointerEvents="none">
            <rect width={w} height={h} rx={h / 2} fill="var(--paper-raised)" stroke={hot ? 'var(--poney)' : 'var(--rule-strong)'} />
            <circle cx={11} cy={h / 2} r={3} fill={hot ? 'var(--poney)' : 'var(--malachite)'} />
            <text x={19} y={h / 2 + 4} fontSize={11.5} fontWeight={hot ? 650 : 500} fill={hot ? 'var(--poney)' : 'var(--ink-2)'}>
              {e.label.text}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function Tools({ view }: { view: View }) {
  const ui = useStudio((s) => s.viewUi[view.id])
  const update = useStudio((s) => s.updateViewUi)
  const on = ui?.controlFlow ?? view.showControlFlow
  return (
    <ToolbarButton label={on ? 'Hide calls that carry no data' : 'Show calls that carry no data'} onClick={() => update(view.id, { controlFlow: !on })} active={on}>
      <ArrowRightLeft size={15} />
    </ToolbarButton>
  )
}

function Legend() {
  return (
    <div className="space-y-1.5">
      <LegendShape shape="card" tone="umber" label="Outside the system: people and providers" />
      <LegendShape shape="pill" tone="lapis" label="Process: code that changes data" />
      <LegendShape shape="store" tone="malachite" label="Store: where data rests" />
      <LegendRow line="solid" label="Data moving, with what it carries" color="var(--ink-2)" />
      <LegendRow line="dotted" label="Control only: a call with no data shown" color="var(--ink-4)" />
    </div>
  )
}

export const dataflow: DiagramModule<View, DataFlowScene> = {
  key: 'dataflow',
  label: 'Data flow',
  icon: Waypoints,
  howToRead: 'Arrows follow the data, not the calls: each one says what moves and in which direction. Select a flow to see its fields.',
  Renderer,
  Tools,
  Legend,
}
