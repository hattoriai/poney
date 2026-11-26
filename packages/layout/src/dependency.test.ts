import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDocument, type PoneyDocument } from '@hattoriai/poney-core'
import { commerce } from '@hattoriai/poney-examples'
import { ownership } from '@hattoriai/poney-ext-ownership'
import { layoutDependency } from './dependency'
import type { Point } from './types'

const docs: [string, PoneyDocument][] = [
  ['Kestrel', parseDocument(commerce, { extensions: [ownership] })],
  ['Poney', parseDocument(JSON.parse(readFileSync(new URL('../../../docs/poney/poney.poney', import.meta.url), 'utf8')))],
]

/** Points along a chain of cubic segments. */
function sample(d: Point[]): Point[] {
  const out: Point[] = []
  for (let i = 0; i + 3 < d.length; i += 3) {
    const [a, b, c, e] = d.slice(i, i + 4)
    for (let t = 0; t <= 1; t += 0.02) {
      const u = 1 - t
      out.push({
        x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * e.x,
        y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * e.y,
      })
    }
  }
  return out
}

describe('dependency layout', () => {
  for (const [name, doc] of docs)
    for (const view of doc.views.filter((v) => v.type === 'dependency'))
      it(`${name} ${view.id}: no edge passes behind a node`, () => {
        const scene = layoutDependency(doc, view as never)
        for (const e of scene.edges) {
          expect((e.d.length - 1) % 3).toBe(0)
          const others = scene.nodes.filter((n) => n.entityId !== e.source && n.entityId !== e.target)
          for (const p of sample(e.d))
            for (const n of others) {
              const inside = p.x > n.x + 2 && p.x < n.x + n.w - 2 && p.y > n.y + 2 && p.y < n.y + n.h - 2
              expect(inside, `${e.id} passes behind ${n.entityId} at ${Math.round(p.x)},${Math.round(p.y)}`).toBe(false)
            }
        }
      })
})
