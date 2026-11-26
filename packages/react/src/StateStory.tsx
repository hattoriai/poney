/** @jsxRuntime automatic @jsxImportSource react */
import { roundedPath, trimEnd, endAngle, type StateScene } from '@hattoriai/poney-layout'
import { useRenderBind as useBind, type BindFn } from './render'
import { CalloutBadge, Head, lookClass, StateTag, stateFill, stateStroke, useLook, useStory } from './context'

/** Draws a state machine scene in the crisp story style. */
export function StateStory({ scene }: { scene: StateScene }) {
  return (
    <g>
      {scene.transitions.map((t) => (
        <TransitionLine key={t.id} t={t} machine={scene.machineId} />
      ))}
      {scene.states.map((s) => (
        <StateBox key={s.id} s={s} machine={scene.machineId} />
      ))}
      {scene.transitions.map((t) => (
        <TransitionLabel key={`l-${t.id}`} t={t} machine={scene.machineId} />
      ))}
    </g>
  )
}

function useHotBind(key: string, ref: Parameters<BindFn>[0], label: string, cls: string) {
  const bind = useBind()
  const { setHot } = useStory()
  const props = bind(ref, label)
  return {
    ...props,
    className: `poney-el ${cls}`,
    onMouseEnter: () => {
      props.onMouseEnter?.()
      setHot(key)
    },
    onMouseLeave: () => {
      props.onMouseLeave?.()
      setHot(null)
    },
  }
}

function StateBox({ s, machine }: { s: StateScene['states'][number]; machine: string }) {
  const key = `state:${machine}:${s.id}`
  const look = useLook(key)
  const props = useHotBind(key, { kind: 'state', behavior: machine, id: s.id }, `State ${s.name}`, lookClass(look))
  const outcome = s.outcome === 'success' ? 'var(--poney-success)' : s.outcome === 'failure' ? 'var(--poney-failure)' : undefined
  if (s.kind === 'initial')
    return (
      <g transform={`translate(${s.x} ${s.y})`} {...props}>
        <circle cx={s.w / 2} cy={s.h / 2} r={8} fill="var(--poney-ink)" />
      </g>
    )
  const stroke = look.hot ? 'var(--poney-accent)' : stateStroke(look.state, look.focused ? 'var(--poney-story-line)' : 'var(--poney-story-rule)')
  return (
    <g transform={`translate(${s.x} ${s.y})`} {...props}>
      <rect width={s.w} height={s.h} rx={s.h / 2} fill={stateFill(look.state)} stroke={stroke} strokeWidth={look.state || look.hot ? 1.8 : 1.25} />
      {s.kind === 'final' && <rect x={4} y={4} width={s.w - 8} height={s.h - 8} rx={(s.h - 8) / 2} fill="none" stroke={stroke} strokeWidth={1} />}
      {outcome && <circle cx={20} cy={s.h / 2} r={4} fill={outcome} />}
      <text x={s.w / 2} y={s.entryActions.length ? s.h / 2 - 2 : s.h / 2 + 5} textAnchor="middle" fontSize={14.5} fontWeight={600} fill="var(--poney-ink)">
        {s.name}
      </text>
      {s.entryActions.length > 0 && (
        <text x={s.w / 2} y={s.h / 2 + 15} textAnchor="middle" fontSize={11.5} fill="var(--poney-ink-3)">
          {s.entryActions[0]}
          {s.entryActions.length > 1 ? `, +${s.entryActions.length - 1}` : ''}
        </text>
      )}
      <StateTag state={look.state} x={s.w - 14} y={0} anchor="end" />
      {look.callout && <CalloutBadge n={look.callout} x={0} y={0} hot={look.hot} />}
    </g>
  )
}

function TransitionLine({ t, machine }: { t: StateScene['transitions'][number]; machine: string }) {
  const key = `transition:${machine}:${t.id}`
  const look = useLook(key)
  const props = useHotBind(key, { kind: 'transition', behavior: machine, id: t.id }, `Transition: ${t.event}`, lookClass(look))
  const color = look.hot ? 'var(--poney-accent)' : stateStroke(look.state, look.focused ? 'var(--poney-story-line)' : 'var(--poney-story-rule)')
  const d = roundedPath(trimEnd(t.points, 7), 18)
  const last = t.points[t.points.length - 1]
  return (
    <g {...props}>
      <path d={roundedPath(t.points, 18)} fill="none" stroke="transparent" strokeWidth={16} />
      <path d={d} fill="none" stroke={color} strokeWidth={look.state || look.hot ? 2 : 1.4} strokeDasharray={look.state === 'removed' ? '6 5' : undefined} strokeLinecap="round" />
      <Head x={last.x} y={last.y} angle={endAngle(t.points)} color={color} size={6} />
    </g>
  )
}

function TransitionLabel({ t, machine }: { t: StateScene['transitions'][number]; machine: string }) {
  const key = `transition:${machine}:${t.id}`
  const look = useLook(key)
  if (!t.label) return null
  const { x, y, w, h } = t.label
  const color = look.hot ? 'var(--poney-accent)' : look.state ? `var(--poney-${look.state})` : 'var(--poney-ink)'
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none" className={lookClass(look)}>
      <rect width={w} height={h} rx={8} fill={look.state ? `var(--poney-${look.state}-wash)` : 'var(--poney-paper-raised)'} stroke={look.state ? `var(--poney-${look.state})` : 'var(--poney-story-rule)'} />
      <text x={w / 2} y={15} textAnchor="middle" fontSize={11.5} fontWeight={600} fill={color} textDecoration={look.state === 'removed' ? 'line-through' : undefined}>
        {t.event}
      </text>
      {t.guard && (
        <text x={w / 2} y={28} textAnchor="middle" fontSize={10.5} fill="var(--poney-ink-3)">
          [{t.guard}]
        </text>
      )}
      {look.callout && <CalloutBadge n={look.callout} x={-4} y={h / 2} hot={look.hot} />}
    </g>
  )
}
