/** @jsxRuntime automatic @jsxImportSource react */
import { useMemo } from 'react'
import { Blocks } from 'lucide-react'
import type { ViewOf } from '@poney/core'
import { clip, type DependencyScene } from '@poney/layout'
import { ArrowHead } from '../shared/Edge'
import { EntityNode, Rings, useReadableSize } from '../shared/EntityNode'
import { LegendRow } from '../shared/Legend'
import type { DiagramModule } from '../types'
import { useRenderBind, useRenderIndex, useRenderSubject, useViewState } from '../../render'

type View = ViewOf<'dependency'>

const DOWN = 'var(--lapis)' // what the subject depends on
const UP = 'var(--ochre)' // what depends on the subject

function Renderer({ scene, view }: { scene: DependencyScene; view: View }) {
  const idx = useRenderIndex()
  const bind = useRenderBind()
  const { subject, selection } = useRenderSubject()
  const transitive = useViewState(view.id)[0].transitive ?? false
  const relStyles = idx.doc.presentation.relationships
  const bandSize = useReadableSize(13, 11, 22)

  const focus = useMemo(() => {
    if (!subject) return null
    const deps = new Set<string>()
    const users = new Set<string>()
    const depEdges = new Set<string>()
    const userEdges = new Set<string>()
    if (subject.kind === 'entity' && scene.nodes.some((n) => n.entityId === subject.id)) {
      const walk = (id: string, forward: boolean) => {
        for (const e of scene.edges) {
          const from = forward ? e.source : e.target
          const to = forward ? e.target : e.source
          if (from !== id) continue
          ;(forward ? depEdges : userEdges).add(e.id)
          const set = forward ? deps : users
          if (set.has(to) || to === subject.id) continue
          set.add(to)
          if (transitive) walk(to, forward)
        }
      }
      walk(subject.id, true)
      walk(subject.id, false)
      return { node: subject.id, deps, users, depEdges, userEdges, group: null as string | null }
    }
    if (subject.kind === 'relationship') {
      const e = scene.edges.find((x) => x.id === subject.id)
      if (!e) return null
      depEdges.add(e.id)
      deps.add(e.target)
      users.add(e.source)
      return { node: null, deps, users, depEdges, userEdges, group: null }
    }
    if (subject.kind === 'group' && subject.view === view.id) {
      const band = scene.bands.findIndex((b) => b.id === subject.id)
      scene.nodes.forEach((n) => n.band === band && deps.add(n.entityId))
      return { node: null, deps, users, depEdges, userEdges, group: subject.id }
    }
    return null
  }, [subject, scene, transitive, view.id])

  const nodeColor = (id: string) => (focus?.deps.has(id) ? DOWN : focus?.users.has(id) ? UP : undefined)

  return (
    <g>
      {scene.bands.map((b, i) => {
        const selected = selection?.kind === 'group' && selection.id === b.id
        return (
          <g key={b.id}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={i % 2 ? 'var(--paper)' : 'transparent'} fillOpacity={0.55} />
            {i > 0 && <line x1={b.x} x2={b.x + b.w} y1={b.y} y2={b.y} stroke="var(--rule)" />}
            <g {...bind({ kind: 'group', view: view.id, id: b.id }, `Layer ${b.label}`)}>
              <rect x={12} y={b.y + 12} width={148} height={b.h - 24} rx={10} fill={selected ? 'var(--poney-wash)' : 'transparent'} />
              <text x={24} y={b.y + b.h / 2 - (b.description && bandSize === 13 ? 4 : -4)} fontSize={bandSize} fontWeight={650} fill={selected ? 'var(--poney)' : 'var(--ink-2)'}>
                {b.label}
              </text>
              {b.description && bandSize === 13 && (
                <text x={24} y={b.y + b.h / 2 + 13} fontSize={11} fill="var(--ink-3)">
                  {clip(b.description, 136, 11)}
                </text>
              )}
            </g>
          </g>
        )
      })}

      {scene.edges.map((e) => {
        const ls = relStyles[e.kind] ?? { pattern: 'solid', head: 'arrow' }
        const down = focus?.depEdges.has(e.id)
        const up = focus?.userEdges.has(e.id)
        const groupHot = focus?.group && (focus.deps.has(e.source) || focus.deps.has(e.target))
        const color = down ? DOWN : up ? UP : groupHot ? 'var(--ink-2)' : 'var(--ink-4)'
        const [p0, c1, c2, p3] = e.d
        const angle = Math.atan2(p3.y - c2.y, p3.x - c2.x)
        const back = ls.head === 'triangle' ? 10 : 6
        const end = { x: p3.x - Math.cos(angle) * back, y: p3.y - Math.sin(angle) * back }
        const dim = focus && !down && !up && !groupHot
        const rel = idx.relationships.get(e.id)
        return (
          <g key={e.id} {...bind({ kind: 'relationship', id: e.id }, `${idx.entities.get(e.source)?.name} ${rel?.kind === 'implements' ? 'implements' : 'depends on'} ${idx.entities.get(e.target)?.name}`)} className={`dg-el ${dim ? 'dg-dim' : ''}`}>
            <path d={`M ${p0.x} ${p0.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p3.x} ${p3.y}`} fill="none" stroke="transparent" strokeWidth={12} />
            <path
              d={`M ${p0.x} ${p0.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`}
              fill="none"
              stroke={color}
              strokeWidth={down || up ? 1.9 : 1.2}
              strokeDasharray={ls.pattern === 'dashed' ? '5 4' : undefined}
              className="dg-edge-path"
            />
            <ArrowHead at={p3} angle={angle} kind={ls.head as 'arrow'} color={color} />
          </g>
        )
      })}

      {scene.nodes.map((n) => {
        const e = idx.entities.get(n.entityId)!
        const s = idx.style(e)
        const isSubject = focus?.node === n.entityId
        const tint = nodeColor(n.entityId)
        const dim = focus && !isSubject && !tint
        const selected = selection?.kind === 'entity' && selection.id === e.id
        return (
          <g key={n.entityId} transform={`translate(${n.x} ${n.y})`} {...bind({ kind: 'entity', id: e.id }, `${e.name}, ${s.label}`)} className={`dg-el ${dim ? 'dg-dim' : ''}`}>
            <EntityNode entity={e} style={{ ...s, shape: 'chip' }} w={n.w} h={n.h} emphasis={selected ? 'selected' : 'normal'} detail={false} />
            {tint && !selected && <rect x={-2} y={-2} width={n.w + 4} height={n.h + 4} rx={12} fill="none" stroke={tint} strokeWidth={1.6} />}
            <Rings w={n.w} h={n.h} rx={10} selected={false} />
          </g>
        )
      })}
    </g>
  )
}

function Legend() {
  return (
    <div className="space-y-1.5">
      <LegendRow line="solid" label="Depends on" color="var(--ink-3)" />
      <LegendRow line="dashed" label="Implements, or sends events to" color="var(--ink-3)" />
      <LegendRow line="solid" label="When selected: what it needs" color={DOWN} />
      <LegendRow line="solid" label="When selected: what needs it" color={UP} />
      <p className="pt-1 text-[12px] text-ink-3">Arrows should point down. An arrow that points up is a dependency turned around on purpose, such as an adapter that implements a domain interface.</p>
    </div>
  )
}

export const dependency: DiagramModule<View, DependencyScene> = {
  key: 'dependency',
  label: 'Dependencies',
  icon: Blocks,
  howToRead: 'Layers run from the outside in, top to bottom. Select a part: blue shows what it needs, amber shows what needs it. Turn on “follow all the way” to see the full chain.',
  Renderer,
  Legend,
}
