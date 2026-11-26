import { indexOf, marksOf, parseRef, refKey, type Badge, type ChangeState, type Effect, type ModelIndex, type PoneyDocument, type Scene, type TraceStep, type View, type Walkthrough } from '@hattoriai/poney-core'
import { union, type Rect, type SceneBase, type ViewLayoutOptions } from '@hattoriai/poney-layout'
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
const BOX = /^(entity|state|dataType|activityNode|useCase):/

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

/**
 * Zooms a view box by `factor` (above 1: closer) around a point given as a
 * fraction of the box. It stays between 6 times closer and 4 times farther
 * than `base`, the box that frames the scene.
 */
export function zoomViewBox(current: ViewBox, base: ViewBox, factor: number, fx = 0.5, fy = 0.5): ViewBox {
  const w = Math.min(base.w * 4, Math.max(base.w / 6, current.w / factor))
  const h = w * (current.h / current.w)
  const x = current.x + fx * current.w
  const y = current.y + fy * current.h
  return { x: x - fx * w, y: y - fy * h, w, h }
}

/** Moves a view box with the pointer: `dx`, `dy` in screen pixels, on a stage of `width` by `height` pixels. */
export function panViewBox(current: ViewBox, dx: number, dy: number, width: number, height: number): ViewBox {
  return { ...current, x: current.x - (dx * current.w) / Math.max(width, 1), y: current.y - (dy * current.h) / Math.max(height, 1) }
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

/**
 * While a trace plays, the frame that follows its step: the line and the two
 * things it joins, never closer than a comfortable reading size and never
 * larger than the whole scene.
 */
export function followFrame(scene: SceneBase, whole: Rect, step: string | undefined, idx: ModelIndex, walkthrough?: Walkthrough): Rect {
  if (!step) return whole
  const r = parseRef(step)
  const keys = expandFocus([step], idx, walkthrough)
  if (r?.kind === 'message') {
    const m = idx.messages(r.behavior).find((x) => x.message.id === r.id)?.message
    if (m) keys.push(`entity:${m.from}`, `entity:${m.to}`)
  }
  const rects = keys.map((k) => scene.anchors[k]).filter((x): x is Rect => !!x)
  if (!rects.length) return whole
  const u = union(rects)
  const w = Math.min(whole.w, Math.max(u.w, 620))
  const h = Math.min(whole.h, Math.max(u.h, 340))
  const cx = Math.max(whole.x + w / 2, Math.min(whole.x + whole.w - w / 2, u.x + u.w / 2))
  const cy = Math.max(whole.y + h / 2, Math.min(whole.y + whole.h - h / 2, u.y + u.h / 2))
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

/** View types that draw as walkthrough stories (marks, focus, callouts); the others draw with their diagram renderer. */
export const STORY_TYPES: readonly string[] = ['map', 'sequence', 'state']

/** What to draw: a view on its own, or a walkthrough scene. */
export interface DrawingTarget {
  view?: string
  walkthrough?: string
  /** A scene id, or "overview". Default: the overview, else the first scene with a view. */
  scene?: string
}

/** A target found in a document: the view, and for a scene its walkthrough, focus and callouts. */
export interface FoundTarget {
  view: View
  walkthrough?: Walkthrough
  focus: string[]
  callouts: string[]
  notes: string[]
  title: string
  scene?: Scene
}

/** Finds what a target names, or throws with the ids that exist. */
export function findTarget(doc: PoneyDocument, target: DrawingTarget): FoundTarget {
  const idx = indexOf(doc)
  if (target.view) {
    const view = idx.views.get(target.view)
    if (!view) throw new Error(`No view "${target.view}". Views: ${doc.views.map((v) => v.id).join(', ')}`)
    const walkthrough = target.walkthrough ? doc.walkthroughs.find((w) => w.id === target.walkthrough) : undefined
    return { view, walkthrough, focus: [], callouts: [], notes: [], title: view.title }
  }
  const found = findScene(doc, target.walkthrough, target.scene)
  if (!found) {
    const w = target.walkthrough ? doc.walkthroughs.find((x) => x.id === target.walkthrough) : doc.walkthroughs[0]
    const ids = w ? ['overview', ...w.scenes.filter((s) => s.view).map((s) => s.id)].join(', ') : 'none'
    throw new Error(`No scene "${target.scene ?? '(default)'}" with a view. Scenes: ${ids}`)
  }
  return { view: idx.views.get(found.viewId)!, walkthrough: found.walkthrough, focus: found.focus, callouts: found.callouts, notes: found.notes, title: found.title, scene: found.scene }
}

export { marksOf, indexOf }
