/** @jsxRuntime automatic */
/** @jsxImportSource @hattoriai/poney-diagrams */
import { endAngle, measure, roundedPath, startAngle, trimEnd, type Point } from '@hattoriai/poney-layout'

export type Head = 'arrow' | 'open-arrow' | 'triangle' | 'none'

/** Arrowhead geometry drawn as a path, so it always matches the line color. */
export function ArrowHead({ at, angle, kind, color, size = 8 }: { at: Point; angle: number; kind: Head; color: string; size?: number }) {
  if (kind === 'none') return null
  const w = kind === 'triangle' ? size * 0.75 : size * 0.55
  const l = kind === 'triangle' ? size * 1.25 : size
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const p = (dx: number, dy: number) => `${at.x + dx * cos - dy * sin},${at.y + dx * sin + dy * cos}`
  if (kind === 'open-arrow')
    return <polyline points={`${p(-l, -w)} ${p(0, 0)} ${p(-l, w)}`} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  if (kind === 'triangle') return <polygon points={`${p(0, 0)} ${p(-l, -w)} ${p(-l, w)}`} fill="var(--poney-paper-raised)" stroke={color} strokeWidth={1.3} strokeLinejoin="round" />
  return <polygon points={`${p(0, 0)} ${p(-l, -w)} ${p(-l * 0.72, 0)} ${p(-l, w)}`} fill={color} />
}

export interface EdgeStyle {
  color: string
  width: number
  dash?: string
  head: Head
  tail?: Head
  opacity?: number
  flowing?: boolean
}

/** A routed edge with an invisible wide hit area for easy pointing. */
export function EdgeLine({ points, style, radius = 8 }: { points: Point[]; style: EdgeStyle; radius?: number }) {
  const headLen = style.head === 'none' ? 0 : style.head === 'triangle' ? 10 : 6
  const visible = trimEnd(points, headLen)
  const d = roundedPath(visible, radius)
  return (
    <g opacity={style.opacity ?? 1}>
      <path d={roundedPath(points, radius)} fill="none" stroke="transparent" strokeWidth={14} />
      <path
        d={d}
        className={`poney-edge ${style.flowing ? 'poney-flowing' : ''}`}
        fill="none"
        stroke={style.color}
        strokeWidth={style.width}
        strokeDasharray={style.flowing ? undefined : style.dash}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <ArrowHead at={points[points.length - 1]} angle={endAngle(points)} kind={style.head} color={style.color} />
      {style.tail && style.tail !== 'none' && <ArrowHead at={points[0]} angle={startAngle(points)} kind={style.tail} color={style.color} />}
    </g>
  )
}

/** A label pill centered on a point. */
export function EdgeLabel({
  at,
  text,
  secondary,
  tone = 'var(--poney-ink-2)',
  strong,
  size = 11.5,
}: {
  at: Point
  text: string
  secondary?: string
  tone?: string
  strong?: boolean
  size?: number
}) {
  const w1 = measure(text, size, strong ? 600 : 500)
  const w2 = secondary ? measure(secondary, size - 1, 400) : 0
  const w = Math.max(w1, w2) + size * 1.2
  const h = secondary ? size * 3 : size * 1.75
  return (
    <g transform={`translate(${at.x - w / 2} ${at.y - h / 2})`} pointerEvents="none">
      <rect width={w} height={h} rx={size / 2} fill="var(--poney-paper-raised)" stroke={strong ? tone : 'var(--poney-rule)'} strokeWidth={strong ? 1.2 : 1} />
      <text x={w / 2} y={size * 1.22} textAnchor="middle" fontSize={size} fontWeight={strong ? 600 : 500} fill={strong ? tone : 'var(--poney-ink-2)'}>
        {text}
      </text>
      {secondary && (
        <text x={w / 2} y={size * 2.4} textAnchor="middle" fontSize={size - 1} fill="var(--poney-ink-3)">
          {secondary}
        </text>
      )}
    </g>
  )
}

/** Size of an EdgeLabel, for layouts that reserve space. */
export function labelSize(text: string, secondary?: string, size = 11.5) {
  const w = Math.max(measure(text, size, 600), secondary ? measure(secondary, size - 1, 400) : 0) + 14
  return { width: w, height: secondary ? 34 : 20 }
}
