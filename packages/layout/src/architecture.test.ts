import { describe, expect, it } from 'vitest'
import { parseDocument, type ViewOf } from '@hattoriai/poney-core'
import { commerce } from '@hattoriai/poney-examples'
import { ownership } from '@hattoriai/poney-ext-ownership'
import { layoutArchitecture } from './architecture'

const doc = parseDocument(commerce, { extensions: [ownership] })
const view = doc.views.find((v) => v.id === 'architecture') as ViewOf<'architecture'>

describe('architecture layout', () => {
  it('nests children inside their containers in root coordinates', async () => {
    const scene = await layoutArchitecture(doc, view)
    const byId = new Map(scene.nodes.map((n) => [n.id, n]))
    for (const n of scene.nodes) {
      if (!n.parent) continue
      const p = byId.get(n.parent)!
      expect(n.x).toBeGreaterThanOrEqual(p.x)
      expect(n.y).toBeGreaterThanOrEqual(p.y)
      expect(n.x + n.w).toBeLessThanOrEqual(p.x + p.w + 0.5)
      expect(n.y + n.h).toBeLessThanOrEqual(p.y + p.h + 0.5)
    }
  })

  it('starts and ends edges on their nodes', async () => {
    const scene = await layoutArchitecture(doc, view)
    const byId = new Map(scene.nodes.map((n) => [n.id, n]))
    const near = (pt: { x: number; y: number }, id: string) => {
      const r = byId.get(id)!
      return pt.x >= r.x - 1 && pt.x <= r.x + r.w + 1 && pt.y >= r.y - 1 && pt.y <= r.y + r.h + 1
    }
    expect(scene.edges.length).toBeGreaterThan(10)
    for (const e of scene.edges) {
      expect(near(e.points[0], e.source)).toBe(true)
      expect(near(e.points[e.points.length - 1], e.target)).toBe(true)
    }
  })

  it('lifts edges to a collapsed system', async () => {
    const scene = await layoutArchitecture(doc, view, { collapsed: ['kestrel'] })
    expect(scene.nodes.map((n) => n.id).sort()).toEqual(['customer', 'kestrel', 'paystream', 'postbox', 'store-operator'])
    expect(scene.edges.find((e) => e.source === 'kestrel' && e.target === 'paystream')).toBeTruthy()
    expect(scene.anchors['entity:payment-service']).toEqual(scene.anchors['entity:kestrel'])
  })
})
