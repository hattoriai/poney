import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { ChangeState, Scene, View, Walkthrough } from '@hattoriai/poney-core'
import { layoutView, type SceneBase, type ViewLayoutOptions, type Rect } from '@hattoriai/poney-layout'
import { fit, followFrame, SceneStory, StoryProvider, sceneFrame, sceneLayoutOptions, storyState, type Mode, type ViewBox } from '@hattoriai/poney-react'
import { useDoc, useIndex } from '@/features/store'
import { useOverlayFacts } from '@/features/overlays'
import { diagramFor } from '@hattoriai/poney-react'
import { focusNextElement } from '@/features/interaction'
import { onDiagramContextMenu } from '@/features/context'
import { PointButton } from '@/components/agent/PointButton'


const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches


/**
 * An SVG stage whose camera glides to a frame. Scenes change by moving the
 * camera, not by cutting, so the reader keeps their place.
 *
 * The stage is also a small canvas: pinch or ⌘/Ctrl + scroll zooms the
 * diagram around the pointer (never the page), and dragging pans it. Plain
 * scrolling still scrolls the page. A new frame, or "Reset view", brings the
 * camera back to the scene.
 */
export function Stage({ frame, label, children, pad = 56, maxScale = 1.25 }: { frame: Rect; label: string; children: ReactNode; pad?: number; maxScale?: number }) {
  const host = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [vb, setVb] = useState<ViewBox | null>(null)
  const [moved, setMoved] = useState(false)
  const current = useRef<ViewBox | null>(null)
  const raf = useRef(0)
  const drag = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null)

  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const target = useMemo(() => (size.w && size.h ? fit(frame, size.w, size.h, pad, maxScale) : null), [frame, size, pad, maxScale])

  const show = useCallback((next: ViewBox) => {
    current.current = next
    setVb(next)
  }, [])

  const glide = useCallback(
    (to: ViewBox) => {
      cancelAnimationFrame(raf.current)
      const from = current.current
      if (!from || reduced()) return show(to)
      const start = performance.now()
      const duration = 700
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / duration)
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
        show({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e })
        if (p < 1) raf.current = requestAnimationFrame(step)
      }
      raf.current = requestAnimationFrame(step)
    },
    [show],
  )

  // A new scene or a new size frames the scene again.
  useEffect(() => {
    if (!target) return
    setMoved(false)
    glide(target)
    return () => cancelAnimationFrame(raf.current)
  }, [target, glide])

  /** Zooms by `factor` around a point given as a fraction of the stage. */
  const zoomAt = useCallback(
    (factor: number, fx = 0.5, fy = 0.5) => {
      const cur = current.current
      if (!cur || !target) return
      cancelAnimationFrame(raf.current)
      const w = Math.min(target.w * 4, Math.max(target.w / 6, cur.w / factor))
      const h = w * (cur.h / cur.w)
      const wx = cur.x + fx * cur.w
      const wy = cur.y + fy * cur.h
      show({ x: wx - fx * w, y: wy - fy * h, w, h })
      setMoved(true)
    },
    [target, show],
  )

  // Pinch and ⌘/Ctrl + scroll zoom the diagram. Safari's gesture events are stopped so the page never zooms.
  useEffect(() => {
    const el = host.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-Math.max(-24, Math.min(24, e.deltaY)) * 0.012), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
    }
    const stop = (e: Event) => e.preventDefault()
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', stop)
    el.addEventListener('gesturechange', stop)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', stop)
      el.removeEventListener('gesturechange', stop)
    }
  }, [zoomAt])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    const cur = current.current
    if (!d || !cur || !host.current) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    if (!d.moved) {
      try {
        host.current.setPointerCapture(d.id)
      } catch {
        /* the pointer may already be gone */
      }
    }
    d.moved = true
    d.x = e.clientX
    d.y = e.clientY
    const r = host.current.getBoundingClientRect()
    cancelAnimationFrame(raf.current)
    show({ ...cur, x: cur.x - (dx * cur.w) / r.width, y: cur.y - (dy * cur.h) / r.height })
    setMoved(true)
  }
  const onPointerUp = () => {
    // A drag must not end as a click on an element under the pointer.
    if (drag.current?.moved) {
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation()
        ev.preventDefault()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
    }
    drag.current = null
  }

  const scale = vb && size.w ? size.w / vb.w : 1
  return (
    <div
      ref={host}
      className={`relative h-full w-full touch-none select-none ${drag.current?.moved ? 'cursor-grabbing' : 'cursor-grab'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={(e) => {
        if (e.key !== 'Tab' || e.altKey || e.metaKey || e.ctrlKey || !(e.target as Element).closest('[data-ref]')) return
        if (focusNextElement(e.currentTarget, e.target as Element, e.shiftKey)) e.preventDefault()
      }}
      onDoubleClick={(e) => {
        if ((e.target as Element).closest('[data-ref]')) return
        const r = host.current!.getBoundingClientRect()
        zoomAt(1.6, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
      }}
    >
      {vb && (
        <svg className="absolute inset-0 h-full w-full" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" aria-label={label}>
          {children}
        </svg>
      )}
      <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-lg border border-rule bg-raised/95 p-0.5 shadow-float backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomAt(1 / 1.3)} className="grid h-7 w-7 place-items-center rounded-md text-ink-2 hover:bg-sunken">
          <Minus size={14} />
        </button>
        <span className="font-tabular w-11 text-center text-[11.5px] text-ink-3">{Math.round(scale * 100)}%</span>
        <button type="button" aria-label="Zoom in" title="Zoom in (or pinch)" onClick={() => zoomAt(1.3)} className="grid h-7 w-7 place-items-center rounded-md text-ink-2 hover:bg-sunken">
          <Plus size={14} />
        </button>
        {moved && (
          <button type="button" onClick={() => (target ? (setMoved(false), glide(target)) : undefined)} className="h-7 rounded-md px-2 text-[12px] font-medium text-ink-2 hover:bg-sunken">
            Reset view
          </button>
        )}
        <PointButton className="h-7 w-7" />
      </div>
    </div>
  )
}

const cache = new WeakMap<object, Map<string, Promise<SceneBase>>>()

function useLayout(view: View, options: ViewLayoutOptions) {
  const doc = useDoc()
  const key = `${view.id}|${JSON.stringify(options)}`
  const [state, setState] = useState<{ key: string; scene: SceneBase } | null>(null)
  useEffect(() => {
    let live = true
    let perDoc = cache.get(doc)
    if (!perDoc) cache.set(doc, (perDoc = new Map()))
    let pending = perDoc.get(key)
    if (!pending) {
      pending = document.fonts.ready.then(() => layoutView(doc, view, options))
      perDoc.set(key, pending)
    }
    pending.then((scene) => live && setState({ key, scene }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, key])
  return state?.key === key ? state.scene : state?.scene
}

export interface SceneViewProps {
  view: View
  walkthrough?: Walkthrough
  marks: Map<string, ChangeState>
  mode: Mode
  /** Ref keys to frame and keep bright. Empty: the whole view. */
  focus: string[]
  /** Ref keys of the numbered callouts, in order. */
  callouts: string[]
  hot: string | null
  setHot(key: string | null): void
  maxScale?: number
  /** The walkthrough scene: its effects, badges and trace. */
  sceneData?: Scene
  /** The trace step shown, or null. */
  traceStep?: number | null
}

/** One view, drawn for a story: laid out, framed on its focus, with marks and callouts. */
export function SceneView({ view, walkthrough, marks, mode, focus, callouts, hot, setHot, maxScale, sceneData, traceStep = null }: SceneViewProps) {
  // The reader may open and close groups in a map; the document stays as it is.
  const [collapsed, setCollapsed] = useState<string[] | undefined>(undefined)
  useEffect(() => setCollapsed(undefined), [view])
  const toggleGroup = useCallback(
    (id: string) =>
      setCollapsed((cur) => {
        const base = cur ?? (view.type === 'map' ? view.collapsed : [])
        return base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
      }),
    [view],
  )
  const options = useMemo(() => ({ ...sceneLayoutOptions(view, walkthrough, focus), ...(collapsed ? { collapsed } : {}) }), [view, walkthrough, focus, collapsed])
  const scene = useLayout(view, options)
  const idx = useIndex()
  const whole = useMemo<Rect | null>(() => (scene ? sceneFrame(scene, view, focus, idx, walkthrough) : null), [scene, view, focus, idx, walkthrough])
  // While a trace plays, the camera follows the step: the line and the two things it joins.
  const step = traceStep !== null ? sceneData?.trace[traceStep]?.ref : undefined
  const frame = useMemo<Rect | null>(() => (scene && whole ? followFrame(scene, whole, step, idx, walkthrough) : whole), [scene, whole, step, idx, walkthrough])
  // Live facts (test coverage, recent changes) join the scene's own badges and effects.
  const facts = useOverlayFacts()
  const story = useMemo(
    () => ({
      ...storyState({
        marks,
        mode,
        view,
        focus,
        callouts,
        hot,
        setHot,
        idx,
        walkthrough,
        effects: [...(sceneData?.effects ?? []), ...facts.effects],
        badges: [...(sceneData?.badges ?? []), ...facts.badges],
        trace: sceneData?.trace,
        traceStep,
        animate: !reduced(),
      }),
      ...(view.type === 'map' ? { toggleGroup } : {}),
    }),
    [marks, mode, view, focus, callouts, hot, setHot, idx, walkthrough, toggleGroup, sceneData, traceStep, facts],
  )

  if (!scene || !frame) return <div className="grid h-full place-items-center text-ink-3">Drawing…</div>
  return (
    <StoryProvider value={story}>
        <div className="h-full" onContextMenu={onDiagramContextMenu(view.id)}>
        <Stage frame={frame} label={view.title} maxScale={maxScale}>
          {view.type === 'map' || view.type === 'sequence' || view.type === 'state' ? <SceneStory view={view} scene={scene} extra={walkthrough?.removed.entities} /> : <Fallback view={view} scene={scene} />}
        </Stage>
        </div>
    </StoryProvider>
  )
}

/** Other view types draw with their explorer renderer. */
function Fallback({ view, scene }: { view: View; scene: SceneBase }) {
  const module = diagramFor(view)
  if (!module) return null
  const R = module.Renderer
  return <R view={view} scene={scene} />
}
