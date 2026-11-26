/** @jsxRuntime automatic */
/** @jsxImportSource @hattoriai/poney-diagrams */
import { fragmentLabel } from '@hattoriai/poney-core'
import { clip, measure, type SequenceScene } from '@hattoriai/poney-layout'
import { useRenderBind as useBind, useRenderIndex as useIndex } from './render'
import { Glyph } from './icons'
import { toneColor } from './tone'
import { CalloutBadge, Head, lookClass, StateTag, stateFill, stateStroke, useLook, useStory, type Look } from './context'

/** Draws a sequence scene in the crisp story style. */
export function SequenceStory({ scene }: { scene: SequenceScene }) {
  const behavior = scene.interactionId
  return (
    <g>
      {scene.fragments
        .slice()
        .sort((a, b) => a.depth - b.depth)
        .map((f) => (
          <Fragment key={f.id} f={f} behavior={behavior} />
        ))}
      {scene.participants.map((p) => (
        <Lifeline key={p.entityId} p={p} />
      ))}
      {scene.activations.map((a, i) => (
        <rect key={i} x={a.x + 1} y={a.y1} width={8} height={a.y2 - a.y1} rx={3} fill="var(--poney-sunken)" stroke="var(--poney-story-rule)" />
      ))}
      {scene.fragments.map((f) => (
        <FragmentLabels key={`fl-${f.id}`} f={f} behavior={behavior} />
      ))}
      {scene.messages.map((m) => (
        <MessageRow key={m.id} m={m} behavior={behavior} />
      ))}
      {scene.participants.map((p) => (
        <Participant key={`h-${p.entityId}`} p={p} />
      ))}
    </g>
  )
}

function Lifeline({ p }: { p: SequenceScene['participants'][number] }) {
  const look = useLook(`entity:${p.entityId}`)
  return <line x1={p.x} x2={p.x} y1={p.lifeline.y1} y2={p.lifeline.y2} stroke={look.hot ? 'var(--poney-accent)' : 'var(--poney-story-rule)'} strokeWidth={look.hot ? 1.5 : 1} className={lookClass({ ...look, dim: false })} />
}

function Participant({ p }: { p: SequenceScene['participants'][number] }) {
  const idx = useIndex()
  const bind = useBind()
  const { setHot } = useStory()
  const key = `entity:${p.entityId}`
  const look = useLook(key)
  const e = idx.entities.get(p.entityId)
  if (!e) return null
  const s = idx.style(e)
  const { x, y, w, h } = p.header
  const props = bind({ kind: 'entity', id: e.id }, `${e.name}, ${s.label}`)
  return (
    <g
      transform={`translate(${x} ${y})`}
      {...props}
      className={`poney-el ${lookClass({ ...look, dim: false })}`}
      onMouseEnter={() => {
        props.onMouseEnter?.()
        setHot(key)
      }}
      onMouseLeave={() => {
        props.onMouseLeave?.()
        setHot(null)
      }}
    >
      <rect width={w} height={h} rx={14} fill={stateFill(look.state)} stroke={look.hot ? 'var(--poney-accent)' : stateStroke(look.state, 'var(--poney-story-line)')} strokeWidth={look.state ? 1.75 : 1.2} strokeDasharray={e.kind === 'external' ? '6 4' : undefined} />
      <Glyph name={s.icon} x={16} y={h / 2 - 9} size={18} color={look.state ? `var(--poney-${look.state})` : toneColor(s.tone)} />
      <text x={44} y={h / 2 - 1} fontSize={14.5} fontWeight={600} fill="var(--poney-ink)">
        {clip(e.name, w - 54, 14.5, 600)}
      </text>
      <text x={44} y={h / 2 + 16} fontSize={12} fill="var(--poney-ink-3)">
        {clip(e.technology ?? s.label, w - 54, 12)}
      </text>
      <StateTag state={look.state} x={w - 10} y={0} anchor="end" />
      {look.callout && <CalloutBadge n={look.callout} x={-2} y={-2} hot={look.hot} />}
    </g>
  )
}

function messageColor(look: Look) {
  if (look.hot) return 'var(--poney-accent)'
  if (look.state) return `var(--poney-${look.state})`
  return 'var(--poney-ink-2)'
}

function MessageRow({ m, behavior }: { m: SequenceScene['messages'][number]; behavior: string }) {
  const bind = useBind()
  const { setHot } = useStory()
  const key = `message:${behavior}:${m.id}`
  const look = useLook(key)
  const color = messageColor(look)
  const width = look.state || look.hot ? 1.9 : 1.35
  const num = String(m.number)
  const numW = measure(num, 11.5, 600) + 8
  const textW = measure(m.label, 13, look.state ? 600 : 500)
  const props = bind({ kind: 'message', behavior, id: m.id }, `Step ${m.number}: ${m.label}`)
  const events = {
    ...props,
    className: `poney-el ${lookClass(look)}`,
    onMouseEnter: () => {
      props.onMouseEnter?.()
      setHot(key)
    },
    onMouseLeave: () => {
      props.onMouseLeave?.()
      setHot(null)
    },
  }
  const label = (lx: number, ly: number, anchor: 'start' | 'middle') => {
    const total = numW + textW
    const start = anchor === 'middle' ? lx - total / 2 : lx
    return (
      <>
        <text x={start} y={ly} fontSize={11.5} fontWeight={600} fill="var(--poney-ink-3)" className="poney-numbers" stroke="var(--poney-paper-raised)" strokeWidth={5} paintOrder="stroke" strokeLinejoin="round">
          {num}
        </text>
        <text x={start + numW} y={ly} stroke="var(--poney-paper-raised)" strokeWidth={5} paintOrder="stroke" strokeLinejoin="round" fontSize={13} fontWeight={look.state ? 600 : 500} fill={look.state || look.hot ? color : m.kind === 'return' ? 'var(--poney-ink-2)' : 'var(--poney-ink)'}>
          {m.label}
        </text>
        <StateTag state={look.state} x={start + total + 14} y={ly - 4.5} />
        {look.callout && <CalloutBadge n={look.callout} x={start - 18} y={ly - 4.5} hot={look.hot} />}
      </>
    )
  }

  if (m.loop) {
    const { x, y1, y2, w } = m.loop
    return (
      <g {...events}>
        <rect x={x - 4} y={y1 - 14} width={w + textW + numW + 90} height={y2 - y1 + 26} fill="transparent" />
        <path d={`M ${x} ${y1} H ${x + w} V ${y2} H ${x + 8}`} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="round" />
        <Head x={x + 1} y={y2} angle={Math.PI} color={color} size={6} />
        {label(x + w + 14, (y1 + y2) / 2 + 4.5, 'start')}
      </g>
    )
  }
  const right = m.x2 > m.x1
  return (
    <g {...events}>
      <rect x={Math.min(m.x1, m.x2)} y={m.y - 24} width={Math.abs(m.x2 - m.x1)} height={32} fill="transparent" />
      <line x1={m.x1} x2={m.x2 + (right ? -8 : 8)} y1={m.y} y2={m.y} stroke={color} strokeWidth={width} strokeDasharray={m.kind === 'return' ? '5 4' : m.kind === 'async' ? '2 4' : undefined} strokeLinecap="round" />
      <Head x={m.x2} y={m.y} angle={right ? 0 : Math.PI} color={color} size={6} />
      {label((m.x1 + m.x2) / 2, m.y - 9, 'middle')}
    </g>
  )
}

function Fragment({ f, behavior }: { f: SequenceScene['fragments'][number]; behavior: string }) {
  const look = useLook(`fragment:${behavior}:${f.id}`)
  return (
    <g className={lookClass(look)}>
      <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={14} fill="var(--poney-paper)" fillOpacity={0.55} stroke="var(--poney-story-rule)" />
      {f.branches.slice(1).map((b, i) => (
        <line key={i} x1={f.x + 10} x2={f.x + f.w - 10} y1={b.y} y2={b.y} stroke="var(--poney-story-rule)" strokeDasharray="4 4" />
      ))}
    </g>
  )
}

/** Fragment labels sit above lifelines and activations, with a halo. */
function FragmentLabels({ f, behavior }: { f: SequenceScene['fragments'][number]; behavior: string }) {
  const look = useLook(`fragment:${behavior}:${f.id}`)
  const name = fragmentLabel(f.kind)
  const first = f.branches[0]?.guard ?? ''
  const nameW = measure(name, 11.5, 650)
  const halo = { stroke: 'var(--poney-paper-raised)', strokeWidth: 5, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const }
  return (
    <g className={lookClass(look)} pointerEvents="none">
      <text x={f.x + 14} y={f.y + 19} fontSize={11.5} fontWeight={650} fill="var(--poney-ink-3)" {...halo}>
        {name}
      </text>
      <text x={f.x + 24 + nameW} y={f.y + 19} fontSize={12} fill="var(--poney-ink-2)" {...halo}>
        {f.kind === 'loop' || f.kind === 'opt' ? first : `if ${first}`}
      </text>
      {f.branches.slice(1).map((b, i) => (
        <text key={i} x={f.x + 14} y={b.y + 18} fontSize={12} fill="var(--poney-ink-2)" {...halo}>
          {f.kind === 'par' ? `and ${b.guard}` : `else, if ${b.guard}`}
        </text>
      ))}
    </g>
  )
}
