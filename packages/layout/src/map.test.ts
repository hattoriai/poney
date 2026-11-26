import { describe, expect, it } from 'vitest'
import { parseDocument, type ViewOf } from '@poney/core'
import { commerce } from '@poney/examples'
import { ownership } from '@poney/ext-ownership'
import { layoutMap } from './map'
import { layoutSequence } from './sequence'

const doc = parseDocument(commerce, { extensions: [ownership] })
const map = doc.views.find((v) => v.id === 'retry-map') as ViewOf<'map'>

const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

describe('map layout', () => {
  it('draws a line through a pass-through entity, and no box for it', async () => {
    const scene = await layoutMap(doc, map)
    expect(scene.nodes.some((n) => n.entityId === 'api-gateway')).toBe(false)
    const through = scene.edges.find((e) => e.via === 'api-gateway')
    expect(through).toMatchObject({ source: 'storefront', target: 'order-service', relationships: ['r-storefront-gateway', 'r-gateway-order'] })
    expect(through?.label.sub).toBe('through API gateway')
  })

  it('never puts a label on the boxes its line connects', async () => {
    const scene = await layoutMap(doc, map)
    for (const e of scene.edges)
      for (const n of scene.nodes.filter((x) => x.entityId === e.source || x.entityId === e.target)) expect(overlap(e.label, n), `${e.id} label on ${n.entityId}`).toBe(false)
  })

  it('keeps most labels clear of every box', async () => {
    const scene = await layoutMap(doc, map)
    const crowded = scene.edges.filter((e) => scene.nodes.some((n) => overlap(e.label, n)))
    expect(crowded.length).toBeLessThanOrEqual(1)
  })
})

describe('focused sequence', () => {
  it('keeps only the focused messages and their participants', () => {
    const view = doc.views.find((v) => v.id === 'checkout-sequence') as ViewOf<'sequence'>
    const scene = layoutSequence(doc, view, { only: ['c20', 'c21', 'c22'], compact: true })
    expect(scene.messages.map((m) => [m.id, m.number])).toEqual([
      ['c20', 20],
      ['c21', 21],
      ['c22', 22],
    ])
    expect(scene.participants.map((p) => p.entityId)).toEqual(['api-gateway', 'order-service', 'payment-service'])
    expect(scene.fragments.map((f) => f.id)).toEqual(['c-alt'])
  })
})

describe('map groups', () => {
  const grouped = parseDocument({
    poneyVersion: '0.1.0',
    project: { id: 'g', name: 'Groups' },
    model: {
      entities: [
        { id: 'web', kind: 'web-app', name: 'Web app', summary: 'UI' },
        { id: 'api', kind: 'service', name: 'API', summary: 'Backend' },
        { id: 'auth', kind: 'module', name: 'Auth', summary: 'Sign-in', parent: 'api' },
        { id: 'notes', kind: 'module', name: 'Notes', summary: 'Notes', parent: 'api' },
        { id: 'db', kind: 'database', name: 'Database', summary: 'Rows' },
      ],
      relationships: [
        { id: 'r1', kind: 'calls', source: 'web', target: 'auth', label: 'Signs in' },
        { id: 'r2', kind: 'calls', source: 'web', target: 'notes', label: 'Saves notes' },
        { id: 'r3', kind: 'reads-writes', source: 'notes', target: 'db', label: 'Stores notes' },
        { id: 'r4', kind: 'calls', source: 'notes', target: 'auth', label: 'Checks the user' },
      ],
    },
    views: [{ id: 'm', type: 'map', title: 'Map', description: '', category: 'system', entities: ['web', 'api', 'auth', 'notes', 'db'] }],
  })
  const view = grouped.views[0] as ViewOf<'map'>
  const inside = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h

  it('draws an entity inside its parent', async () => {
    const scene = await layoutMap(grouped, view)
    expect(scene.groups.map((g) => g.entityId)).toEqual(['api'])
    const api = scene.groups[0]
    for (const id of ['auth', 'notes']) expect(inside(scene.nodes.find((n) => n.entityId === id)!, api), id).toBe(true)
    expect(inside(scene.nodes.find((n) => n.entityId === 'db')!, api)).toBe(false)
    expect(scene.edges).toHaveLength(4)
  })

  it('draws a closed group as one box, and joins its lines there', async () => {
    const scene = await layoutMap(grouped, view, { collapsed: ['api'] })
    expect(scene.groups).toEqual([])
    expect(scene.nodes.find((n) => n.entityId === 'api')?.members).toEqual(['auth', 'notes'])
    expect(scene.nodes.some((n) => n.entityId === 'auth')).toBe(false)
    const web = scene.edges.find((e) => e.source === 'web')!
    expect(web).toMatchObject({ target: 'api', relationships: ['r1', 'r2'] })
    expect(web.label.text).toBe('Signs in, Saves notes')
    expect(scene.edges.find((e) => e.target === 'db')?.label.text).toBe('Stores notes')
    expect(scene.edges.some((e) => e.relationships.includes('r4'))).toBe(false)
    expect(scene.anchors['entity:auth']).toEqual(scene.anchors['entity:api'])
  })
})
