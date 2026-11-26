import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LiveState } from '../live/state'
import type { Message } from '../live/types'
import { workspaceProject } from '../live/workspace-project'
import { AgentPool } from './pool'
import { SessionStore } from './sessions'
import type { ProviderSpec } from './providers'

const fake = fileURLToPath(new URL('../../test/fake-acp-agent.mjs', import.meta.url))
const spec = (id: string, args: string[] = [], available = true): ProviderSpec => ({ id, name: 'Fake agent', command: process.execPath, args: [fake, ...args], install: 'Install it.', available, signIn: '' })
const providers = () => [spec('fake'), spec('stubborn', ['--no-resume']), spec('missing', [], false)]
const mcp = () => ({ command: process.execPath, args: [], hubUrl: 'http://127.0.0.1:1' })

let home: string
let saved: string | undefined
const folders: string[] = []
const pools: AgentPool[] = []
beforeEach(() => {
  saved = process.env.PONEY_HOME
  home = mkdtempSync(join(tmpdir(), 'poney-home-'))
  process.env.PONEY_HOME = home
})
afterEach(() => {
  for (const p of pools.splice(0)) p.stopAll()
  if (saved === undefined) delete process.env.PONEY_HOME
  else process.env.PONEY_HOME = saved
  for (const d of [home, ...folders.splice(0)]) rmSync(d, { recursive: true, force: true })
})

const folder = () => {
  const d = mkdtempSync(join(tmpdir(), 'poney-project-'))
  folders.push(d)
  return d
}
const until = async (ok: () => boolean, ms = 8000) => {
  const end = Date.now() + ms
  while (!ok()) {
    if (Date.now() > end) throw new Error('Timed out')
    await new Promise((r) => setTimeout(r, 25))
  }
}
const setup = (max?: number) => {
  const state = new LiveState()
  const pool = new AgentPool(state, mcp, new SessionStore(), max, providers)
  pools.push(pool)
  const open = async (cwd: string) => {
    state.setWorkspace(workspaceProject(cwd))
    await pool.activate()
  }
  return { state, pool, open }
}
const texts = (messages: Message[], from: Message['from']) => messages.filter((m) => m.from === from).map((m) => (m as { text: string }).text)
/** Asks a question in the open project, allows the agent's tool call, and returns the answer. */
const askAndAnswer = async (state: LiveState, pool: AgentPool, text: string) => {
  const project = state.projectKey()
  const before = state.thread(project).length
  state.ask(text)
  const fresh = () => state.thread(project).slice(before)
  await until(() => fresh().some((m) => m.from === 'permission'))
  pool.get(project)!.choose(fresh().find((m) => m.from === 'permission')!.id, 'yes')
  await until(() => texts(fresh(), 'agent').some((t) => t.startsWith('Done')) && !pool.get(project)!.busy)
  return texts(fresh(), 'agent').find((t) => t.startsWith('Done'))!
}
const sessionOf = (answer: string) => /Session: (\S+)\.$/.exec(answer)?.[1]

describe('AgentPool', () => {
  it('starts the default agent when a project opens', async () => {
    const { state, pool, open } = setup()
    const [a, b] = [folder(), folder()]
    await open(a)
    await pool.connect({ providerId: 'fake' })
    expect(state.status().session).toMatchObject({ providerId: 'fake', cwd: a })
    await open(b)
    expect(state.status().session).toMatchObject({ providerId: 'fake', cwd: b })
  })

  it('resumes the earlier session when the person goes back', async () => {
    // With room for one agent, A's agent stops when B opens, and starts again for A.
    const { state, pool, open } = setup(1)
    const [a, b] = [folder(), folder()]
    await open(a)
    await pool.connect({ providerId: 'fake' })
    const first = pool.get(a)
    const id = sessionOf(await askAndAnswer(state, pool, 'Where does it start?'))
    await open(b)
    expect(pool.get(a)).toBeUndefined()
    await open(a)
    expect(pool.get(a)).not.toBe(first)
    expect(sessionOf(await askAndAnswer(state, pool, 'And then?'))).toBe(id)
    expect(texts(state.thread(), 'person')).toEqual(['Where does it start?', 'And then?'])
  })

  it('loads the session after a restart', async () => {
    const a = folder()
    const one = setup()
    await one.open(a)
    await one.pool.connect({ providerId: 'fake' })
    const id = sessionOf(await askAndAnswer(one.state, one.pool, 'Where does it start?'))
    one.pool.stopAll()

    const two = setup()
    await two.open(a)
    expect(texts(two.state.thread(), 'agent')).toEqual(['Earlier answer.'])
    expect(two.state.status().session).toMatchObject({ providerId: 'fake', cwd: a })
    expect(sessionOf(await askAndAnswer(two.state, two.pool, 'And then?'))).toBe(id)
  })

  it('finishes an answer in its own project', async () => {
    const { state, pool, open } = setup()
    const [a, b] = [folder(), folder()]
    await open(a)
    await pool.connect({ providerId: 'fake' })
    state.ask('Give me a tour.')
    await until(() => state.thread(a).some((m) => m.from === 'permission'))
    await open(b)
    expect(state.status().session).toMatchObject({ cwd: b })
    pool.get(a)!.choose(state.thread(a).find((m) => m.from === 'permission')!.id, 'yes')
    await until(() => texts(state.thread(a), 'agent').some((t) => t.startsWith('Done (yes)')))
    expect(texts(state.thread(b), 'agent')).toEqual([])
    // The open project's agent still answers here.
    expect(state.status().session).toMatchObject({ cwd: b, busy: false })
  })

  it('runs at most two agents', async () => {
    const { pool, open } = setup()
    const [a, b, c] = [folder(), folder(), folder()]
    await open(a)
    await pool.connect({ providerId: 'fake' })
    await open(b)
    await open(c)
    expect(pool.get(a)).toBeUndefined()
    expect(pool.get(b)?.status().cwd).toBe(b)
    expect(pool.get(c)?.status().cwd).toBe(c)
  })

  it('does not restart the agent when the same project opens again', async () => {
    const { state, pool, open } = setup()
    const a = folder()
    await open(a)
    await pool.connect({ providerId: 'fake' })
    const agent = pool.get(a)
    const id = new SessionStore().session(a)?.sessionId
    state.setWorkspace(workspaceProject(a))
    state.setWorkspace(workspaceProject(a))
    await pool.activate()
    expect(pool.get(a)).toBe(agent)
    expect(new SessionStore().session(a)?.sessionId).toBe(id)
    expect(id).toBe('fake-session-1')
  })

  it('reports an agent that cannot start, and does not throw', async () => {
    const { state, pool, open } = setup()
    new SessionStore().setDefaultAgent({ agent: { providerId: 'missing' }, settings: {} })
    await open(folder())
    await expect(pool.activate()).resolves.toBeUndefined()
    expect(state.thread()).toContainEqual(expect.objectContaining({ from: 'notice', tone: 'error', text: 'Fake agent is not installed. Install it.' }))
    expect(state.status().session).toBeNull()
  })

  it('says so when the earlier session does not resume', async () => {
    const { state, pool, open } = setup(1)
    const [a, b] = [folder(), folder()]
    await open(a)
    await pool.connect({ providerId: 'stubborn' })
    await open(b)
    await open(a)
    expect(state.thread(a)).toContainEqual(expect.objectContaining({ from: 'notice', tone: 'info', text: 'The earlier session did not resume. This is a new session.' }))
    expect(state.status().session).toMatchObject({ cwd: a })
  })

  it('keeps the person\'s settings for the next project', async () => {
    const { state, pool, open } = setup()
    const [a, b] = [folder(), folder()]
    await open(a)
    await pool.connect({ providerId: 'fake' })
    await pool.active()!.setSetting('model', 'large')
    expect(new SessionStore().defaultAgent()).toEqual({ agent: { providerId: 'fake' }, settings: { model: 'large' } })
    await open(b)
    expect(state.status().session?.settings.find((s) => s.id === 'model')?.current).toBe('large')
  })

  it('needs an open project to connect', async () => {
    const { pool } = setup()
    await expect(pool.connect({ providerId: 'fake' })).rejects.toThrow('Open a project first.')
  })
})
