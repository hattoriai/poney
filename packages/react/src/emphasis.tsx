/** @jsxRuntime automatic @jsxImportSource react */
import { refKey, parseRef, type EffectKind, type View } from '@poney/core'
import { bezier, measure, roundedPath, type MapScene, type Point, type Rect, type SceneBase, type SequenceScene, type StateScene } from '@poney/layout'
import { useStory } from './context'
import { Glyph } from './icons'
import { toneColor } from './tone'

/**
 * Emphasis: effects, badges and the trace, drawn over any story scene.
 *
 * The document says what a reader must see (data flows here, this is slow,
 * the request goes this way); this file decides how. Lines get a soft band
 * under them and moving dots on them; boxes get a ring and a sign; the trace
 * moves a token along its path. A still picture keeps every mark but the
 * motion. Readers who ask for less motion get no motion.
 */

/** A line in a scene: its path, and a point at any fraction of its length. */
export interface LineShape {
  d: string
  at(t: number): Point & { angle: number }
  /** Where a step mark sits, clear of the label. */
  stepAt: number
  /** Where a badge sits: under the line's label when it has one. */
  badge: Point
  /** Where a sign (slow, failing, blocked) sits: after the label when it has one. */
  sign: Point
}

/** The shape of every line in a scene, by ref key. Boxes come from the scene's anchors. */
export function sceneLines(scene: SceneBase, view: View): Map<string, LineShape> {
  const out = new Map<string, LineShape>()
  if (view.type === 'map') {
    for (const e of (scene as MapScene).edges) {
      const c = e.curve
      const shape: LineShape = {
        d: `M ${c[0].x} ${c[0].y} C ${c[1].x} ${c[1].y} ${c[2].x} ${c[2].y} ${c[3].x} ${c[3].y}`,
        at: (t) => {
          const p = bezier(c, t)
          const q = bezier(c, Math.min(1, t + 0.01))
          const o = bezier(c, Math.max(0, t - 0.01))
          return { ...p, angle: Math.atan2(q.y - o.y, q.x - o.x) }
        },
        stepAt: 0.18,
        badge: { x: e.label.x + e.label.w / 2, y: e.label.y + e.label.h + 13 },
        sign: { x: e.label.x + e.label.w + 13, y: e.label.y + e.label.h / 2 },
      }
      for (const r of e.relationships) out.set(`relationship:${r}`, shape)
    }
  }
  if (view.type === 'sequence') {
    const s = scene as SequenceScene
    for (const m of s.messages) {
      const pts = m.loop
        ? [
            { x: m.loop.x, y: m.loop.y1 },
            { x: m.loop.x + m.loop.w, y: m.loop.y1 },
            { x: m.loop.x + m.loop.w, y: m.loop.y2 },
            { x: m.loop.x + 8, y: m.loop.y2 },
          ]
        : [
            { x: m.x1, y: m.y },
            { x: m.x2, y: m.y },
          ]
      const line = polyline(pts, 0)
      const len = Math.abs(m.x2 - m.x1) || 60
      const mid = line.at(0.5)
      out.set(`message:${s.interactionId}:${m.id}`, { ...line, stepAt: Math.min(0.4, 22 / len), badge: m.loop ? { x: m.loop.x + m.loop.w + 40, y: m.loop.y2 + 14 } : { x: mid.x, y: mid.y + 15 }, sign: m.loop ? line.at(0.5) : { x: line.at(0.9).x, y: m.y + 15 } })
    }
  }
  if (view.type === 'state') {
    const s = scene as StateScene
    for (const t of s.transitions) {
      const line = polyline(t.points, 18)
      const mid = line.at(0.5)
      out.set(`transition:${s.machineId}:${t.id}`, { ...line, stepAt: 0.22, badge: t.label ? { x: t.label.x + t.label.w / 2, y: t.label.y + t.label.h + 13 } : { x: mid.x, y: mid.y + 15 }, sign: t.label ? { x: t.label.x + t.label.w + 13, y: t.label.y + t.label.h / 2 } : line.at(0.3) })
    }
  }
  return out
}

function polyline(points: Point[], radius: number): Omit<LineShape, 'stepAt' | 'badge' | 'sign'> {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  const total = lengths.reduce((a, b) => a + b, 0) || 1
  return {
    d: radius ? roundedPath(points, radius) : `M ${points.map((p) => `${p.x} ${p.y}`).join(' L ')}`,
    at(t) {
      let left = Math.max(0, Math.min(1, t)) * total
      for (let i = 0; i < lengths.length; i++) {
        const a = points[i]
        const b = points[i + 1]
        if (left <= lengths[i] || i === lengths.length - 1) {
          const f = lengths[i] ? Math.min(1, left / lengths[i]) : 0
          return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: Math.atan2(b.y - a.y, b.x - a.x) }
        }
        left -= lengths[i]
      }
      return { ...points[0], angle: 0 }
    },
  }
}

const DEFAULT_COLOR: Record<EffectKind, string> = {
  flow: 'var(--poney-lapis)',
  attention: 'var(--poney-accent)',
  'hot-path': 'var(--poney-accent)',
  slow: 'var(--poney-ochre)',
  failing: 'var(--poney-failure)',
  blocked: 'var(--poney-failure)',
}
const colorOf = (as: EffectKind, tone?: string) => (tone ? toneColor(tone) : DEFAULT_COLOR[as])
const keyOf = (k: string) => {
  const r = parseRef(k)
  return r ? refKey(r) : k
}
const isBox = (k: string) => /^(entity|state|dataType|activityNode|capability):/.test(k)

/** Bands under lines: drawn before the scene, so they never cover a label. */
export function EmphasisUnder({ scene, view }: { scene: SceneBase; view: View }) {
  const s = useStory()
  if (!s.effects?.size) return null
  const lines = sceneLines(scene, view)
  const out: JSX.Element[] = []
  s.effects.forEach((effects, key) => {
    const line = lines.get(key)
    if (!line) return
    for (const e of effects) {
      if (e.as === 'flow') continue
      const strong = e.as === 'hot-path'
      out.push(
        <path
          key={`${key}-${e.as}`}
          d={line.d}
          fill="none"
          stroke={colorOf(e.as, e.tone)}
          strokeOpacity={strong ? 0.3 : 0.2}
          strokeWidth={strong ? 9 : 11}
          strokeLinecap="round"
          strokeDasharray={e.as === 'slow' ? '1 14' : undefined}
          className={e.as === 'attention' ? 'poney-pulse' : undefined}
        />,
      )
    }
  })
  return <g pointerEvents="none">{out}</g>
}

/** Marks over the scene: moving dots, rings, signs, badges and the trace. */
export function EmphasisOver({ scene, view }: { scene: SceneBase; view: View }) {
  const s = useStory()
  const lines = sceneLines(scene, view)
  // A part inside a closed group borrows the group's box; its marks are not the group's, so they are not drawn.
  const box = (key: string): Rect | undefined => {
    const rect = isBox(key) ? (scene.anchors[key] as (Rect & { entityId?: string }) | undefined) : undefined
    return rect?.entityId && key.startsWith('entity:') && rect.entityId !== key.slice('entity:'.length) ? undefined : rect
  }
  const out: JSX.Element[] = []

  s.effects?.forEach((effects, key) => {
    const line = lines.get(key)
    const rect = box(key)
    effects.forEach((e, i) => {
      const color = colorOf(e.as, e.tone)
      const id = `${key}-${e.as}-${i}`
      if (line) {
        if (e.as === 'flow') out.push(<path key={id} d={line.d} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeDasharray="0.1 11" className="poney-flow" />)
        if (e.as === 'slow' || e.as === 'failing' || e.as === 'blocked') {
          out.push(<Sign key={id} as={e.as} x={line.sign.x} y={line.sign.y} color={color} />)
        }
      } else if (rect) {
        const pad = 6
        out.push(
          <rect
            key={id}
            x={rect.x - pad}
            y={rect.y - pad}
            width={rect.w + pad * 2}
            height={rect.h + pad * 2}
            rx={Math.min(20, (rect.h + pad * 2) / 2)}
            fill="none"
            stroke={color}
            strokeWidth={e.as === 'hot-path' ? 2.5 : 2}
            strokeDasharray={e.as === 'blocked' ? '6 4' : e.as === 'slow' ? '2 4' : undefined}
            strokeLinecap="round"
            className={e.as === 'attention' ? 'poney-pulse' : undefined}
          />,
        )
        if (e.as === 'slow' || e.as === 'failing' || e.as === 'blocked') out.push(<Sign key={`${id}-s`} as={e.as} x={rect.x + rect.w + 2} y={rect.y + rect.h + 2} color={color} />)
      }
    })
  })

  s.badges?.forEach((badges, key) => {
    const line = lines.get(key)
    const rect = box(key)
    let x = 0
    let y = 0
    if (line) {
      x = line.badge.x
      y = line.badge.y
    } else if (rect) {
      x = rect.x + rect.w / 2
      y = rect.y + rect.h
    } else return
    const widths = badges.map((b) => measure(b.text, 11, 600) + 16)
    let left = x - (widths.reduce((a, b) => a + b, 0) + (badges.length - 1) * 4) / 2
    badges.forEach((b, i) => {
      const color = b.tone ? toneColor(b.tone) : 'var(--poney-ink-2)'
      out.push(
        <g key={`b-${key}-${i}`} transform={`translate(${left} ${y - 10})`}>
          <rect width={widths[i]} height={20} rx={10} fill="var(--poney-paper-raised)" stroke={color} strokeWidth={1.1} />
          <text x={widths[i] / 2} y={14} textAnchor="middle" fontSize={11} fontWeight={600} fill={color} className="poney-numbers">
            {b.text}
          </text>
        </g>,
      )
      left += widths[i] + 4
    })
  })

  const trace = s.trace
  if (trace?.steps.length) {
    if (trace.current === null && trace.numbered) {
      // A still picture numbers the path.
      trace.steps.forEach((k, i) => {
        const line = lines.get(k)
        const rect = box(k)
        const p = line ? line.at(line.stepAt) : rect ? { x: rect.x + 14, y: rect.y + rect.h - 2 } : undefined
        if (p) out.push(<StepMark key={`t-${i}`} n={i + 1} x={p.x} y={p.y} />)
      })
    } else if (trace.current !== null) {
      const k = trace.steps[trace.current]
      const line = lines.get(k)
      const rect = box(k)
      if (line)
        out.push(
          <g key={`token-${trace.current}`}>
            <circle r={7} fill="var(--poney-accent)" stroke="var(--poney-paper-raised)" strokeWidth={2.5}>
              {trace.animate ? (
                <animateMotion dur="0.9s" fill="freeze" path={line.d} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.2 1" />
              ) : null}
            </circle>
            {!trace.animate && <circle cx={line.at(1).x} cy={line.at(1).y} r={7} fill="var(--poney-accent)" stroke="var(--poney-paper-raised)" strokeWidth={2.5} />}
          </g>,
        )
      else if (rect)
        out.push(<rect key={`token-${trace.current}`} x={rect.x - 7} y={rect.y - 7} width={rect.w + 14} height={rect.h + 14} rx={20} fill="none" stroke="var(--poney-accent)" strokeWidth={2.5} className={trace.animate ? 'poney-pulse' : undefined} />)
    }
  }
  return out.length ? <g pointerEvents="none">{out}</g> : null
}

/** A small round sign on a line or a box: a clock for slow, a cross for failing, a bar for blocked. */
function Sign({ as, x, y, color }: { as: 'slow' | 'failing' | 'blocked'; x: number; y: number; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={10} fill="var(--poney-paper-raised)" stroke={color} strokeWidth={1.6} />
      {as === 'slow' && <Glyph name="timer" x={x - 6.5} y={y - 6.5} size={13} color={color} />}
      {as === 'failing' && <path d={`M ${x - 3.6} ${y - 3.6} L ${x + 3.6} ${y + 3.6} M ${x + 3.6} ${y - 3.6} L ${x - 3.6} ${y + 3.6}`} stroke={color} strokeWidth={2} strokeLinecap="round" />}
      {as === 'blocked' && <path d={`M ${x - 4.5} ${y} L ${x + 4.5} ${y}`} stroke={color} strokeWidth={2.4} strokeLinecap="round" />}
    </g>
  )
}

/** Steps of a path are lettered (A, B, C), so they never read as a callout or a message number. */
export const stepLetter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`)

/** A step of the path, lettered in a rounded square. */
function StepMark({ n, x, y }: { n: number; x: number; y: number }) {
  return (
    <g>
      <rect x={x - 8.5} y={y - 8.5} width={17} height={17} rx={5} fill="var(--poney-accent)" stroke="var(--poney-paper-raised)" strokeWidth={1.75} />
      <text x={x} y={y + 3.8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--poney-paper-raised)" className="poney-numbers">
        {stepLetter(n - 1)}
      </text>
    </g>
  )
}

export { keyOf as emphasisKey }
