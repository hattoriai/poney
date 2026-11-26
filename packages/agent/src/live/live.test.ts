import { afterAll, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { request } from 'node:http'
import { startHub, type Hub } from './hub'
import { RemoteLive, isPoneyHub } from './api'
import type { Message } from './types'

const fake = fileURLToPath(new URL('../../test/fake-acp-agent.mjs', import.meta.url))
const hubs: Hub[] = []
afterAll(() => hubs.forEach((h) => h.server.stop()))
const until = async (ok: () => boolean, ms = 8000) => {
  const end = Date.now() + ms
  while (!ok()) {
    if (Date.now() > end) throw new Error('Timed out')
    await new Promise((r) => setTimeout(r, 25))
  }
}

describe('an MCP server attached to a running hub', () => {
  it('opens documents and answers questions through the same hub', async () => {
    const hub = await startHub(5400 + Math.floor(Math.random() * 200))
    hubs.push(hub)
    expect(await isPoneyHub(hub.server.url)).toBe(true)
    const remote = new RemoteLive(hub.server.url)
    expect(await remote.open({ poneyVersion: '0.1.0' })).toEqual({ revision: 1, viewers: 0 })
    expect(hub.state.shown()?.revision).toBe(1)
    const waiting = remote.waitForQuestions(5000)
    await new Promise((r) => setTimeout(r, 100))
    hub.state.ask('Where does it start?', { scene: 's1' })
    expect((await waiting).questions.map((q) => q.text)).toEqual(['Where does it start?'])
    await remote.reply('In main.ts.', { inReplyTo: 1 })
    expect((await remote.read()).thread.map((m) => m.from)).toEqual(['person', 'agent'])
  })

  it('refuses pages from other sites', async () => {
    const hub = hubs[0]
    const res = await fetch(`${hub.server.url}/api/agent`, { headers: { origin: 'https://evil.example' } })
    expect(res.status).toBe(403)
    // fetch cannot set Host, so a plain request stands in for a page reached through a renamed host.
    const status = await new Promise<number>((resolve) =>
      request({ host: '127.0.0.1', port: hub.server.port, path: '/api/agent', headers: { host: `evil.example:${hub.server.port}` } }, (r) => resolve(r.statusCode ?? 0)).end(),
    )
    expect(status).toBe(403)
  })
})

describe('an agent the Studio starts over ACP', () => {
  it('answers the person, shows its tool calls, and asks before it acts', async () => {
    const hub = await startHub(5600 + Math.floor(Math.random() * 200))
    hubs.push(hub)
    const spec = { id: 'fake', name: 'Fake agent', command: process.execPath, args: [fake], install: '', available: true }
    await hub.bridge.connect(spec, tmpdir())
    expect(hub.state.status().session).toMatchObject({ providerId: 'fake', busy: false })

    hub.state.ask('Give me a tour.')
    const msgs = () => hub.state.thread()
    await until(() => msgs().some((m) => m.from === 'permission'))
    const permission = msgs().find((m): m is Extract<Message, { from: 'permission' }> => m.from === 'permission')!
    expect(permission.options.map((o) => o.id)).toEqual(['yes', 'no'])
    hub.bridge.choose(permission.id, 'yes')
    await until(() => msgs().some((m) => m.from === 'agent' && m.text.startsWith('Done')) && !hub.state.status().session?.busy)

    const agentText = msgs().filter((m) => m.from === 'agent').map((m) => (m as { text: string }).text)
    expect(agentText).toEqual(['Reading the code.', 'Done (yes). MCP: poney. Briefed: true. Session: fake-session-1.'])
    expect(msgs().find((m) => m.from === 'tool')).toMatchObject({ title: 'Read src/app.ts', status: 'completed' })

    // The agent's settings show, and change through ACP.
    expect(hub.state.status().session?.settings.map((s) => [s.id, s.category, s.current])).toEqual([
      ['model', 'model', 'small'],
      ['effort', 'effort', 'low'],
    ])
    await hub.bridge.setSetting('model', 'large')
    expect(hub.state.status().session?.settings.find((s) => s.id === 'model')?.current).toBe('large')

    await hub.bridge.disconnect()
    expect(hub.state.status().session).toBeNull()
  }, 20_000)
})

describe('a workspace project, saved as a file', () => {
  it('starts empty, saves what the agent opens to docs/poney, reads changes on disk, and never overwrites it with another project', async () => {
    const { mkdtempSync, readFileSync, writeFileSync, existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { LiveState } = await import('./state')
    const { DocumentFiles, workspaceFile } = await import('./files')
    const { workspaceProject } = await import('./workspace-project')
    const cwd = mkdtempSync(join(tmpdir(), 'repo-'))
    const state = new LiveState()
    const files = new DocumentFiles(state)
    const w = workspaceProject(cwd)
    const file = workspaceFile(w)

    state.setWorkspace(w)
    expect(state.shown()?.document).toMatchObject({ project: { id: w.id }, views: [], walkthroughs: [] })
    expect(state.file).toBe(file)
    expect(existsSync(file)).toBe(false) // nothing to keep yet

    const tour = JSON.parse(readFileSync(new URL('../../examples/tour.poney', import.meta.url), 'utf8'))
    state.open(tour)
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    expect(saved.project).toMatchObject({ id: w.id, name: 'Acme Notes' })
    expect(state.shown()?.document).toMatchObject({ project: { id: w.id } })

    // A change on disk shows in the Studio.
    const before = state.shown()!.revision
    await new Promise((r) => setTimeout(r, 300)) // the OS needs a moment before it reports changes to a new watch
    writeFileSync(file, JSON.stringify({ ...saved, project: { ...saved.project, name: 'Renamed on disk' } }, null, 2))
    await until(() => state.shown()!.revision > before)
    expect(state.shown()?.document).toMatchObject({ project: { name: 'Renamed on disk' } })

    // Another project releases the file instead of overwriting it.
    state.setWorkspace(undefined)
    state.open({ ...tour, project: { id: 'other', name: 'Other' } })
    expect(JSON.parse(readFileSync(file, 'utf8')).project.name).toBe('Renamed on disk')
    expect(state.file).toBeUndefined()
    files.close()
  })
})

describe('waiting for questions while the Studio has its own agent', () => {
  it('returns at once, and wakes agents that were waiting', async () => {
    const { LiveState } = await import('./state')
    const state = new LiveState()
    const waiting = state.waitForQuestions(10_000)
    state.setSession({ providerId: 'x', name: 'X', cwd: '/', busy: false }, () => {})
    expect(await waiting).toEqual([])
    const t = Date.now()
    expect(await state.waitForQuestions(10_000)).toEqual([])
    expect(Date.now() - t).toBeLessThan(100)
  })
})

describe('opening a project folder', () => {
  it('keeps the document already open, and saves it into the project', async () => {
    const { mkdtempSync, readFileSync, existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { LiveState } = await import('./state')
    const { DocumentFiles } = await import('./files')
    const { workspaceProject } = await import('./workspace-project')
    const cwd = mkdtempSync(join(tmpdir(), 'kept-'))
    const state = new LiveState()
    const files = new DocumentFiles(state)
    const tour = JSON.parse(readFileSync(new URL('../../examples/tour.poney', import.meta.url), 'utf8'))
    state.open(tour) // e.g. pasted, with no file
    state.setWorkspace(workspaceProject(cwd))
    expect(state.shown()?.document).toMatchObject({ project: { id: 'acme-notes' } })
    expect(state.file).toBe(join(cwd, 'docs', 'poney', 'acme-notes.poney'))
    expect(existsSync(state.file!)).toBe(true)
    // What an agent opens next joins this project.
    state.open({ ...tour, project: { id: 'something-else', name: 'X' } })
    expect(state.openProjectId).toBe('acme-notes')
    files.close()
  })
})

describe('an agent folder for a document with its own file', () => {
  it('keeps the document and its file', async () => {
    const { mkdtempSync, readFileSync, writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { LiveState } = await import('./state')
    const { DocumentFiles } = await import('./files')
    const { workspaceProject } = await import('./workspace-project')
    const elsewhere = join(mkdtempSync(join(tmpdir(), 'dl-')), 'tour.poney')
    writeFileSync(elsewhere, readFileSync(new URL('../../examples/tour.poney', import.meta.url), 'utf8'))
    const code = mkdtempSync(join(tmpdir(), 'code-'))
    const state = new LiveState()
    const files = new DocumentFiles(state)
    files.open(elsewhere)
    state.setWorkspace(workspaceProject(code), true)
    expect(state.file).toBe(elsewhere)
    expect(state.openProjectId).toBe('acme-notes')
    expect(state.project?.cwd).toBe(code)
    files.close()
  })
})

describe('an agent in another folder than the open document', () => {
  it('opens its document as that folder’s project, saved there, never over the open file', async () => {
    const { mkdtempSync, readFileSync, writeFileSync, existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { LiveState } = await import('./state')
    const { DocumentFiles } = await import('./files')
    const { workspaceProject } = await import('./workspace-project')
    const elsewhere = join(mkdtempSync(join(tmpdir(), 'superwave-')), 'superwave.poney')
    const original = readFileSync(new URL('../../examples/tour.poney', import.meta.url), 'utf8')
    writeFileSync(elsewhere, original)
    const tug = mkdtempSync(join(tmpdir(), 'tug-'))
    const state = new LiveState()
    const files = new DocumentFiles(state)
    files.open(elsewhere)
    state.setWorkspace(workspaceProject(tug), true) // the agent's folder; the open document stays
    const tour = JSON.parse(original)
    state.open({ ...tour, project: { id: 'tug', name: 'Tug', description: '' } }) // the agent's tour, opened with replace
    const id = workspaceProject(tug).id
    expect((state.shown()!.document as { project: { id: string } }).project.id).toBe(id)
    await new Promise((r) => setTimeout(r, 50))
    expect(readFileSync(elsewhere, 'utf8')).toBe(original)
    expect(state.file).toBe(join(tug, 'docs', 'poney', `${id}.poney`))
    expect(existsSync(state.file!)).toBe(true)
    files.close()
  })

  it('opens the folder as the project when asked, even when it is already the agent’s folder', async () => {
    const { mkdtempSync, readFileSync, writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { LiveState } = await import('./state')
    const { DocumentFiles } = await import('./files')
    const { workspaceProject } = await import('./workspace-project')
    const elsewhere = join(mkdtempSync(join(tmpdir(), 'superwave-')), 'superwave.poney')
    writeFileSync(elsewhere, readFileSync(new URL('../../examples/tour.poney', import.meta.url), 'utf8'))
    const tug = mkdtempSync(join(tmpdir(), 'tug-'))
    const state = new LiveState()
    const files = new DocumentFiles(state)
    files.open(elsewhere)
    state.setWorkspace(workspaceProject(tug), true)
    expect(state.file).toBe(elsewhere)
    state.setWorkspace(workspaceProject(tug)) // Open a project → tug
    expect((state.shown()!.document as { project: { id: string } }).project.id).toBe(workspaceProject(tug).id)
    expect(state.file).toBe(join(tug, 'docs', 'poney', `${workspaceProject(tug).id}.poney`))
    files.close()
  })
})
