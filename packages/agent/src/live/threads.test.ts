import { describe, expect, it } from 'vitest'
import { LiveState } from './state'
import { folderAt } from './folder'
import type { Message } from './types'

describe('one thread for each project', () => {
  it('keeps one thread for each project', () => {
    const state = new LiveState()
    state.setWorkspace(folderAt('/w/a'))
    state.ask('A?')
    state.setWorkspace(folderAt('/w/b'))
    expect(state.thread()).toEqual([])
    state.ask('B?')
    state.setWorkspace(folderAt('/w/a'))
    expect(state.thread().map((m) => m.text)).toEqual(['A?'])
  })

  it('shows messages of a background project only in its own thread', () => {
    const state = new LiveState()
    state.setWorkspace(folderAt('/w/b'))
    const seen: Message[] = []
    state.on('message', (m) => seen.push(m))
    state.put({ from: 'agent', text: 'late', done: true }, '/w/a')
    expect(seen).toEqual([])
    expect(state.thread('/w/a').at(-1)?.text).toBe('late')
    expect(state.thread()).toEqual([])
  })

  it('replaces a message in the thread of its project', () => {
    const state = new LiveState()
    state.setWorkspace(folderAt('/w/b'))
    const m = state.put({ from: 'agent', text: 'part' }, '/w/a')
    state.put({ ...m, text: 'whole' } as Message, '/w/a')
    expect(state.thread('/w/a').map((x) => x.text)).toEqual(['whole'])
  })

  it('sends the thread when the project changes', () => {
    const state = new LiveState()
    state.setWorkspace(folderAt('/w/a'))
    state.ask('A?')
    const sent: Message[][] = []
    state.on('thread', (messages) => sent.push(messages))
    state.setWorkspace(folderAt('/w/b'))
    state.ask('B?')
    state.setWorkspace(folderAt('/w/b'))
    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual([])
    state.setWorkspace(folderAt('/w/a'))
    expect(sent[1].map((m) => m.text)).toEqual(['A?'])
  })

  it('never reuses a message id across projects', () => {
    const state = new LiveState()
    const a = state.put({ from: 'agent', text: 'a', done: true }, '/w/a')
    const b = state.put({ from: 'agent', text: 'b', done: true }, '/w/b')
    expect(a.id).not.toBe(b.id)
  })
})
