import { useMemo } from 'react'
import { UsersRound } from 'lucide-react'
import type { ViewOf } from '@poney/core'
import { clip, type UseCaseScene } from '@poney/layout'
import { useIndex } from '@/features/store'
import { useZoom } from '@/components/canvas/Canvas'
import { useBind, useSubject } from '../shared/interaction'
import { ArrowHead } from '../shared/Edge'
import { EntityNode, Rings } from '../shared/EntityNode'
import { LegendRow, LegendShape } from '../shared/Legend'
import type { DiagramModule } from '../types'

type View = ViewOf<'usecase'>

function Renderer({ scene }: { scene: UseCaseScene; view: View }) {
  const idx = useIndex()
  const bind = useBind()
  const zoom = useZoom()
  const { subject, selection } = useSubject()

  const focus = useMemo(() => {
    if (!subject) return null
    const actors = new Set<string>()
    const caps = new Set<string>()
    if (subject.kind === 'entity' && scene.actors.some((a) => a.entityId === subject.id)) {
      actors.add(subject.id)
      scene.associations.forEach((a) => a.actor === subject.id && caps.add(a.capability))
    } else if (subject.kind === 'capability' && scene.capabilities.some((c) => c.id === subject.id)) {
      caps.add(subject.id)
      scene.associations.forEach((a) => a.capability === subject.id && actors.add(a.actor))
      scene.includes.forEach((i) => i.from === subject.id && caps.add(i.to))
    } else return null
    return { actors, caps }
  }, [subject, scene])

  const hotAssoc = (a: UseCaseScene['associations'][number]) =>
    !!focus && focus.caps.has(a.capability) && focus.actors.has(a.actor)

  return (
    <g>
      <rect x={scene.boundary.x} y={scene.boundary.y} width={scene.boundary.w} height={scene.boundary.h} rx={22} fill="var(--paper)" fillOpacity={0.6} stroke="var(--rule-strong)" />
      <text x={scene.boundary.x + 20} y={scene.boundary.y + 30} fontSize={13} fontWeight={650} fill="var(--ink-2)">
        {scene.boundary.title}
      </text>
      {scene.areas.map((a, i) => (
        <g key={a.label}>
          {i > 0 && <line x1={a.x} x2={a.x + a.w} y1={a.y - 7} y2={a.y - 7} stroke="var(--rule)" />}
          <text x={a.x + 4} y={a.y + 18} fontSize={12} fontWeight={650} fill="var(--ink-3)">
            {a.label}
          </text>
        </g>
      ))}

      {scene.associations.map((a) => {
        const hot = hotAssoc(a)
        const mx = (a.from.x + a.to.x) / 2
        return (
          <path
            key={a.id}
            d={`M ${a.from.x} ${a.from.y} C ${mx} ${a.from.y} ${mx} ${a.to.y} ${a.to.x} ${a.to.y}`}
            fill="none"
            stroke={hot ? 'var(--poney)' : 'var(--ink-4)'}
            strokeWidth={hot ? 1.8 : 1.1}
            strokeDasharray={a.side === 'right' ? '5 4' : undefined}
            className={`dg-edge-path ${focus && !hot ? 'dg-dim' : ''}`}
          />
        )
      })}

      {scene.includes.map((i) => {
        const hot = focus?.caps.has(i.from) && focus.caps.has(i.to)
        const color = hot ? 'var(--poney)' : 'var(--ink-3)'
        const d = `M ${i.a.x} ${i.a.y} C ${i.a.x + 48} ${i.a.y + 6} ${i.b.x + 48} ${i.b.y - 6} ${i.b.x + 4} ${i.b.y - 1}`
        return (
          <g key={i.id} className={focus && !hot ? 'dg-dim' : ''}>
            <path d={d} fill="none" stroke={color} strokeDasharray="4 3" strokeWidth={1.2} />
            <ArrowHead at={{ x: i.b.x + 2, y: i.b.y }} angle={Math.PI * 0.62} kind="open-arrow" color={color} />
            <text x={i.a.x + 44} y={(i.a.y + i.b.y) / 2 + 4} fontSize={11} fontStyle="italic" fill={color}>
              includes
            </text>
          </g>
        )
      })}

      {scene.capabilities.map((c) => {
        const cap = idx.capabilities.get(c.id)!
        const dim = focus && !focus.caps.has(c.id)
        const selected = selection?.kind === 'capability' && selection.id === c.id
        return (
          <g key={c.id} transform={`translate(${c.x} ${c.y})`} {...bind({ kind: 'capability', id: c.id }, `${cap.name}. ${cap.summary}`)} className={`dg-el ${dim ? 'dg-dim' : ''}`}>
            <rect className="dg-body" width={c.w} height={c.h} rx={c.h / 2} fill="var(--paper-raised)" stroke={focus?.caps.has(c.id) ? 'var(--tyrian)' : 'var(--rule-strong)'} strokeWidth={1.2} />
            <text x={c.w / 2} y={c.h / 2 + 5} textAnchor="middle" fontSize={13.5} fontWeight={600} fill="var(--ink)">
              {clip(cap.name, c.w - 32, 13.5, 600)}
            </text>
            <Rings w={c.w} h={c.h} rx={c.h / 2} selected={selected} />
          </g>
        )
      })}

      {scene.actors.map((a) => {
        const e = idx.entities.get(a.entityId)!
        const s = idx.style(e)
        const dim = focus && !focus.actors.has(a.entityId)
        const selected = selection?.kind === 'entity' && selection.id === e.id
        const count = scene.associations.filter((x) => x.actor === e.id).length
        return (
          <g key={a.entityId} transform={`translate(${a.x} ${a.y})`} {...bind({ kind: 'entity', id: e.id }, `${e.name}: ${count} things they can do`)} className={`dg-el ${dim ? 'dg-dim' : ''}`}>
            <EntityNode entity={e} style={s.shape === 'person' ? s : { ...s, shape: 'card' }} w={a.w} h={a.h} emphasis={selected ? 'selected' : 'normal'} detail={false} />
            {zoom > 0.5 && (
              <text x={a.w / 2} y={a.h + 16} textAnchor="middle" fontSize={11.5} fill="var(--ink-3)">
                {a.side === 'left' ? `Can do ${count} thing${count === 1 ? '' : 's'}` : `Supports ${count}`}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

function Legend() {
  return (
    <div className="space-y-1.5">
      <LegendShape shape="person" tone="slate" label="Person who uses the system" />
      <LegendShape shape="card" tone="umber" label="Outside system that helps" dashed />
      <LegendShape shape="pill" tone="tyrian" label="Something a person can do" />
      <LegendRow line="solid" label="Does it" head={false} />
      <LegendRow line="dashed" label="Helps with it" head={false} />
    </div>
  )
}

export const usecase: DiagramModule<View, UseCaseScene> = {
  key: 'usecase',
  label: 'Use cases',
  icon: UsersRound,
  howToRead: 'People on the left, the things they can do in the middle, outside services that help on the right. Select a person to see everything they can do.',
  Renderer,
  Legend,
}
