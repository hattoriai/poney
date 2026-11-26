import { describe, expect, it } from 'vitest'
import { commerce } from '@hattoriai/poney-examples'
import { ownership } from '@hattoriai/poney-ext-ownership'
import { validateDocument } from './validate'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

describe('validateDocument', () => {
  it('accepts the sample commerce model', () => {
    const result = validateDocument(commerce, { extensions: [ownership] })
    expect(result.issues).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('survives a JSON round trip unchanged', () => {
    const first = validateDocument(commerce, { extensions: [ownership] })
    if (!first.ok) throw new Error('invalid')
    const second = validateDocument(JSON.parse(JSON.stringify(first.document)), { extensions: [ownership] })
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.document).toEqual(first.document)
  })

  it('reports a relationship to an unknown entity', () => {
    const doc = clone(commerce)
    doc.model.relationships[0].target = 'nowhere'
    const result = validateDocument(doc)
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ path: 'model.relationships.0.target', message: 'Unknown entity "nowhere"', severity: 'error' }))
  })

  it('reports duplicate ids', () => {
    const doc = clone(commerce)
    doc.model.entities.push(clone(doc.model.entities[0]))
    const result = validateDocument(doc)
    expect(result.issues.some((i) => i.message === 'Duplicate id "customer"')).toBe(true)
  })

  it('reports a sequence message from a non-participant', () => {
    const doc = clone(commerce)
    const login = doc.model.behaviors!.find((b) => b.id === 'customer-login')!
    if (login.kind !== 'interaction') throw new Error('expected interaction')
    const first = login.steps[0]
    if (first.type !== 'message') throw new Error('expected message')
    first.from = 'paystream'
    const result = validateDocument(doc)
    expect(result.issues.some((i) => i.message === '"paystream" is not a participant')).toBe(true)
  })

  it('reports a foreign key to a missing field', () => {
    const doc = clone(commerce)
    const sessions = doc.model.dataTypes!.find((t) => t.id === 'sessions')!
    sessions.fields!.find((f) => f.name === 'user_id')!.references = { dataType: 'users', field: 'uuid' }
    const result = validateDocument(doc)
    expect(result.issues.some((i) => i.message === '"users" has no field "uuid"')).toBe(true)
  })

  it('rejects a malformed id', () => {
    const doc = clone(commerce)
    doc.model.entities[0].id = 'Not Valid'
    const result = validateDocument(doc)
    expect(result.ok).toBe(false)
  })
})

describe('walkthroughs (R13)', () => {
  const withExt = (doc: unknown) => validateDocument(doc, { extensions: [ownership] })

  it('reports a callout on an element that does not exist', () => {
    const doc = clone(commerce)
    doc.walkthroughs![0].scenes[0].callouts![0].target = 'state:order-lifecycle:s-limbo'
    const result = withExt(doc)
    expect(result.issues).toContainEqual(expect.objectContaining({ path: 'walkthroughs.0.scenes.0.callouts.0.target', message: 'Nothing in the model matches "state:order-lifecycle:s-limbo"', severity: 'error' }))
  })

  it('requires removed marks to point at removed elements', () => {
    const doc = clone(commerce)
    doc.walkthroughs![0].marks!.push({ ref: 'entity:redis', state: 'removed' })
    const result = withExt(doc)
    expect(result.issues.some((i) => i.message === '"entity:redis" is marked removed but is not in "removed"')).toBe(true)
  })

  it('reports a scene that shows an unknown view', () => {
    const doc = clone(commerce)
    doc.walkthroughs![0].scenes[1].view = 'nowhere'
    expect(withExt(doc).issues.some((i) => i.path === 'walkthroughs.0.scenes.1.view')).toBe(true)
  })
})
