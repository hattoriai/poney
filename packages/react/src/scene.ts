import { indexOf, marksOf, parseRef, refKey, type Badge, type ChangeState, type Effect, type ModelIndex, type PoneyDocument, type TraceStep, type View, type Walkthrough } from '@poney/core'
import { union, type Rect, type SceneBase, type ViewLayoutOptions } from '@poney/layout'
import type { Mode, StoryState } from './context'

/** Layout options for a view shown in a walkthrough scene. */
export function sceneLayoutOptions(view: View, walkthrough: Walkthrough | undefined, focus: string[]): ViewLayoutOptions {
  const o: ViewLayoutOptions = {}
  if (walkthrough && view.type === 'state') o.extraTransitions = walkthrough.removed.transitions.filter((t) => t.stateMachine === view.stateMachine).map((t) => t.transition)
  if (walkthrough && view.type === 'map') {
    o.extraEntities = walkthrough.removed.entities
    o.extraRelationships = walkthrough.removed.relationships
  }
  if (view.type === 'sequence') {
    o.compact = true
    const only = focus.map(parseRef).flatMap((r) => (r?.kind === 'message' && r.behavior === view.interaction ? [r.id] : []))
    if (only.length) o.only = only
  }
  return o
}

const keysOf = (refs: string[]) => refs.map(parseRef).flatMap((r) => (r ? [refKey(r)] : []))

/**
 * The elements a focus really covers: a line or a transition brings its two
 * ends, so the things it connects are never dimmed.
 */
export function expandFocus(refs: string[], idx?: ModelIndex, walkthrough?: Walkthrough): string[] {
  const out = new Set(keysOf(refs))
  for (const key of [...out]) {
    const ref = parseRef(key)
    if (!ref) continue
    if (ref.kind === 'relationship') {
      const r = idx?.relationships.get(ref.id) ?? walkthrough?.removed.relationships.find((x) => x.id === ref.id)
      if (r) for (const e of [r.source, r.target]) out.add(`entity:${e}`)
    }
    if (ref.kind === 'transition') {
      const t = idx?.stateMachine(ref.behavior)?.transitions.find((x) => x.id === ref.id) ?? walkthrough?.removed.transitions.find((x) => x.stateMachine === ref.behavior && x.transition.id === ref.id)?.transition
      if (t) for (const st of [t.from, t.to]) out.add(`state:${ref.behavior}:${st}`)
    }
  }
  return [...out]
}

/** Boxes that a frame must never cut in half. Lines may leave the frame. */
const BOX = /^(entity|state|dataType|activityNode|capability):/

/**
 * The part of a scene to frame: the focus, or everything. A focused sequence
 * is already cut to its focus. The frame grows to hold whole any box it
 * would otherwise cut.
 */
export function sceneFrame(scene: SceneBase, view: View, focus: string[], idx?: ModelIndex, walkthrough?: Walkthrough): Rect {
  const rects = expandFocus(focus, idx, walkthrough).map((k) => scene.anchors[k]).filter((r): r is Rect => !!r)
  if (!rects.length || view.type === 'sequence') return { x: 0, y: 0, w: scene.width, h: scene.height }
  let frame = union(rects)
  const pad = 24
  for (let pass = 0; pass < 3; pass++) {
    const f = { x: frame.x - pad, y: frame.y - pad, w: frame.w + pad * 2, h: frame.h + pad * 2 }
    const cut = Object.entries(scene.anchors)
      .filter(([k]) => BOX.test(k))
      .map(([, r]) => r)
      .filter((r) => r.x < f.x + f.w && r.x + r.w > f.x && r.y < f.y + f.h && r.y + r.h > f.y)
      .filter((r) => r.x < f.x || r.y < f.y || r.x + r.w > f.x + f.w || r.y + r.h > f.y + f.h)
    if (!cut.length) break
    frame = union([frame, ...cut])
  }
  return frame
}

export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

/** Fits a frame into a box of the given size, never closer than `maxScale`. */
export function fit(frame: Rect, W: number, H: number, pad: number, maxScale: number): ViewBox {
  const f = { x: frame.x - pad, y: frame.y - pad, w: frame.w + pad * 2, h: frame.h + pad * 2 }
  let w = Math.max(f.w, W / maxScale)
  let h = Math.max(f.h, H / maxScale)
  const aspect = W / Math.max(H, 1)
  if (w / h < aspect) w = h * aspect
  else h = w / aspect
  return { x: f.x + f.w / 2 - w / 2, y: f.y + f.h / 2 - h / 2, w, h }
}

/** The story state of a scene: marks, mode, focus and numbered callouts. */
export function storyState(input: {
  marks: Map<string, ChangeState>
  mode: Mode
  view: View
  focus: string[]
  callouts: string[]
  hot?: string | null
  setHot?: (k: string | null) => void
  idx?: ModelIndex
  walkthrough?: Walkthrough
  effects?: Effect[]
  badges?: Badge[]
  trace?: TraceStep[]
  /** The trace step shown; null or absent: not playing. */
  traceStep?: number | null
  /** Animate the trace token and effects. Default: true. */
  animate?: boolean
  /** A still picture: number the steps of the trace. */
  numberSteps?: boolean
}): StoryState {
  const keys = expandFocus(input.focus, input.idx, input.walkthrough)
  const group = <T extends { target: string }>(items: T[] = []) => {
    const m = new Map<string, T[]>()
    for (const it of items) {
      const r = parseRef(it.target)
      if (r) m.set(refKey(r), [...(m.get(refKey(r)) ?? []), it])
    }
    return m
  }
  return {
    marks: input.marks,
    mode: input.mode,
    focus: keys.length && input.view.type !== 'sequence' ? new Set(keys) : null,
    callouts: new Map(keysOf(input.callouts).map((k, i) => [k, i + 1])),
    hot: input.hot ?? null,
    setHot: input.setHot ?? (() => {}),
    // A tour marks nothing, so a picture with no focus names every line.
    allLabels: input.walkthrough?.kind === 'tour' && keys.length === 0,
    effects: group(input.effects),
    badges: group(input.badges),
    trace: input.trace?.length
      ? { steps: keysOf(input.trace.map((t) => t.ref)), current: input.traceStep ?? null, animate: input.animate !== false, numbered: !!input.numberSteps }
      : undefined,
  }
}

/** Finds a scene by walkthrough and scene id ("overview" for the overview). */
export function findScene(doc: PoneyDocument, walkthroughId?: string, sceneId?: string) {
  const w = walkthroughId ? doc.walkthroughs.find((x) => x.id === walkthroughId) : doc.walkthroughs[0]
  if (!w) return undefined
  if (!sceneId || sceneId === 'overview') {
    if (w.overview) return { walkthrough: w, viewId: w.overview, focus: [] as string[], callouts: [] as string[], notes: [] as string[], title: `${w.title}: overview`, scene: undefined }
    if (sceneId === 'overview') return undefined
  }
  const s = sceneId ? w.scenes.find((x) => x.id === sceneId) : w.scenes.find((x) => x.view)
  if (!s?.view) return undefined
  return { walkthrough: w, viewId: s.view, focus: s.focus, callouts: s.callouts.map((c) => c.target), notes: s.callouts.map((c) => c.text), title: s.title, scene: s }
}

export { marksOf, indexOf }
