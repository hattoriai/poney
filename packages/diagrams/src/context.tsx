/** @jsxRuntime automatic */
/** @jsxImportSource @hattoriai/poney-diagrams */
import { createContext, useContext, type Child } from './runtime'
import type { Badge, ChangeState, Effect } from '@hattoriai/poney-core'
import { measure } from '@hattoriai/poney-layout'

/**
 * How a story renderer shows the change.
 *
 * - "before": the system before the change. New elements are hidden.
 * - "change": the change itself. New, changed and removed elements are coloured.
 * - "after": the system after the change. Removed elements are hidden.
 */
export type Mode = 'before' | 'change' | 'after'

export interface StoryState {
  marks: Map<string, ChangeState>
  mode: Mode
  /** Elements the scene is about. Everything else dims. Null: nothing dims. */
  focus: Set<string> | null
  /** Numbered callouts by element. */
  callouts: Map<string, number>
  /** The element under the reader's attention: hovered here or in the text. */
  hot: string | null
  setHot(key: string | null): void
  /** Show relationship labels on every edge, not only on focused ones. */
  allLabels?: boolean
  /** Opens or closes a group in a map. Without it, groups cannot be toggled (a static picture). */
  toggleGroup?(entityId: string): void
  /** Effects and badges by ref key. */
  effects?: Map<string, Effect[]>
  badges?: Map<string, Badge[]>
  /**
   * The path the reader can play: its steps as ref keys, the step shown
   * (null: not playing), whether to animate, and whether a still picture
   * numbers the steps.
   */
  trace?: { steps: string[]; current: number | null; animate: boolean; numbered: boolean }
}

const StoryContext = createContext<StoryState>({
  marks: new Map(),
  mode: 'after',
  focus: null,
  callouts: new Map(),
  hot: null,
  setHot: () => {},
})

export const StoryProvider = ({ value, children }: { value: StoryState; children?: Child }) => <StoryContext.Provider value={value}>{children}</StoryContext.Provider>
export const useStory = () => useContext(StoryContext)

export interface Look {
  /** The change state, shown only in "change" mode. */
  state?: ChangeState
  hidden: boolean
  dim: boolean
  hot: boolean
  focused: boolean
  callout?: number
}

/** How one element should look in the current story state. */
export function useLook(key: string): Look {
  return lookOf(useStory(), key)
}

/** One look for an element that stands for several (a line through a hidden hop). */
export function useLookAny(keys: string[]): Look {
  const s = useStory()
  const looks = keys.map((k) => lookOf(s, k))
  return {
    state: looks.find((l) => l.state)?.state,
    hidden: looks.every((l) => l.hidden),
    dim: looks.every((l) => l.dim),
    hot: looks.some((l) => l.hot),
    focused: looks.some((l) => l.focused),
    callout: looks.find((l) => l.callout)?.callout,
  }
}

export function lookOf(s: StoryState, key: string): Look {
  const mark = s.marks.get(key)
  const hidden = (s.mode === 'before' && mark === 'new') || (s.mode === 'after' && mark === 'removed')
  const focused = !s.focus || s.focus.has(key)
  return {
    state: s.mode === 'change' ? mark : undefined,
    hidden,
    dim: !focused && s.hot !== key,
    hot: s.hot === key,
    focused,
    callout: s.callouts.get(key),
  }
}

export const lookClass = (l: Look) => `poney-story-el ${l.hidden ? 'poney-story-hidden' : l.dim ? 'poney-story-dim' : ''}`

export const stateStroke = (s?: ChangeState, fallback = 'var(--poney-story-rule)') => (s ? `var(--poney-${s})` : fallback)
export const stateFill = (s?: ChangeState, fallback = 'var(--poney-story-node)') => (s ? `var(--poney-${s}-wash)` : fallback)
export const STATE_LABEL: Record<ChangeState, string> = { new: 'New', changed: 'Changed', removed: 'Removed' }

/** A small label that says New, Changed or Removed, centred on a point. */
export function StateTag({ state, x, y, anchor = 'start' }: { state?: ChangeState; x: number; y: number; anchor?: 'start' | 'end' | 'middle' }) {
  if (!state) return null
  const text = STATE_LABEL[state]
  const w = measure(text, 11, 650) + 14
  const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2
  return (
    <g pointerEvents="none">
      <rect x={left} y={y - 9} width={w} height={18} rx={9} fill={`var(--poney-${state}-wash)`} stroke={`var(--poney-${state})`} strokeWidth={1} />
      <text x={left + w / 2} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={650} fill={`var(--poney-${state})`}>
        {text}
      </text>
    </g>
  )
}

/** A numbered marker that ties the diagram to a note in the text. */
export function CalloutBadge({ n, x, y, hot }: { n: number; x: number; y: number; hot?: boolean }) {
  return (
    <g pointerEvents="none" className="poney-story-el">
      <circle cx={x} cy={y} r={12} fill={hot ? 'var(--poney-accent)' : 'var(--poney-ink)'} stroke="var(--poney-paper-raised)" strokeWidth={2.5} />
      <text x={x} y={y + 4.2} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--poney-paper-raised)" className="poney-numbers">
        {n}
      </text>
    </g>
  )
}

/** A filled arrowhead at the end of a line. */
export function Head({ x, y, angle, color, size = 7 }: { x: number; y: number; angle: number; color: string; size?: number }) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const p = (dx: number, dy: number) => `${x + dx * c - dy * s},${y + dx * s + dy * c}`
  return <polygon points={`${p(0, 0)} ${p(-size * 1.35, -size * 0.62)} ${p(-size * 1.35, size * 0.62)}`} fill={color} />
}
