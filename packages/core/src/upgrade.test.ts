import { describe, expect, it } from 'vitest'
import { validateDocument } from './validation/validate'
import { upgradeDocument } from './upgrade'

/** A 0.1.0 document that uses every name 0.2.0 changed. */
const old = () => ({
  poneyVersion: '0.1.0',
  project: { id: 'shop', name: 'Shop', description: '' },
  model: {
    entities: [
      { id: 'customer', kind: 'person', name: 'Customer', summary: '' },
      { id: 'orders', kind: 'module', name: 'Orders', summary: '' },
      { id: 'bus', kind: 'queue', name: 'Bus', summary: '' },
    ],
    dataTypes: [
      { id: 'order', kind: 'table', name: 'order', summary: '', fields: [{ name: 'id', type: 'uuid', primaryKey: true }] },
      { id: 'line', kind: 'table', name: 'line', summary: '', fields: [{ name: 'order_id', type: 'uuid', references: { dataType: 'order', field: 'id' } }] },
    ],
    dataRelations: [{ id: 'r', from: 'line', to: 'order', fromCardinality: 'many', toCardinality: 'one', label: 'belongs to' }],
    behaviors: [
      { kind: 'process', id: 'checkout', name: 'Checkout', summary: '', nodes: [{ id: 'a', kind: 'start', label: 'Start' }, { id: 'b', kind: 'action', label: 'Pay' }, { id: 'c', kind: 'end', label: 'Done' }], flows: [{ id: 'f1', from: 'a', to: 'b' }, { id: 'f2', from: 'b', to: 'c' }] },
      { kind: 'state-machine', id: 'life', name: 'Life', summary: '', states: [{ id: 's0', kind: 'initial', name: 'New' }, { id: 's1', kind: 'normal', name: 'Paid' }, { id: 's2', kind: 'final', name: 'Done' }], transitions: [{ id: 't1', from: 's0', to: 's1', event: 'pay' }, { id: 't2', from: 's1', to: 's2', event: 'ship' }] },
    ],
    capabilities: [{ id: 'buy', name: 'Buy', summary: '', area: 'Shop', actors: ['customer'] }],
  },
  views: [
    { id: 'uc', type: 'usecase', title: 'Use cases', description: '', category: 'capabilities', capabilities: ['buy'] },
    { id: 'act', type: 'activity', title: 'Checkout', description: '', category: 'behavior', process: 'checkout' },
  ],
  walkthroughs: [
    {
      id: 'w', kind: 'tour', title: 'Tour', summary: '', story: { text: 'x' },
      scenes: [{ id: 's', title: 'Buying', text: 'x', view: 'uc', focus: ['capability:buy'], badges: [{ target: 'entity:orders', text: '3 tries', tone: 'poney' }] }],
    },
  ],
  presentation: { kinds: { module: { shape: 'chip', tone: 'poney', icon: 'box', label: 'Module' }, queue: { shape: 'stack', tone: 'ochre', icon: 'waypoints', label: 'Our bus' } }, relationships: {} },
})

describe('upgrading a 0.1.0 document', () => {
  it('opens it with the 0.2.0 names', () => {
    const r = validateDocument(old())
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([])
    const d = r.document!
    expect(d.poneyVersion).toBe('0.2.0')
    expect(d.model.entities.map((e) => e.kind)).toEqual(['person', 'component', 'message-broker'])
    expect([d.model.dataRelations[0].fromCardinality, d.model.dataRelations[0].toCardinality]).toEqual(['zero-or-many', 'exactly-one'])
    expect(d.model.useCases.map((u) => u.id)).toEqual(['buy'])
    const [activity, life] = d.model.behaviors as any[]
    expect(activity.kind).toBe('activity')
    expect(activity.nodes.map((n: { kind: string }) => n.kind)).toEqual(['initial', 'action', 'final'])
    expect(life.states.map((s: { kind: string }) => s.kind)).toEqual(['initial', 'state', 'final'])
    expect(d.views.find((v) => v.id === 'uc')).toMatchObject({ category: 'use-cases', useCases: ['buy'] })
    expect(d.views.find((v) => v.id === 'act')).toMatchObject({ activity: 'checkout' })
    const scene = d.walkthroughs[0].scenes[0]
    expect(scene.focus).toEqual(['useCase:buy'])
    expect(scene.badges[0].tone).toBe('accent')
    // Styles move with their kind; an old default label follows, a label someone wrote stays.
    expect(d.presentation.kinds.component).toMatchObject({ label: 'Component', tone: 'accent' })
    expect(d.presentation.kinds['message-broker']).toMatchObject({ label: 'Our bus' })
  })

  it('leaves a current document as it is, and rejects old names in it', () => {
    const current = { ...old(), poneyVersion: '0.2.0' }
    expect(upgradeDocument(current)).toBe(current)
    const r = validateDocument(current)
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.path === 'model.entities.1.kind')).toBe(true)
  })

  it('does not change the document it was given', () => {
    const input = old()
    upgradeDocument(input)
    expect(input.poneyVersion).toBe('0.1.0')
    expect(input.model.entities[1].kind).toBe('module')
  })
})
