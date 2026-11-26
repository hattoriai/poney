/** @jsxRuntime automatic @jsxImportSource react */
import type { Entity } from '@poney/core'
import { clip, measure, type MapScene } from '@poney/layout'
import { useRenderBind as useBind, useRenderIndex as useIndex } from './render'
import { Glyph } from './icons'
import { toneColor } from './tone'
import { CalloutBadge, Head, lookClass, StateTag, stateFill, stateStroke, useLook, useLookAny, useStory } from './context'

/** Draws a map scene in the crisp story style. */
export function MapStory({ scene, extra = [] }: { scene: MapScene; extra?: Entity[] }) {
  const idx = useIndex()
  const extraById = new Map(extra.map((e) => [e.id, e]))
  const entityOf = (id: string) => idx.entities.get(id) ?? extraById.get(id)
  return (
    <g>
      {(scene.groups ?? []).map((g) => {
        const e = entityOf(g.entityId)
        return e ? <MapGroup key={g.entityId} group={g} entity={e} /> : null
      })}
      {scene.edges.map((e) => (
        <MapEdge key={e.id} edge={e} />
      ))}
      {scene.nodes.map((n) => {
        const e = entityOf(n.entityId)
        return e ? <MapNode key={n.entityId} node={n} entity={e} /> : null
      })}
      {scene.edges.map((e) => (
        <EdgeLabel key={`l-${e.id}`} edge={e} />
      ))}
      {[...(scene.groups ?? []), ...scene.nodes].map((n) => (
        <NodeCallout key={`c-${n.entityId}`} node={n} />
      ))}
      {scene.edges.map((e) => (
        <EdgeCallout key={`ec-${e.id}`} edge={e} />
      ))}
      {scene.nodes
        .filter((n) => n.members?.length)
        .map((n) => (
          <GroupPeek key={`p-${n.entityId}`} node={n} names={n.members!.map((m) => entityOf(m)?.name ?? m)} />
        ))}
    </g>
  )
}

/** Hovering a closed group shows what is inside it, without opening it. */
function GroupPeek({ node, names }: { node: MapScene['nodes'][number]; names: string[] }) {
  const { hot } = useStory()
  if (hot !== `entity:${node.entityId}`) return null
  const shown = names.slice(0, 6)
  const more = names.length - shown.length
  const rows = [...shown, ...(more > 0 ? [`and ${more} more`] : [])]
  const w = Math.max(node.w, Math.max(...rows.map((r) => measure(r, 12.5, 500))) + 40)
  const h = rows.length * 22 + 38
  const x = node.x + node.w / 2 - w / 2
  const y = node.y + node.h + 12
  return (
    <g pointerEvents="none" transform={`translate(${x} ${y})`}>
      <rect width={w} height={h} rx={12} fill="var(--paper-raised)" stroke="var(--story-rule)" />
      <text x={16} y={22} fontSize={11.5} fontWeight={600} fill="var(--ink-3)">
        Inside
      </text>
      {rows.map((r, i) => (
        <text key={i} x={16} y={44 + i * 22} fontSize={12.5} fontWeight={i < shown.length ? 500 : 400} fill={i < shown.length ? 'var(--ink)' : 'var(--ink-3)'}>
          {r}
        </text>
      ))}
    </g>
  )
}

function MapNode({ node, entity }: { node: MapScene['nodes'][number]; entity: Entity }) {
  const idx = useIndex()
  const bind = useBind()
  const key = `entity:${entity.id}`
  const members = node.members ?? []
  const look = useLookAny([key, ...members.map((m) => `entity:${m}`)])
  const style = idx.style(entity)
  const { setHot, toggleGroup } = useStory()
  const { x, y, w, h } = node
  const stroke = look.hot ? 'var(--poney)' : stateStroke(look.state, look.focused ? 'var(--story-line)' : 'var(--story-rule)')
  const removed = look.state === 'removed'
  const sub = members.length ? `${members.length} inside${entity.technology ? ` · ${entity.technology}` : ''}` : entity.technology ?? style.label
  const props = bind({ kind: 'entity', id: entity.id }, `${entity.name}. ${entity.summary}`)
  return (
    <g
      transform={`translate(${x} ${y})`}
      {...props}
      className={`dg-el ${lookClass(look)}`}
      onMouseEnter={() => {
        props.onMouseEnter?.()
        setHot(key)
      }}
      onMouseLeave={() => {
        props.onMouseLeave?.()
        setHot(null)
      }}
    >
      {members.length > 0 && <rect x={5} y={5} width={w} height={h} rx={14} fill="var(--story-node)" stroke="var(--story-rule)" strokeWidth={1.2} />}
      <rect width={w} height={h} rx={14} fill={stateFill(look.state)} stroke={stroke} strokeWidth={look.state || look.hot ? 1.75 : 1.2} strokeDasharray={removed || entity.kind === 'external' ? '6 4' : undefined} />
      {members.length > 0 && toggleGroup && <GroupToggle open={false} name={entity.name} x={w - 22} y={h / 2} onToggle={() => toggleGroup(entity.id)} />}
      <Glyph name={style.icon} x={18} y={h / 2 - 9} size={18} color={look.state ? `var(--${look.state})` : toneColor(style.tone)} />
      <text x={48} y={h / 2 - 2} fontSize={15} fontWeight={600} fill="var(--ink)" textDecoration={removed ? 'line-through' : undefined}>
        {clip(entity.name, w - (members.length && toggleGroup ? 92 : 60), 15, 600)}
      </text>
      <text x={48} y={h / 2 + 17} fontSize={12.5} fill="var(--ink-3)">
        {clip(sub, w - (members.length && toggleGroup ? 92 : 60), 12.5)}
      </text>
      <StateTag state={look.state} x={w - 12} y={0} anchor="end" />
      <rect className="dg-focus" x={-5} y={-5} width={w + 10} height={h + 10} rx={18} fill="none" stroke="var(--poney)" strokeWidth={2} strokeDasharray="4 3" />
    </g>
  )
}

/** An open group: a quiet frame with its name at the top, around what it holds. */
function MapGroup({ group, entity }: { group: NonNullable<MapScene['groups']>[number]; entity: Entity }) {
  const idx = useIndex()
  const bind = useBind()
  const key = `entity:${entity.id}`
  const look = useLook(key)
  // A group stays bright while anything inside it is in focus.
  const inside = useLookAny(group.members.map((m) => `entity:${m}`))
  const { setHot, toggleGroup } = useStory()
  const style = idx.style(entity)
  const { x, y, w, h } = group
  const props = bind({ kind: 'entity', id: entity.id }, `${entity.name}. ${entity.summary}`)
  const stroke = look.hot ? 'var(--poney)' : stateStroke(look.state, 'var(--story-rule)')
  const sub = entity.technology ?? style.label
  return (
    <g transform={`translate(${x} ${y})`} className={`dg-el ${lookClass({ ...look, dim: look.dim && inside.dim })}`}>
      <rect width={w} height={h} rx={18} fill={look.state ? `var(--${look.state}-wash)` : 'var(--sunken)'} fillOpacity={look.state ? 0.55 : 0.45} stroke={stroke} strokeWidth={look.state || look.hot ? 1.6 : 1.1} />
      <g
        {...props}
        onMouseEnter={() => {
          props.onMouseEnter?.()
          setHot(key)
        }}
        onMouseLeave={() => {
          props.onMouseLeave?.()
          setHot(null)
        }}
      >
        <rect width={w} height={44} rx={18} fill="transparent" />
        <Glyph name={style.icon} x={16} y={14} size={16} color={look.state ? `var(--${look.state})` : toneColor(style.tone)} />
        <text x={40} y={27} fontSize={14} fontWeight={600} fill="var(--ink)">
          {clip(entity.name, w - (toggleGroup ? 150 : 110), 14, 600)}
        </text>
        <text x={40 + Math.min(measureName(entity.name), w - (toggleGroup ? 150 : 110)) + 10} y={27} fontSize={12} fill="var(--ink-3)">
          {clip(sub, Math.max(0, w - 40 - measureName(entity.name) - (toggleGroup ? 56 : 24)), 12)}
        </text>
      </g>
      <StateTag state={look.state} x={w - (toggleGroup ? 44 : 14)} y={22} anchor="end" />
      {toggleGroup && <GroupToggle open name={entity.name} x={w - 24} y={22} onToggle={() => toggleGroup(entity.id)} />}
    </g>
  )
}

const measureName = (name: string) => measure(name, 14, 600)

/** The small round button that opens or closes a group. */
function GroupToggle({ open, name, x, y, onToggle }: { open: boolean; name: string; x: number; y: number; onToggle(): void }) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${open ? 'Close' : 'Open'} ${name}`}
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
    >
      <title>{open ? `Close ${name}` : `Open ${name}`}</title>
      <circle cx={x} cy={y} r={11} fill="var(--paper-raised)" stroke="var(--story-line)" strokeWidth={1.1} />
      <line x1={x - 4.5} y1={y} x2={x + 4.5} y2={y} stroke="var(--ink-2)" strokeWidth={1.6} strokeLinecap="round" />
      {!open && <line x1={x} y1={y - 4.5} x2={x} y2={y + 4.5} stroke="var(--ink-2)" strokeWidth={1.6} strokeLinecap="round" />}
    </g>
  )
}

function MapEdge({ edge }: { edge: MapScene['edges'][number] }) {
  const idx = useIndex()
  const bind = useBind()
  const { setHot } = useStory()
  const key = `relationship:${edge.id}`
  const look = useLookAny(edge.relationships.map((r) => `relationship:${r}`))
  const rel = idx.relationships.get(edge.id)
  const [p0, c1, c2, p3] = edge.curve
  const color = look.hot ? 'var(--poney)' : stateStroke(look.state, look.focused ? 'var(--story-line)' : 'var(--story-rule)')
  const angle = Math.atan2(p3.y - c2.y, p3.x - c2.x)
  const end = { x: p3.x - Math.cos(angle) * 8, y: p3.y - Math.sin(angle) * 8 }
  const async = rel?.kind === 'publishes' || rel?.kind === 'subscribes'
  const props = bind({ kind: 'relationship', id: edge.id }, rel?.label ?? edge.id)
  return (
    <g
      {...props}
      className={`dg-el ${lookClass(look)}`}
      onMouseEnter={() => {
        props.onMouseEnter?.()
        setHot(key)
      }}
      onMouseLeave={() => {
        props.onMouseLeave?.()
        setHot(null)
      }}
    >
      <path d={`M ${p0.x} ${p0.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p3.x} ${p3.y}`} fill="none" stroke="transparent" strokeWidth={16} />
      <path
        d={`M ${p0.x} ${p0.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`}
        fill="none"
        stroke={color}
        strokeWidth={look.state || look.hot ? 2 : 1.4}
        strokeDasharray={look.state === 'removed' || async ? '6 5' : undefined}
        strokeLinecap="round"
      />
      <Head x={p3.x} y={p3.y} angle={angle} color={color} />
    </g>
  )
}

/** Labels show where they help: on focused, changed or hovered lines. */
function EdgeLabel({ edge }: { edge: MapScene['edges'][number] }) {
  const s = useStory()
  const look = useLookAny(edge.relationships.map((r) => `relationship:${r}`))
  // Labels show where they carry meaning: focused, numbered, hovered, or changed in an unfocused map.
  const show = !look.hidden && (look.hot || s.allLabels || !!look.callout || (!!s.focus && look.focused) || (!s.focus && !!look.state))
  if (!show) return null
  const { x, y, w, h, text, sub } = edge.label
  const color = look.hot ? 'var(--poney)' : look.state ? `var(--${look.state})` : 'var(--ink-2)'
  const line = look.hot ? 'var(--poney)' : look.state ? `var(--${look.state})` : 'var(--story-line)'
  // A label beside its curve points back to it, so it is never read as another line's.
  const lead = edge.leader
  const nearest = lead ? { x: Math.max(x, Math.min(x + w, lead.x)), y: Math.max(y, Math.min(y + h, lead.y)) } : undefined
  return (
    <g pointerEvents="none" className={`st-el ${look.dim ? 'st-dim' : ''}`}>
      {lead && nearest && (
        <>
          <line x1={nearest.x} y1={nearest.y} x2={lead.x} y2={lead.y} stroke={line} strokeWidth={1} strokeDasharray="2 3" />
          <circle cx={lead.x} cy={lead.y} r={2.5} fill={line} />
        </>
      )}
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height={h} rx={11} fill="var(--paper-raised)" stroke={look.hot ? 'var(--poney)' : look.state ? `var(--${look.state})` : 'var(--story-rule)'} />
      <text x={w / 2} y={15} textAnchor="middle" fontSize={12} fontWeight={500} fill={color}>
        {text}
      </text>
      {sub && (
        <text x={w / 2} y={29} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
          {sub}
        </text>
      )}
    </g>
    </g>
  )
}

function NodeCallout({ node }: { node: { entityId: string; x: number; y: number; members?: string[] } }) {
  const look = useLookAny([`entity:${node.entityId}`, ...(('depth' in node ? [] : node.members) ?? []).map((m) => `entity:${m}`)])
  if (!look.callout || look.hidden) return null
  return <CalloutBadge n={look.callout} x={node.x - 2} y={node.y - 2} hot={look.hot} />
}

function EdgeCallout({ edge }: { edge: MapScene['edges'][number] }) {
  const look = useLookAny(edge.relationships.map((r) => `relationship:${r}`))
  if (!look.callout || look.hidden) return null
  return <CalloutBadge n={look.callout} x={edge.label.x - 14} y={edge.label.y + edge.label.h / 2} hot={look.hot} />
}
