import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { agentKey, SessionStore } from './sessions'
import { poneyHome } from '../home'

let dir: string
let saved: string | undefined
beforeEach(() => {
  saved = process.env.PONEY_HOME
  dir = mkdtempSync(join(tmpdir(), 'poney-sessions-'))
  process.env.PONEY_HOME = dir
})
afterEach(() => {
  if (saved === undefined) delete process.env.PONEY_HOME
  else process.env.PONEY_HOME = saved
  rmSync(dir, { recursive: true, force: true })
})

describe('SessionStore', () => {
  it('keeps the default agent and the session of each project across instances', () => {
    expect(poneyHome()).toBe(dir)
    const a = new SessionStore()
    const d = { agent: { providerId: 'claude-code' }, settings: { effort: 'medium' } }
    const s = { agentKey: 'claude-code', sessionId: 's1', at: '2026-01-01T00:00:00Z' }
    a.setDefaultAgent(d)
    a.setSession('/w/a', s)
    const b = new SessionStore()
    expect(b.defaultAgent()).toEqual(d)
    expect(b.session('/w/a')).toEqual(s)
    expect(b.session('/w/b')).toBeUndefined()
  })

  it('reads a broken file as empty', () => {
    writeFileSync(join(dir, 'sessions.json'), '{')
    const store = new SessionStore()
    expect(store.defaultAgent()).toBeUndefined()
    store.setDefaultAgent({ agent: { providerId: 'codex' }, settings: {} })
    expect(store.defaultAgent()?.agent).toEqual({ providerId: 'codex' })
  })

  it('forgets a project', () => {
    const store = new SessionStore()
    store.setSession('/w/a', { agentKey: 'codex', sessionId: 's1', at: 'now' })
    store.forget('/w/a')
    expect(store.session('/w/a')).toBeUndefined()
  })

  it('ignores a default agent it cannot read', () => {
    const file = join(dir, 'sessions.json')
    const store = new SessionStore()
    for (const agent of ['claude-code', null, { providerId: 3 }, { custom: { name: 'x' } }, { custom: 'x' }]) {
      writeFileSync(file, JSON.stringify({ version: 1, defaultAgent: { agent, settings: {} }, projects: {} }))
      expect(store.defaultAgent()).toBeUndefined()
    }
    writeFileSync(file, JSON.stringify({ version: 1, defaultAgent: { agent: { providerId: 'codex' }, settings: 'x' }, projects: {} }))
    expect(store.defaultAgent()).toEqual({ agent: { providerId: 'codex' }, settings: {} })
  })

  it('names agents by key', () => {
    expect(agentKey({ providerId: 'codex' })).toBe('codex')
    expect(agentKey({ custom: { name: 'Mine', command: 'x' } })).toBe('custom:Mine')
  })
})
