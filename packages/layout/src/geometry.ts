import type { Point, Rect } from './types'

/** An SVG path through orthogonal points with rounded corners. */
export function roundedPath(points: Point[], radius = 8): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y)
    const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const r = Math.min(radius, d1 / 2, d2 / 2)
    if (r < 0.5) {
      d += ` L ${p1.x} ${p1.y}`
      continue
    }
    const a = { x: p1.x - ((p1.x - p0.x) / d1) * r, y: p1.y - ((p1.y - p0.y) / d1) * r }
    const b = { x: p1.x + ((p2.x - p1.x) / d2) * r, y: p1.y + ((p2.y - p1.y) / d2) * r }
    d += ` L ${a.x} ${a.y} Q ${p1.x} ${p1.y} ${b.x} ${b.y}`
  }
  const last = points[points.length - 1]
  return `${d} L ${last.x} ${last.y}`
}

/** Shortens the last segment of a polyline so an arrowhead can sit on the end. */
export function trimEnd(points: Point[], by: number): Point[] {
  if (points.length < 2 || by <= 0) return points
  const out = points.slice()
  const a = out[out.length - 2]
  const b = out[out.length - 1]
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len <= by) return out
  out[out.length - 1] = { x: b.x - ((b.x - a.x) / len) * by, y: b.y - ((b.y - a.y) / len) * by }
  return out
}

export function trimStart(points: Point[], by: number): Point[] {
  return trimEnd(points.slice().reverse(), by).reverse()
}

/** Angle in radians of the last segment of a polyline. */
export function endAngle(points: Point[]): number {
  const a = points[points.length - 2]
  const b = points[points.length - 1]
  return Math.atan2(b.y - a.y, b.x - a.x)
}

export function startAngle(points: Point[]): number {
  const a = points[1]
  const b = points[0]
  return Math.atan2(b.y - a.y, b.x - a.x)
}

/** The midpoint of the longest segment — a calm place for a label. */
export function labelPoint(points: Point[]): Point & { horizontal: boolean } {
  let best = 0
  let bestLen = -1
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
    if (len > bestLen) {
      bestLen = len
      best = i
    }
  }
  const a = points[best]
  const b = points[best + 1] ?? a
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, horizontal: Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) }
}

/** The point at a fraction of a polyline's total length. */
export function pointAlong(points: Point[], t: number): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  let target = lengths.reduce((a, b) => a + b, 0) * t
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i]) {
      const f = lengths[i] === 0 ? 0 : target / lengths[i]
      return { x: points[i].x + (points[i + 1].x - points[i].x) * f, y: points[i].y + (points[i + 1].y - points[i].y) * f }
    }
    target -= lengths[i]
  }
  return points[points.length - 1]
}

export function union(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  const x2 = Math.max(...rects.map((r) => r.x + r.w))
  const y2 = Math.max(...rects.map((r) => r.y + r.h))
  return { x, y, w: x2 - x, h: y2 - y }
}

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
