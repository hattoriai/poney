/** @jsxRuntime automatic @jsxImportSource react */
import { useMemo } from 'react'
import { ChevronsDownUp, ChevronsUpDown, Network } from 'lucide-react'
import type { ViewOf } from '@hattoriai/poney-core'
import { clip, labelPoint, type ArchitectureScene, type ArchitectureSceneNode } from '@hattoriai/poney-layout'
import { EdgeLabel, EdgeLine, type Head } from '../shared/Edge'
import { EntityNode, Rings, useReadableSize } from '../shared/EntityNode'
import { Glyph } from '../shared/icons'
import { toneColor } from '../shared/tone'
import type { DiagramModule } from '../types'
import { LegendRow, LegendShape } from '../shared/Legend'
import { useRenderBind, useRenderIndex, useRenderStill, useRenderSubject, useRenderZoom, useViewState } from '../../render'

type View = ViewOf<'architecture'>

function useCollapsed(view: View) {
  const [ui, update] = useViewState(view.id)
  const collapsed = ui.collapsed ?? view.collapsed
  const toggle = (id: string) => update({ collapsed: collapsed.includes(id) ? collapsed.filter((c) => c !== id) : [...collapsed, id] })
  return { collapsed, toggle }
}

/** A small open/close button drawn inside a node. */
function Toggle({ x, y, open, label, onToggle }: { x: number; y: number; open: boolean; label: string; onToggle: () => void }) {
  if (useRenderStill()) return null
  return (
    <g
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={0}
      aria-label={`${open ? 'Close' : 'Open'} ${label}`}
      aria-expanded={open}
      className="poney-control"
      data-ref="toggle"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onToggle()
        }
      }}
    >
      <rect width={26} height={26} rx={7} fill="var(--poney-paper-raised)" stroke="var(--poney-rule-strong)" />
      <g transform="translate(5 5)" color="var(--poney-ink-2)">
        {open ? <ChevronsDownUp width={16} height={16} strokeWidth={1.8} /> : <ChevronsUpDown width={16} height={16} strokeWidth={1.8} />}
      </g>
      <rect className="poney-focus" x={-3} y={-3} width={32} height={32} rx={9} fill="none" stroke="var(--poney-accent)" strokeWidth={2} />
    </g>
  )
}

function Renderer({ scene, view }: { scene: ArchitectureScene; view: View }) {
  const idx = useRenderIndex()
  const bind = useRenderBind()
  const zoom = useRenderZoom()
  const { subject, selection } = useRenderSubject()
  const { toggle } = useCollapsed(view)
  const relStyles = idx.doc.presentation.relationships
  const groupSize = useReadableSize(12.5, 11, 26)
  const systemSize = useReadableSize(15, 12, 32)
  const labelSize = useReadableSize(11.5, 10.5, 26)

  // Resolve the subject to scene ids: nodes and edges to emphasize.
  const focus = useMemo(() => {
    if (!subject) return null
    const nodes = new Set<string>()
    const edges = new Set<string>()
    const byId = new Map(scene.nodes.map((n) => [n.id, n]))
    const descendants = (id: string) => scene.nodes.filter((n) => isInside(n, id, byId)).forEach((n) => nodes.add(n.id))
    const nodeFor = (entityId: string) => scene.nodes.find((n) => n.entityId === entityId)?.id ?? repOf(entityId)
    const repOf = (entityId: string) => {
      const a = scene.anchors[`entity:${entityId}`]
      return a ? scene.nodes.find((n) => n.x === a.x && n.y === a.y && n.w === a.w && n.h === a.h)?.id : undefined
    }
    if (subject.kind === 'entity') {
      const id = nodeFor(subject.id)
      if (!id) return null
      nodes.add(id)
      descendants(id)
      const own = new Set(nodes)
      for (const e of scene.edges)
        if (own.has(e.source) || own.has(e.target)) {
          edges.add(e.id)
          nodes.add(e.source)
          nodes.add(e.target)
        }
    } else if (subject.kind === 'relationship') {
      const e = scene.edges.find((x) => x.relationships.includes(subject.id))
      if (!e) return null
      edges.add(e.id)
      nodes.add(e.source)
      nodes.add(e.target)
    } else if (subject.kind === 'group' && subject.view === view.id) {
      const id = `g:${subject.id}`
      nodes.add(id)
      descendants(id)
      const own = new Set(nodes)
      for (const e of scene.edges) if (own.has(e.source) || own.has(e.target)) edges.add(e.id)
    } else return null
    return { nodes, edges }
  }, [subject, scene, view.id])

  const selectedNode = selection?.kind === 'entity' ? scene.nodes.find((n) => n.entityId === selection.id)?.id : selection?.kind === 'group' ? `g:${selection.id}` : undefined
  const selectedEdge = selection?.kind === 'relationship' ? scene.edges.find((e) => e.relationships.includes(selection.id))?.id : undefined
  const dimNode = (n: ArchitectureSceneNode) => !!focus && !n.compound && !focus.nodes.has(n.id)
  const containers = scene.nodes.filter((n) => n.compound)
  const leaves = scene.nodes.filter((n) => !n.compound)

  return (
    <g>
      {/* Containers and groups */}
      {containers.map((n) => {
        if (n.type === 'group') {
          const g = view.groups.find((x) => x.id === n.groupId)!
          return (
            <g key={n.id} transform={`translate(${n.x} ${n.y})`} {...bind({ kind: 'group', view: view.id, id: g.id }, `Group ${g.label}`)}>
              <rect width={n.w} height={n.h} rx={14} fill="var(--poney-plaster)" fillOpacity={0.55} stroke="var(--poney-rule-strong)" strokeDasharray="5 4" />
              <text x={16} y={12 + groupSize} fontSize={groupSize} fontWeight={600} fill="var(--poney-ink-2)">
                {g.label}
              </text>
              <Toggle x={n.w - 36} y={7} open label={g.label} onToggle={() => toggle(g.id)} />
              <Rings w={n.w} h={n.h} rx={14} selected={selectedNode === n.id} />
            </g>
          )
        }
        const e = idx.entities.get(n.entityId!)!
        const s = idx.style(e, view.id)
        return (
          <g key={n.id} transform={`translate(${n.x} ${n.y})`} {...bind({ kind: 'entity', id: e.id }, `${e.name}, ${s.label}, contains ${n.hiddenCount || 'several'} parts`)}>
            <rect width={n.w} height={n.h} rx={18} fill={`color-mix(in srgb, ${toneColor(s.tone)} 4%, var(--poney-paper))`} stroke="var(--poney-rule-strong)" strokeWidth={1.25} />
            <Glyph name={s.icon} x={20} y={18} size={18} color={toneColor(s.tone)} />
            <text x={46} y={systemSize > 15 ? 16 + systemSize : 32} fontSize={systemSize} fontWeight={650} fill="var(--poney-ink)">
              {e.name}
            </text>
            {systemSize === 15 && (
              <text x={20} y={48} fontSize={12} fill="var(--poney-ink-3)">
                {clip(e.summary, n.w - 80, 12)}
              </text>
            )}
            <Toggle x={n.w - 40} y={12} open label={e.name} onToggle={() => toggle(e.id)} />
            <Rings w={n.w} h={n.h} rx={18} selected={selectedNode === n.id} />
          </g>
        )
      })}

      {/* Edges */}
      {scene.edges.map((edge) => {
        const rel = idx.relationships.get(edge.relationships[0])!
        const ls = relStyles[rel.kind] ?? { pattern: 'solid', head: 'arrow' }
        const hot = focus?.edges.has(edge.id)
        const selected = selectedEdge === edge.id
        const color = hot || selected ? 'var(--poney-accent)' : 'var(--poney-ink-4)'
        const label = edge.relationships.length > 1 ? `${edge.relationships.length} connections` : rel.label
        return (
          <g
            key={edge.id}
            {...bind({ kind: 'relationship', id: edge.relationships[0] }, `${idx.describe({ kind: 'relationship', id: rel.id }).title}: ${label}`)}
            className={`poney-el ${focus && !hot ? 'poney-dim' : ''}`}
          >
            <EdgeLine
              points={edge.points}
              style={{
                color,
                width: hot || selected ? 1.9 : 1.3,
                dash: ls.pattern === 'dashed' ? '6 4' : ls.pattern === 'dotted' ? '1.5 4' : undefined,
                head: ls.head as Head,
                flowing: selected && (rel.kind === 'publishes' || rel.kind === 'subscribes'),
              }}
            />
          </g>
        )
      })}

      {/* Nodes */}
      {leaves.map((n) => {
        if (n.type === 'group') {
          const g = view.groups.find((x) => x.id === n.groupId)!
          return (
            <g key={n.id} transform={`translate(${n.x} ${n.y})`} {...bind({ kind: 'group', view: view.id, id: g.id }, `Group ${g.label}, closed`)} className={`poney-el ${dimNode(n) ? 'poney-dim' : ''}`}>
              <rect x={6} y={-6} width={n.w} height={n.h} rx={12} fill="var(--poney-paper)" stroke="var(--poney-rule-strong)" />
              <rect width={n.w} height={n.h} rx={12} fill="var(--poney-paper-raised)" stroke="var(--poney-rule-strong)" strokeDasharray="5 4" />
              <text x={16} y={30} fontSize={14} fontWeight={650} fill="var(--poney-ink)">
                {g.label}
              </text>
              <text x={16} y={50} fontSize={12} fill="var(--poney-ink-3)">
                {n.hiddenCount} parts inside
              </text>
              {g.description && zoom > 0.55 && (
                <text x={16} y={74} fontSize={12} fill="var(--poney-ink-2)">
                  {clip(g.description, n.w - 32, 12)}
                </text>
              )}
              <Toggle x={n.w - 36} y={10} open={false} label={g.label} onToggle={() => toggle(g.id)} />
              <Rings w={n.w} h={n.h} selected={selectedNode === n.id} />
            </g>
          )
        }
        const e = idx.entities.get(n.entityId!)!
        const s = idx.style(e, view.id)
        const style = n.collapsed ? { ...s, shape: 'frame' as const } : s
        return (
          <g key={n.id} transform={`translate(${n.x} ${n.y})`} {...bind({ kind: 'entity', id: e.id }, `${e.name}, ${s.label}. ${e.summary}`)} className={`poney-el ${dimNode(n) ? 'poney-dim' : ''}`}>
            <EntityNode
              entity={e}
              style={style}
              w={n.w}
              h={n.h}
              emphasis={selectedNode === n.id ? 'selected' : 'normal'}
              detail={zoom > 0.55}
              footer={n.collapsed ? `${n.hiddenCount} parts inside` : undefined}
            />
            {n.collapsed && <Toggle x={n.w - 40} y={12} open={false} label={e.name} onToggle={() => toggle(e.id)} />}
          </g>
        )
      })}

      {/* Labels of emphasized edges, on top of everything */}
      {scene.edges
        .filter((e) => focus?.edges.has(e.id) || selectedEdge === e.id)
        .map((edge) => {
          const rel = idx.relationships.get(edge.relationships[0])!
          const multiple = edge.relationships.length > 1
          return (
            <EdgeLabel
              key={`l-${edge.id}`}
              at={labelPoint(edge.points)}
              text={multiple ? `${edge.relationships.length} connections` : rel.label}
              secondary={multiple ? undefined : rel.protocol}
              tone="var(--poney-accent)"
              strong={selectedEdge === edge.id}
              size={labelSize}
            />
          )
        })}
    </g>
  )
}

function isInside(n: ArchitectureSceneNode, ancestor: string, byId: Map<string, ArchitectureSceneNode>): boolean {
  let p = n.parent
  while (p) {
    if (p === ancestor) return true
    p = byId.get(p)?.parent
  }
  return false
}

function Legend({ view }: { view: View }) {
  const idx = useRenderIndex()
  const kinds = [...new Set(view.entities.map((id) => idx.entities.get(id)?.kind).filter(Boolean))] as string[]
  return (
    <div className="poney-legend">
      {kinds.map((k) => {
        const s = idx.doc.presentation.kinds[k]
        return s ? <LegendShape key={k} shape={s.shape} tone={s.tone} label={s.label} dashed={k === 'external'} /> : null
      })}
      <LegendRow line="solid" label="Request and response" />
      <LegendRow line="dashed" label="Event, sent and forgotten" />
    </div>
  )
}

export const architecture: DiagramModule<View, ArchitectureScene> = {
  key: 'architecture',
  label: 'Architecture',
  icon: Network,
  howToRead:
    'Boxes are the running parts of the system; lines show who calls whom. Select a part to see what it talks to. Open or close a group with its corner button.',
  Renderer,
  Legend,
}
