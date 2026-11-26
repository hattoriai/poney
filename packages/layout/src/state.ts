import { indexOf, refKey, type PoneyDocument, type State, type Transition, type ViewOf } from '@poney/core'
import { BASE_OPTIONS, runElk } from './elk'
import { union } from './geometry'
import { measure } from './text'
import type { Point, Rect, SceneBase } from './types'

export interface StateSceneState extends Rect {
  id: string
  kind: State['kind']
  name: string
  outcome: State['outcome']
  entryActions: string[]
}

export interface StateSceneTransition {
  id: string
  from: string
  to: string
  event: string
  guard?: string
  points: Point[]
  label?: Rect
}

export interface StateScene extends SceneBase {
  machineId: string
  states: StateSceneState[]
  transitions: StateSceneTransition[]
}

/** Sizes of a transition label: the event, and the guard on a second line. */
export function transitionLabelSize(event: string, guard?: string) {
  const w = Math.max(measure(event, 11.5, 600), guard ? measure(`[${guard}]`, 10.5, 400) : 0) + 16
  return { width: Math.ceil(w), height: guard ? 34 : 22 }
}

export async function layoutState(doc: PoneyDocument, view: ViewOf<'state'>, options: { extraTransitions?: Transition[] } = {}): Promise<StateScene> {
  const idx = indexOf(doc)
  const base = idx.stateMachine(view.stateMachine)
  if (!base) throw new Error(`Unknown state machine "${view.stateMachine}"`)
  // Transitions a change removed are laid out with the others, so before and after share one picture.
  const sm = { ...base, transitions: [...base.transitions, ...(options.extraTransitions ?? [])] }
  const size = (s: State) => {
    if (s.kind === 'initial') return { w: 22, h: 22 }
    const entry = s.entryActions.length ? `On entry: ${s.entryActions[0]}${s.entryActions.length > 1 ? ` +${s.entryActions.length - 1}` : ''}` : ''
    const w = Math.max(148, measure(s.name, 14, 600) + 52, entry ? measure(entry, 11, 400) + 36 : 0)
    return { w: Math.ceil(w), h: entry ? 64 : 48 }
  }
  const out = await runElk({
    id: 'root',
    layoutOptions: {
      ...BASE_OPTIONS,
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '56',
      'elk.layered.spacing.nodeNodeBetweenLayers': '44',
      'elk.spacing.edgeNode': '22',
      'elk.spacing.edgeEdge': '18',
      'elk.spacing.edgeLabel': '6',
      'elk.edgeLabels.placement': 'CENTER',
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
    },
    children: sm.states.map((s) => ({ id: s.id, width: size(s).w, height: size(s).h, ...view.positions[s.id] })),
    edges: sm.transitions.map((t) => ({ id: t.id, sources: [t.from], targets: [t.to], labels: [{ text: t.event, ...transitionLabelSize(t.event, t.guard) }] })),
  })

  const states = sm.states.map((s) => ({ ...out.nodes.get(s.id)!, id: s.id, kind: s.kind, name: s.name, outcome: s.outcome, entryActions: s.entryActions }))
  const transitions = sm.transitions
    .map((t) => {
      const e = out.edges.get(t.id)
      return { id: t.id, from: t.from, to: t.to, event: t.event, guard: t.guard, points: e?.points ?? [], label: e?.labels[0] }
    })
    .filter((t) => t.points.length >= 2)

  const anchors: Record<string, Rect> = {}
  for (const s of states) anchors[refKey({ kind: 'state', behavior: sm.id, id: s.id })] = s
  for (const t of transitions)
    anchors[refKey({ kind: 'transition', behavior: sm.id, id: t.id })] = union([...t.points.map((p) => ({ ...p, w: 1, h: 1 })), ...(t.label ? [t.label] : [])])
  anchors[refKey({ kind: 'behavior', id: sm.id })] = { x: 0, y: 0, w: out.width, h: out.height }
  if (sm.subject) anchors[refKey({ kind: 'dataType', id: sm.subject })] = { x: 0, y: 0, w: out.width, h: out.height }
  return { machineId: sm.id, width: out.width, height: out.height, states, transitions, anchors }
}
