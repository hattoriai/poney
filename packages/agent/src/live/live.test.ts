import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { workspaceFile } from './files'
import { workspaceProject } from './workspace-project'
import { request } from 'node:http'
import { startHub, type Hub } from './hub'
import { RemoteLive, isPoneyHub } from './api'
import type { Message } from './types'

const fake = fileURLToPath(new URL('../../test/fake-acp-agent.mjs', import.meta.url))
const hubs: Hub[] = []
// Hubs remember the default agent and sessions in the Poney home.
let home: string
let saved: string | undefined
beforeAll(() => {
  saved = process.env.PONEY_HOME
  home = mkdtempSync(join(tmpdir(), 'poney-home-'))
  process.env.PONEY_HOME = home
})
afterAll(() => {
  hubs.forEach((h) => h.server.stop())
  if (saved === undefined) delete process.env.PONEY_HOME
  else process.env.PONEY_HOME = saved
  rmSync(home, { recursive: true, force: true })
})
const fakeAgent = () => ({ custom: { name: 'Fake agent', command: `"${process.execPath}" "${fake}"` } })
const post = async (hub: Hub, path: string, body: unknown) => {
  const res = await fetch(`${hub.server.url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${await res.text()}`)
  return res.json()
}
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
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'repo-')))
    await post(hub, '/api/project/open', { path: cwd })
    await post(hub, '/api/agent/connect', fakeAgent())
    expect(hub.state.status().session).toMatchObject({ providerId: 'custom:Fake agent', cwd, busy: false })

    hub.state.ask('Give me a tour.')
    const msgs = () => hub.state.thread()
    await until(() => msgs().some((m) => m.from === 'permission'))
    const permission = msgs().find((m): m is Extract<Message, { from: 'permission' }> => m.from === 'permission')!
    expect(permission.options.map((o) => o.id)).toEqual(['yes', 'no'])
    hub.agents.active()!.choose(permission.id, 'yes')
    await until(() => msgs().some((m) => m.from === 'agent' && m.text.startsWith('Done')) && !hub.state.status().session?.busy)

    const agentText = msgs().filter((m) => m.from === 'agent').map((m) => (m as { text: string }).text)
    expect(agentText).toEqual(['Reading the code.', 'Done (yes). MCP: poney. Briefed: true. Session: fake-session-1.'])
    expect(msgs().find((m) => m.from === 'tool')).toMatchObject({ title: 'Read src/app.ts', status: 'completed' })

    // The agent's settings show, and change through ACP.
    expect(hub.state.status().session?.settings.map((s) => [s.id, s.category, s.current])).toEqual([
      ['model', 'model', 'small'],
      ['effort', 'effort', 'low'],
    ])
    await hub.agents.active()!.setSetting('model', 'large')
    expect(hub.state.status().session?.settings.find((s) => s.id === 'model')?.current).toBe('large')

    await post(hub, '/api/agent/disconnect', {})
    expect(hub.state.status().session).toBeNull()
  }, 20_000)

  it('opens the project folder when the agent connects with a folder, and starts one agent there', async () => {
    const hub = await startHub(5800 + Math.floor(Math.random() * 100))
    hubs.push(hub)
    const log = join(mkdtempSync(join(tmpdir(), 'starts-')), 'starts.log')
    const wrapper = join(dirname(log), 'wrapper.mjs')
    // Each start writes its agent's name and its folder.
    writeFileSync(wrapper, `import { appendFileSync } from 'node:fs'\nappendFileSync(${JSON.stringify(log)}, process.argv[2] + ' ' + process.cwd() + '\\n')\nawait import(${JSON.stringify(fake)})\n`)
    const counted = (name: string) => ({ custom: { name, command: `"${process.execPath}" "${wrapper}" ${name}` } })
    const starts = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [])
    const other = mkdtempSync(join(tmpdir(), 'other-'))
    await post(hub, '/api/project/open', { path: other })
    await post(hub, '/api/agent/connect', counted('old'))
    expect(starts()).toEqual([`old ${realpathSync(other)}`])
    // The old agent is the default: it must not start in the new folder.
    const folder = realpathSync(mkdtempSync(join(tmpdir(), 'repo-')))
    await post(hub, '/api/agent/connect', { ...counted('new'), folder })
    expect(hub.state.project?.cwd).toBe(folder)
    expect(hub.state.status().session).toMatchObject({ providerId: 'custom:new', cwd: folder })
    await new Promise((r) => setTimeout(r, 300))
    expect(starts().filter((l) => l.endsWith(folder))).toEqual([`new ${folder}`])
    await post(hub, '/api/agent/disconnect', {})
  }, 20_000)

  it('starts the default agent by itself only in a hub started for the Studio', async () => {
    const { SessionStore } = await import('../agents/sessions')
    new SessionStore().setDefaultAgent({ agent: fakeAgent(), settings: {} })
    // A hub an MCP server starts: the questions stay with that agent.
    const quiet = await startHub(6300 + Math.floor(Math.random() * 100))
    hubs.push(quiet)
    await post(quiet, '/api/project/open', { path: mkdtempSync(join(tmpdir(), 'repo-')) })
    await new Promise((r) => setTimeout(r, 300))
    expect(quiet.state.status().session).toBeNull()
    const studio = await startHub(6400 + Math.floor(Math.random() * 100), { autoStart: true })
    hubs.push(studio)
    await post(studio, '/api/project/open', { path: mkdtempSync(join(tmpdir(), 'repo-')) })
    await until(() => !!studio.state.status().session)
    await post(studio, '/api/agent/disconnect', {})
  }, 20_000)

  it('has no connect-here route', async () => {
    const hub = await startHub(6001 + Math.floor(Math.random() * 99))
    hubs.push(hub)
    expect((await fetch(`${hub.server.url}/api/agent/connect-here`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(404)
  })

  it('opens the folder’s document again when the project is opened after a loose file, and keeps the agent', async () => {
    const hub = await startHub(6100 + Math.floor(Math.random() * 100))
    hubs.push(hub)
    const p = realpathSync(mkdtempSync(join(tmpdir(), 'repo-p-')))
    await post(hub, '/api/project/open', { path: p })
    await post(hub, '/api/agent/connect', fakeAgent())
    const agent = hub.agents.get(p)
    const session = hub.state.status().session
    const sessionId = readFileSync(join(home, 'sessions.json'), 'utf8')
    const loose = join(realpathSync(mkdtempSync(join(tmpdir(), 'loose-'))), 'tour.poney')
    writeFileSync(loose, readFileSync(new URL('../../examples/tour.poney', import.meta.url), 'utf8'))
    await post(hub, '/api/files/open', { path: loose })
    expect(hub.state.file).toBe(loose)
    // A loose file is in no project: no agent answers there.
    expect(hub.state.project).toBeUndefined()
    expect(hub.state.status().session).toBeNull()
    await post(hub, '/api/project/open', { path: p })
    expect(hub.state.file).toBe(workspaceFile(workspaceProject(p)))
    expect(hub.state.shown()?.document).toMatchObject({ project: { id: workspaceProject(p).id } })
    expect(hub.agents.get(p)).toBe(agent)
    expect(hub.state.status().session).toEqual(session)
    expect(readFileSync(join(home, 'sessions.json'), 'utf8')).toBe(sessionId)
    await post(hub, '/api/agent/disconnect', {})
  }, 20_000)

  it('saves what a background project opens, and does not show it', async () => {
    const hub = await startHub(5900 + Math.floor(Math.random() * 80))
    hubs.push(hub)
    const a = realpathSync(mkdtempSync(join(tmpdir(), 'repo-a-')))
    const b = realpathSync(mkdtempSync(join(tmpdir(), 'repo-b-')))
    await post(hub, '/api/project/open', { path: a })
    await post(hub, '/api/project/open', { path: b })
    const tour = JSON.parse(readFileSync(new URL('../../examples/tour.poney', import.meta.url), 'utf8'))
    const shown = hub.state.shown()?.revision
    const res = await post(hub, '/api/live/open', { document: tour, project: a })
    expect(res).toMatchObject({ revision: shown, saved: true })
    expect(hub.state.shown()?.revision).toBe(shown)
    expect(hub.state.shown()?.document).toMatchObject({ project: { id: workspaceProject(b).id } })
    expect(JSON.parse(readFileSync(workspaceFile(workspaceProject(a)), 'utf8')).project).toMatchObject({ id: workspaceProject(a).id, name: 'Acme Notes' })
    expect(hub.state.thread(a).map((m) => (m as { text?: string }).text)).toEqual(['The agent saved “Acme Notes”. It shows when you open this project.'])
    expect(hub.state.thread(b)).toEqual([])
  })
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

describe('a project whose file is not a valid document', () => {
  it('is reported, and what an agent opens next does not overwrite it', async () => {
    const { LiveState } = await import('./state')
    const { DocumentFiles } = await import('./files')
    const cwd = mkdtempSync(join(tmpdir(), 'broken-'))
    const w = workspaceProject(cwd)
    const path = workspaceFile(w)
    mkdirSync(dirname(path), { recursive: true })
    const broken = '<<<<<<< HEAD\n{"poneyVersion": "0.1.0"}\n=======\n{}\n>>>>>>> theirs\n'
    writeFileSync(path, broken)
    const state = new LiveState()
    const files = new DocumentFiles(state)
    state.setWorkspace(w)
    expect(state.thread()).toContainEqual(expect.objectContaining({ from: 'notice', tone: 'error' }))
    const tour = JSON.parse(readFileSync(new URL('../../examples/tour.poney', import.meta.url), 'utf8'))
    state.open(tour) // the agent's poney_open
    state.setWorkspace(w) // the person opens the project again
    state.open(tour)
    await new Promise((r) => setTimeout(r, 50))
    expect(readFileSync(path, 'utf8')).toBe(broken)
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
    state.setWorkspace(workspaceProject(tug)) // the agent's folder
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
})

describe('the project of a path', () => {
  const tourText = () => readFileSync(new URL('../../examples/tour.poney', import.meta.url), 'utf8')
  /** A folder with a document in docs/poney/<name>.poney. */
  const withFile = (dir: string, name: string) => {
    mkdirSync(join(dir, 'docs', 'poney'), { recursive: true })
    const file = join(dir, 'docs', 'poney', `${name}.poney`)
    writeFileSync(file, tourText())
    return file
  }
  const gitInit = (dir: string) => execFileSync('git', ['init', '-q', dir])
  const hubFor = async () => {
    const hub = await startHub(7100 + Math.floor(Math.random() * 400)) // fetch refuses some ports, such as 6000 and 6665–6669
    hubs.push(hub)
    return hub
  }

  it('is the folder of docs/poney/, also outside a repository, after a restart', async () => {
    const hub = await hubFor()
    const q = mkdtempSync(join(tmpdir(), 'q-'))
    await post(hub, '/api/project/open', { path: q })
    hub.state.put({ from: 'notice', text: 'In Q.', tone: 'info' })
    const p = mkdtempSync(join(tmpdir(), 'plain-'))
    await post(hub, '/api/files/open', { path: withFile(p, 'notes') })
    expect(hub.state.projectKey()).toBe(realpathSync(p))
    expect(hub.state.thread()).toEqual([])
  })

  it('is the folder of docs/poney/ in a subfolder of a repository, not the repository', async () => {
    const hub = await hubFor()
    const repo = mkdtempSync(join(tmpdir(), 'mono-'))
    gitInit(repo)
    const app = join(repo, 'packages', 'app')
    const file = withFile(app, 'app')
    await post(hub, '/api/files/open', { path: file })
    expect(hub.state.projectKey()).toBe(realpathSync(app))
  })

  it('is the repository for a file elsewhere in it, and none for a loose file', async () => {
    const hub = await hubFor()
    const repo = mkdtempSync(join(tmpdir(), 'repo-'))
    gitInit(repo)
    writeFileSync(join(repo, 'tour.poney'), tourText())
    await post(hub, '/api/files/open', { path: join(repo, 'tour.poney') })
    expect(hub.state.projectKey()).toBe(realpathSync(repo))
    const loose = join(mkdtempSync(join(tmpdir(), 'loose-')), 'tour.poney')
    writeFileSync(loose, tourText())
    await post(hub, '/api/files/open', { path: loose })
    expect(hub.state.project).toBeUndefined()
  })

  it('has one key for a folder, whatever path names it', async () => {
    const hub = await hubFor()
    const real = realpathSync(mkdtempSync(join(tmpdir(), 'real-')))
    const file = withFile(real, 'real')
    const link = join(mkdtempSync(join(tmpdir(), 'links-')), 'link')
    symlinkSync(real, link)
    await post(hub, '/api/project/open', { path: link })
    expect(hub.state.projectKey()).toBe(real)
    expect(hub.state.file).toBe(file)
    let threads = 0
    hub.state.on('thread', () => threads++)
    // A recent file, named through the link.
    await post(hub, '/api/files/open', { path: join(link, 'docs', 'poney', 'real.poney') })
    await post(hub, '/api/project/open', { path: real })
    expect(hub.state.projectKey()).toBe(real)
    expect(hub.state.file).toBe(file)
    expect(threads).toBe(0)
  })

  it('saves and reads a background project in the file it is tied to, whatever its name', async () => {
    const hub = await hubFor()
    const notes = realpathSync(mkdtempSync(join(tmpdir(), 'notes-app-')))
    const file = withFile(notes, 'acme-notes')
    await post(hub, '/api/files/open', { path: file })
    await post(hub, '/api/project/open', { path: mkdtempSync(join(tmpdir(), 'b-')) })
    const tour = JSON.parse(tourText())
    const more = { ...tour, walkthroughs: [...tour.walkthroughs, { ...tour.walkthroughs[0], id: 'more', title: 'More' }] }
    expect(await post(hub, '/api/live/open', { document: more, project: notes })).toMatchObject({ saved: true })
    expect(JSON.parse(readFileSync(file, 'utf8')).walkthroughs.map((w: { id: string }) => w.id)).toContain('more')
    expect(existsSync(workspaceFile(workspaceProject(notes)))).toBe(false)
    // Back in the project, its own document opens.
    await post(hub, '/api/project/open', { path: notes })
    expect(hub.state.file).toBe(file)
  })

  it('comes back after a restart without a file, with its document and its agent\'s session', async () => {
    const { SessionStore } = await import('../agents/sessions')
    const { emptyDocument } = await import('./workspace-project')
    const alpha = realpathSync(mkdtempSync(join(tmpdir(), 'alpha-')))
    const store = new SessionStore()
    store.setDefaultAgent({ agent: fakeAgent(), settings: {} })
    store.setSession(alpha, { agentKey: 'custom:Fake agent', sessionId: 'fake-session-7', at: new Date().toISOString() })
    const hub = await startHub(6900 + Math.floor(Math.random() * 100), { autoStart: true })
    hubs.push(hub)
    // The Studio gives back its document and the file it was tied to, which was never written.
    const document = emptyDocument(workspaceProject(alpha))
    await post(hub, '/api/files/open', { path: join(alpha, 'docs', 'poney', `${workspaceProject(alpha).id}.poney`), document })
    expect(hub.state.project?.cwd).toBe(alpha)
    expect(hub.state.shown()).toMatchObject({ revision: 1, document })
    await until(() => !!hub.state.status().session)
    expect(hub.state.thread().map((m) => [m.from, (m as { text?: string }).text])).toEqual([
      ['person', 'Earlier question.'],
      ['agent', 'Earlier answer.'],
    ])
    expect(store.session(alpha)?.sessionId).toBe('fake-session-7')
    await post(hub, '/api/agent/disconnect', {})
  }, 20_000)

  it('reads the only file in docs/poney/ of a project no file is tied to yet', async () => {
    const hub = await hubFor()
    const notes = realpathSync(mkdtempSync(join(tmpdir(), 'notes-app-')))
    withFile(notes, 'acme-notes')
    const read = await (await fetch(`${hub.server.url}/api/live/read?project=${encodeURIComponent(notes)}`)).json()
    expect(read.current?.project?.name).toBe('Acme Notes')
  })
})
