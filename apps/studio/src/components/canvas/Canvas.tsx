import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Maximize, Minus, Plus, Scan } from 'lucide-react'
import { useStudio } from '@/features/store'
import { parseRef, refKey, type Ref } from '@poney/core'
import { focusNextElement } from '@/renderers/shared/interaction'
import type { Rect, SceneBase } from '@/renderers/types'
import { Tooltip } from './Tooltip'
import { PointButton } from '@/components/agent/PointButton'
import { ToolbarButton, ToolbarDivider } from '@/components/shared/Toolbar'

export interface Transform {
  x: number
  y: number
  k: number
}

const MIN_ZOOM = 0.15
const MAX_ZOOM = 3
const PADDING = 56
const remembered = new Map<string, Transform>()

const ZoomContext = createContext(1)
/** The current zoom level, for level-of-detail rendering. */
export const useZoom = () => useContext(ZoomContext)

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface CanvasProps {
  viewId: string
  scene: SceneBase
  label: string
  children: ReactNode
  /** Diagram-specific controls, shown in the floating toolbar. */
  tools?: ReactNode
  /** Small overlay in the top-left corner, such as a legend. */
  overlay?: ReactNode
  /** First view: fit everything, or start at the top left at a readable size. */
  initial?: 'fit' | 'start'
}

export function Canvas({ viewId, scene, label, children, tools, overlay, initial = 'fit' }: CanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [t, setT] = useState<Transform>(() => remembered.get(viewId) ?? { x: 0, y: 0, k: 1 })
  const tRef = useRef(t)
  const anim = useRef<number>(0)
  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const select = useStudio((s) => s.select)
  const selection = useStudio((s) => s.selection)
  const focus = useStudio((s) => s.focus)
  const lastFocus = useRef<number>(0)
  const fitted = useRef<string | null>(null)

  const apply = useCallback(
    (next: Transform) => {
      tRef.current = next
      remembered.set(viewId, next)
      setT(next)
    },
    [viewId],
  )

  const animateTo = useCallback(
    (target: Transform) => {
      cancelAnimationFrame(anim.current)
      if (reducedMotion()) return apply(target)
      const from = tRef.current
      const start = performance.now()
      const duration = 380
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / duration)
        const e = 1 - Math.pow(1 - p, 3)
        apply({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e })
        if (p < 1) anim.current = requestAnimationFrame(step)
      }
      anim.current = requestAnimationFrame(step)
    },
    [apply],
  )

  const frame = useCallback(
    (r: Rect, maxZoom = 1.1): Transform => {
      const { w, h } = size
      const k = clamp(Math.min((w - PADDING * 2) / Math.max(r.w, 1), (h - PADDING * 2) / Math.max(r.h, 1), maxZoom), MIN_ZOOM, MAX_ZOOM)
      return { k, x: w / 2 - (r.x + r.w / 2) * k, y: h / 2 - (r.y + r.h / 2) * k }
    },
    [size],
  )

  const fitTransform = useCallback(() => frame({ x: 0, y: 0, w: scene.width, h: scene.height }, 1), [frame, scene.width, scene.height])

  const zoomAt = useCallback(
    (factor: number, cx = size.w / 2, cy = size.h / 2, animate = false) => {
      const cur = tRef.current
      const k = clamp(cur.k * factor, MIN_ZOOM, MAX_ZOOM)
      const next = { k, x: cx - ((cx - cur.x) / cur.k) * k, y: cy - ((cy - cur.y) / cur.k) * k }
      if (animate) animateTo(next)
      else apply(next)
    },
    [size, apply, animateTo],
  )

  const anchorFor = useCallback(
    (ref: Ref): Rect | undefined => {
      const direct = scene.anchors[refKey(ref)]
      if (direct) return direct
      if (ref.kind === 'dataType' && ref.field) return scene.anchors[refKey({ kind: 'dataType', id: ref.id })]
      return undefined
    },
    [scene.anchors],
  )

  // Track the canvas size.
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // First time a view appears at a usable size: restore its viewport or fit it.
  useLayoutEffect(() => {
    if (!size.w || !size.h) return
    if (fitted.current === viewId) return
    fitted.current = viewId
    const saved = remembered.get(viewId)
    const fit = fitTransform()
    apply(saved ?? (initial === 'start' && fit.k < 0.7 ? { k: 0.85, x: PADDING / 2, y: PADDING / 2 } : fit))
  }, [size, viewId, fitTransform, apply, initial])

  // Focus requests from the store: fit, reset, center on or zoom to an element.
  useEffect(() => {
    if (!focus || !size.w || focus.nonce === lastFocus.current) return
    lastFocus.current = focus.nonce
    if (focus.mode === 'fit') return animateTo(fitTransform())
    if (focus.mode === 'reset') {
      const fit = fitTransform()
      return animateTo({ k: 1, x: size.w / 2 - (scene.width / 2), y: fit.k < 1 ? PADDING : fit.y })
    }
    if (!focus.ref) return
    const r = anchorFor(focus.ref)
    if (!r) return
    const cur = tRef.current
    // Never leave empty space above or left of the diagram's top-left corner.
    const clampTop = (t: Transform): Transform => ({ ...t, x: Math.min(t.x, PADDING), y: Math.min(t.y, PADDING) })
    if (focus.mode === 'zoom') return animateTo(clampTop(frame({ x: r.x - 80, y: r.y - 80, w: r.w + 160, h: r.h + 160 }, 1.6)))
    // Center only when the element is outside the comfortable middle of the screen.
    const sx = r.x * cur.k + cur.x
    const sy = r.y * cur.k + cur.y
    const inView = sx > 40 && sy > 40 && sx + r.w * cur.k < size.w - 40 && sy + r.h * cur.k < size.h - 40
    if (inView && cur.k >= 0.6) return
    const k = Math.max(cur.k, 0.8)
    animateTo(clampTop({ k, x: size.w / 2 - (r.x + r.w / 2) * k, y: size.h / 2 - (r.y + r.h / 2) * k }))
  }, [focus, size, anchorFor, animateTo, fitTransform, frame, scene.width])

  // Wheel: scroll pans, pinch or ctrl/cmd + scroll zooms around the pointer.
  useEffect(() => {
    const el = host.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      cancelAnimationFrame(anim.current)
      const rect = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.0045), e.clientX - rect.left, e.clientY - rect.top)
      } else {
        const cur = tRef.current
        apply({ ...cur, x: cur.x - e.deltaX, y: cur.y - e.deltaY })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, apply])

  // Keyboard zoom and pan while the canvas has focus.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && !e.altKey && !e.metaKey && !e.ctrlKey) {
      // Tab moves between the diagram's elements in reading order, and keeps the focused one in view.
      const from = e.target === e.currentTarget ? null : (e.target as Element)
      const start = from ?? (selection ? e.currentTarget.querySelector(`[data-ref="${CSS.escape(refKey(selection))}"]`) : null)
      const el = focusNextElement(e.currentTarget, start, e.shiftKey)
      if (el) {
        e.preventDefault()
        const ref = parseRef(el.getAttribute('data-ref')!)
        if (ref) useStudio.getState().requestFocus('center', ref)
      }
      return
    }
    if (e.target !== e.currentTarget && !(e.target instanceof SVGElement)) return
    const step = e.shiftKey ? 160 : 60
    const cur = tRef.current
    switch (e.key) {
      case '+':
      case '=':
        zoomAt(1.25, undefined, undefined, true)
        break
      case '-':
      case '_':
        zoomAt(0.8, undefined, undefined, true)
        break
      case 'ArrowLeft':
        if (e.target !== e.currentTarget) return
        apply({ ...cur, x: cur.x + step })
        break
      case 'ArrowRight':
        if (e.target !== e.currentTarget) return
        apply({ ...cur, x: cur.x - step })
        break
      case 'ArrowUp':
        if (e.target !== e.currentTarget) return
        apply({ ...cur, y: cur.y + step })
        break
      case 'ArrowDown':
        if (e.target !== e.currentTarget) return
        apply({ ...cur, y: cur.y - step })
        break
      default:
        return
    }
    e.preventDefault()
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    const onElement = (e.target as Element).closest('[data-ref]')
    if (onElement && e.button === 0) return
    cancelAnimationFrame(anim.current)
    drag.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const rect = host.current!.getBoundingClientRect()
    pointer.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 3) return
    if (!d.moved) host.current!.setPointerCapture(d.id)
    d.moved = true
    d.x = e.clientX
    d.y = e.clientY
    const cur = tRef.current
    apply({ ...cur, x: cur.x + dx, y: cur.y + dy })
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (d && !d.moved) select(null)
  }

  const gridSize = 22 * t.k

  return (
    <ZoomContext.Provider value={t.k}>
      <div
        ref={host}
        className="relative h-full w-full touch-none select-none overflow-hidden outline-none"
        style={{
          backgroundColor: 'var(--plaster)',
          backgroundImage: gridSize > 7 ? 'radial-gradient(var(--plaster-dot) 1px, transparent 1.2px)' : undefined,
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${t.x}px ${t.y}px`,
          cursor: drag.current?.moved ? 'grabbing' : 'default',
        }}
        tabIndex={0}
        role="application"
        aria-roledescription="diagram canvas"
        aria-label={`${label}. Use Tab to move between elements, Enter to select, plus and minus to zoom, arrow keys to pan.`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={(e) => {
          if (!(e.target as Element).closest('[data-ref]')) animateTo(fitTransform())
        }}
      >
        <svg className="absolute inset-0 h-full w-full" role="group" aria-label={label}>
          <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>{children}</g>
        </svg>
        {overlay && <div className="pointer-events-none absolute left-4 top-4">{overlay}</div>}
        <Tooltip pointer={pointer} />
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-rule bg-raised/95 p-1 shadow-float backdrop-blur">
          <ToolbarButton label="Zoom out" shortcut="−" onClick={() => zoomAt(0.8, undefined, undefined, true)}>
            <Minus size={15} />
          </ToolbarButton>
          <button
            type="button"
            className="font-tabular h-8 w-12 rounded-md text-[12px] text-ink-2 hover:bg-sunken"
            onClick={() => useStudio.getState().requestFocus('reset')}
            title="Reset to 100%"
            aria-label={`Zoom ${Math.round(t.k * 100)} percent. Reset to 100 percent`}
          >
            {Math.round(t.k * 100)}%
          </button>
          <ToolbarButton label="Zoom in" shortcut="+" onClick={() => zoomAt(1.25, undefined, undefined, true)}>
            <Plus size={15} />
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton label="Fit to view" shortcut="⇧1" onClick={() => animateTo(fitTransform())}>
            <Maximize size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Zoom to selection"
            shortcut="F"
            onClick={() => {
              const sel = useStudio.getState().selection
              if (sel) useStudio.getState().requestFocus('zoom', sel)
            }}
          >
            <Scan size={15} />
          </ToolbarButton>
          <PointButton size={15} className="h-8 w-8" />
          {tools && (
            <>
              <ToolbarDivider />
              {tools}
            </>
          )}
        </div>
      </div>
    </ZoomContext.Provider>
  )
}
