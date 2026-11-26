import { describe, expect, it } from 'vitest'
import { commerce } from '@poney/examples'
import { ownership } from '@poney/ext-ownership'
import { validateDocument } from '../validation/validate'
import { applyCommand, CommandError, scopeOf } from './commands'
import { createHistory, execute, redo, undo } from './history'

const load = () => {
  const r = validateDocument(commerce, { extensions: [ownership] })
  if (!r.ok) throw new Error('sample model is invalid')
  return r.document
}

describe('commands', () => {
  it('updates an entity without touching the original document', () => {
    const doc = load()
    const next = applyCommand(doc, { type: 'entity.update', id: 'payment-service', changes: { name: 'Payments' } })
    expect(next.model.entities.find((e) => e.id === 'payment-service')?.name).toBe('Payments')
    expect(doc.model.entities.find((e) => e.id === 'payment-service')?.name).toBe('Payment service')
    // Untouched parts are shared, not copied.
    expect(next.views).toBe(doc.views)
  })

  it('rejects a relationship to an unknown entity', () => {
    const doc = load()
    expect(() =>
      applyCommand(doc, {
        type: 'relationship.add',
        relationship: { id: 'r-new', kind: 'calls', source: 'order-service', target: 'ghost', label: 'x', data: [], metadata: {}, ext: {} },
      }),
    ).toThrow(CommandError)
  })

  it('removes relationships and view references with an entity', () => {
    const doc = load()
    const next = applyCommand(doc, { type: 'entity.remove', id: 'postbox' })
    expect(next.model.relationships.some((r) => r.target === 'postbox')).toBe(false)
    const deps = next.views.find((v) => v.id === 'service-dependencies')
    expect(deps?.type === 'dependency' && deps.entities.includes('postbox')).toBe(false)
  })

  it('refuses to remove an entity that still contains others', () => {
    expect(() => applyCommand(load(), { type: 'entity.remove', id: 'order-service' })).toThrow(/children/)
  })

  it('keeps layout changes separate from semantics', () => {
    const doc = load()
    const command = { type: 'layout.move', viewId: 'architecture', elementId: 'redis', position: { x: 10, y: 20 } } as const
    expect(scopeOf(command)).toBe('layout')
    const next = applyCommand(doc, command)
    expect(next.model).toBe(doc.model)
    expect(next.views.find((v) => v.id === 'architecture')?.positions.redis).toEqual({ x: 10, y: 20 })
  })

  it('undoes and redoes', () => {
    let h = createHistory(load())
    h = execute(h, { type: 'entity.update', id: 'redis', changes: { technology: 'Valkey 8' } })
    expect(h.present.model.entities.find((e) => e.id === 'redis')?.technology).toBe('Valkey 8')
    h = undo(h)
    expect(h.present.model.entities.find((e) => e.id === 'redis')?.technology).toBe('Redis 7')
    h = redo(h)
    expect(h.present.model.entities.find((e) => e.id === 'redis')?.technology).toBe('Valkey 8')
  })
})

describe('walkthrough.setText', () => {
  it('changes one text field and keeps the rest', async () => {
    const { commerce } = await import('@poney/examples')
    const { parseDocument } = await import('../validation/validate')
    const { applyCommand } = await import('./commands')
    const { ownership } = await import('@poney/ext-ownership')
    const doc = parseDocument(commerce, { extensions: [ownership] })
    const w = doc.walkthroughs[0]
    const next = applyCommand(doc, { type: 'walkthrough.setText', walkthroughId: w.id, path: ['scenes', 1, 'text'], value: 'New **text**.' })
    expect(next.walkthroughs[0].scenes[1].text).toBe('New **text**.')
    expect(next.walkthroughs[0].scenes[0]).toBe(w.scenes[0])
    expect(doc.walkthroughs[0].scenes[1].text).toBe(w.scenes[1].text)
    expect(() => applyCommand(doc, { type: 'walkthrough.setText', walkthroughId: w.id, path: ['scenes', 1, 'focus'], value: 'x' })).toThrow(/not text/)
  })
})

describe('behavior.rename', () => {
  it('renames a message inside a fragment, a state and a transition', async () => {
    const { commerce } = await import('@poney/examples')
    const { parseDocument } = await import('../validation/validate')
    const { indexOf } = await import('../model/query')
    const doc = parseDocument(commerce, { extensions: [ownership] })
    let next = applyCommand(doc, { type: 'behavior.rename', behaviorId: 'checkout', element: 'message', id: 'c12', value: 'Payment authorized' })
    expect(indexOf(next).messages('checkout').find((m) => m.message.id === 'c12')?.message.label).toBe('Payment authorized')
    next = applyCommand(next, { type: 'behavior.rename', behaviorId: 'order-lifecycle', element: 'state', id: 's-paid', value: 'Paid in full' })
    expect(indexOf(next).stateMachine('order-lifecycle')?.states.find((s) => s.id === 's-paid')?.name).toBe('Paid in full')
    expect(() => applyCommand(doc, { type: 'behavior.rename', behaviorId: 'checkout', element: 'message', id: 'nope', value: 'x' })).toThrow(/No message/)
  })
})
