import { describe, expect, it } from 'vitest'
import type { PoneyDocument } from '@hattoriai/poney-core'
import { useStudio } from './store'

const doc = (id: string) => ({ poneyVersion: '0.1.0', project: { id, name: id, description: '' }, model: {}, views: [], walkthroughs: [] }) as unknown as PoneyDocument

describe('closeDocument', () => {
  it('closes a document in the background, the open one, and the last one', () => {
    const s = useStudio.getState()
    s.loadDocument(doc('a'))
    s.loadDocument(doc('b'))
    s.loadDocument(doc('c'))
    s.closeDocument('a')
    expect(useStudio.getState().projects.map((p) => p.id)).toEqual(['b', 'c'])
    expect(useStudio.getState().projectId).toBe('c')
    s.closeDocument('c')
    expect(useStudio.getState().projects.map((p) => p.id)).toEqual(['b'])
    expect(useStudio.getState().projectId).toBe('b')
    expect(useStudio.getState().history.present.project.id).toBe('b')
    s.closeDocument('b')
    expect(useStudio.getState()).toMatchObject({ projects: [], projectId: '', history: undefined, startOpen: true })
  })
})
