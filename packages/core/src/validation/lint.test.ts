import { describe, expect, it } from 'vitest'
import { commerce } from '@hattoriai/poney-examples'
import { ownership } from '@hattoriai/poney-ext-ownership'
import { checkDocument, formatCheck } from './lint'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

describe('checkDocument', () => {
  it('passes the sample walkthrough with only minor warnings', () => {
    const r = checkDocument(commerce, { extensions: [ownership] })
    expect(r.ok).toBe(true)
    expect(r.warnings.filter((w) => w.path.startsWith('walkthroughs')).map((w) => w.code)).toEqual([])
  })

  it('suggests the closest id for a typo', () => {
    const doc = clone(commerce)
    doc.walkthroughs![0].scenes[0].callouts![1].target = 'transition:order-lifecycle:t-decline'
    const r = checkDocument(doc, { extensions: [ownership] })
    expect(r.errors[0].hint).toContain('"transition:order-lifecycle:t-declined"')
  })

  it('warns when a callout points outside the scene view', () => {
    const doc = clone(commerce)
    doc.walkthroughs![0].scenes[0].callouts!.push({ target: 'entity:redis', text: 'Not here' })
    const r = checkDocument(doc, { extensions: [ownership] })
    expect(r.warnings.some((w) => w.code === 'callout-outside-view')).toBe(true)
    expect(formatCheck(r)).toContain('→ The number would have nothing to sit on')
  })
})

describe('tours', () => {
  const tourOf = () => clone(commerce.walkthroughs!.find((w) => w.id === 'kestrel-tour')!)
  const withWalk = (w: unknown) => ({ ...clone(commerce), walkthroughs: [w] })

  it('needs no marks, before or after', () => {
    const r = checkDocument(withWalk(tourOf()), { extensions: [ownership] })
    expect(r.errors).toEqual([])
    expect(r.warnings.filter((w) => w.path.startsWith('walkthroughs')).map((w) => w.code)).toEqual([])
  })

  it('refuses marks and diff lines', () => {
    const w = tourOf() as Record<string, any>
    w.marks = [{ ref: 'entity:order-service', state: 'changed' }]
    w.scenes[2].code = [{ path: 'a.go', hunks: [{ lines: [{ kind: 'add', new: 1, text: 'x' }] }] }]
    const r = checkDocument(withWalk(w), { extensions: [ownership] })
    expect(r.errors.map((e) => e.message)).toEqual(['A tour has no marks', 'A tour shows code as it is, but this line is "add"'])
  })

  it('asks a tour scene to lead to the code', () => {
    const w = tourOf() as Record<string, any>
    w.scenes[3].proof = []
    expect(checkDocument(withWalk(w), { extensions: [ownership] }).warnings.map((x) => x.code)).toContain('no-source')
  })

  it('still needs before and after in a change', () => {
    const w = clone(commerce.walkthroughs![0]) as Record<string, any>
    delete w.story.after
    expect(checkDocument(withWalk(w), { extensions: [ownership] }).errors[0]).toMatchObject({ path: 'walkthroughs.0.story.after' })
  })
})

describe('emphasis', () => {
  const tour = () => clone(commerce.walkthroughs!.find((w) => w.id === 'kestrel-tour')!) as Record<string, any>
  const run = (w: unknown) => checkDocument({ ...clone(commerce), walkthroughs: [w] }, { extensions: [ownership] })

  it('accepts a trace, effects and badges on what the picture shows', () => {
    const r = run(tour())
    expect(r.errors).toEqual([])
    expect(r.warnings.filter((w) => w.path.startsWith('walkthroughs'))).toEqual([])
  })

  it('refuses refs that do not exist, and warns about misplaced emphasis', () => {
    const w = tour()
    w.scenes[1].trace.push({ ref: 'message:checkout:c99' })
    expect(run(w).errors[0]).toMatchObject({ path: 'walkthroughs.0.scenes.1.trace.8.ref' })
    const v = tour()
    v.scenes[1].effects.push({ target: 'entity:customer', as: 'flow' })
    v.scenes[1].badges.push({ target: 'message:checkout:c1', text: 'a very long badge text here' })
    v.scenes[0].effects.push({ target: 'entity:catalog-service', as: 'attention' })
    expect(run(v).warnings.map((x) => x.code)).toEqual(expect.arrayContaining(['flow-on-box', 'long-label', 'effect-outside-view']))
  })
})
