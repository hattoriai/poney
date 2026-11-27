import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LiveState } from './state'
import { DocumentFiles } from './files'
import { folderAt } from './folder'
import { readWorkspace, workspaceToOpen, writeWorkspace } from './workspace-file'

const tour = JSON.parse(readFileSync(new URL('../../examples/tour.poney', import.meta.url), 'utf8'))
let home: string
let saved: string | undefined
beforeAll(() => {
  saved = process.env.PONEY_HOME
  home = mkdtempSync(join(tmpdir(), 'poney-home-'))
  process.env.PONEY_HOME = home
})
afterAll(() => {
  if (saved === undefined) delete process.env.PONEY_HOME
  else process.env.PONEY_HOME = saved
  rmSync(home, { recursive: true, force: true })
})

/** Two repositories side by side, each with documents in docs/poney/. */
function repos() {
  const top = realpathSync(mkdtempSync(join(tmpdir(), 'code-')))
  const make = (name: string, ...ids: string[]) => {
    const cwd = join(top, name)
    mkdirSync(join(cwd, 'docs', 'poney'), { recursive: true })
    for (const id of ids) writeFileSync(join(cwd, 'docs', 'poney', `${id}.poney`), JSON.stringify({ ...tour, project: { ...tour.project, id, name: id } }, null, 2))
    return cwd
  }
  return { top, web: make('web', 'overview'), api: make('api', 'billing') }
}
const hub = () => {
  const state = new LiveState()
  return { state, files: new DocumentFiles(state) }
}

describe('the workspace file', () => {
  it('keeps paths relative to the file, and marks a folder that is missing', () => {
    const { web, api } = repos()
    const file = join(web, 'acme.poney-workspace')
    writeWorkspace({ key: file, name: 'Acme', file, folders: [folderAt(web), folderAt(api), folderAt(join(web, '..', 'gone'))], documents: [join(api, 'docs', 'poney', 'billing.poney')] })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      poneyWorkspace: 1,
      name: 'Acme',
      folders: [{ path: '.' }, { path: '../api' }, { path: '../gone' }],
      documents: [{ path: '../api/docs/poney/billing.poney' }],
    })
    const w = readWorkspace(file)
    expect(w.key).toBe(file)
    expect(w.folders.map((f) => [f.name, !!f.missing])).toEqual([
      ['web', false],
      ['api', false],
      ['gone', true],
    ])
  })

  it('refuses a file that is not a workspace, and one from a newer Poney', () => {
    const { web } = repos()
    writeFileSync(join(web, 'a.poney-workspace'), '{ "folders": [] }')
    writeFileSync(join(web, 'b.poney-workspace'), JSON.stringify({ poneyWorkspace: 99, folders: [{ path: '.' }] }))
    expect(() => readWorkspace(join(web, 'a.poney-workspace'))).toThrow(/no "poneyWorkspace"/)
    expect(() => readWorkspace(join(web, 'b.poney-workspace'))).toThrow(/newer version/)
  })

  it('opens a folder’s own workspace file, and asks when there are several', () => {
    const { web, api } = repos()
    writeWorkspace({ key: '', name: 'Acme', file: join(web, 'acme.poney-workspace'), folders: [folderAt(web), folderAt(api)] })
    expect(workspaceToOpen(web)).toMatchObject({ name: 'Acme', key: join(web, 'acme.poney-workspace') })
    writeWorkspace({ key: '', name: 'Web', file: join(web, 'web.poney-workspace'), folders: [folderAt(web)] })
    expect(workspaceToOpen(web)).toEqual({ choose: [join(web, 'acme.poney-workspace'), join(web, 'web.poney-workspace')] })
    expect(workspaceToOpen(api)).toEqual({ key: api, name: 'api', folders: [folderAt(api)] })
  })
})

describe('a saved workspace', () => {
  it('lists the documents in its file, from any folder, and shows a document of another folder without leaving it', () => {
    const { web, api } = repos()
    const file = join(web, 'acme.poney-workspace')
    const billing = join(api, 'docs', 'poney', 'billing.poney')
    const overview = join(web, 'docs', 'poney', 'overview.poney')
    writeWorkspace({ key: '', name: 'Acme', file, folders: [folderAt(web), folderAt(api)], documents: [overview, billing] })
    const { state, files } = hub()
    state.setWorkspace(readWorkspace(file))
    expect(state.documents.documents.map((d) => d.id)).toEqual(['overview', 'billing'])
    expect(state.shown()).toBeUndefined()
    files.open(billing)
    expect(state.projectKey()).toBe(file)
    expect(state.file).toBe(billing)
    files.close()
  })

  it('adds a new document to its file', () => {
    const { web, api } = repos()
    const file = join(web, 'acme.poney-workspace')
    writeWorkspace({ key: '', name: 'Acme', file, folders: [folderAt(web), folderAt(api)], documents: [] })
    const { state, files } = hub()
    state.setWorkspace(readWorkspace(file))
    const path = files.create('Payments')
    expect(readWorkspace(file).documents).toEqual([path])
    files.agentOpen({ ...tour, project: { ...tour.project, id: 'refunds' } }, { file: join(api, 'docs', 'poney', 'refunds.poney') })
    expect(readWorkspace(file).documents).toEqual([path, join(api, 'docs', 'poney', 'refunds.poney')])
    files.close()
  })

  it('removes a document from its list, and keeps the file', () => {
    const { web } = repos()
    const file = join(web, 'acme.poney-workspace')
    const overview = join(web, 'docs', 'poney', 'overview.poney')
    writeWorkspace({ key: '', name: 'Acme', file, folders: [folderAt(web)], documents: [overview] })
    const { state, files } = hub()
    state.setWorkspace(readWorkspace(file))
    files.removeDocument(overview)
    expect(readWorkspace(file).documents).toEqual([])
    expect(existsSync(overview)).toBe(true)
    files.close()
  })
})

describe('saving a folder as a workspace', () => {
  it('writes its folder and documents, and moves its conversation to the new key', () => {
    const { web, api } = repos()
    const { state, files } = hub()
    state.setWorkspace(folderAt(web))
    state.put({ from: 'person', text: 'How does it start?' })
    const file = join(web, 'acme.poney-workspace')
    const { from, to, workspace } = files.saveWorkspace(file, 'Acme')
    state.rekey(from, to)
    state.setWorkspace(workspace)
    expect(state.projectKey()).toBe(file)
    expect(state.thread().map((m) => (m as { text?: string }).text)).toEqual(['How does it start?'])
    expect(readWorkspace(file)).toMatchObject({ name: 'Acme', documents: [join(web, 'docs', 'poney', 'overview.poney')] })
    state.setWorkspace(files.addFolder(api).workspace)
    expect(readWorkspace(file).folders.map((f) => f.name)).toEqual(['web', 'api'])
    expect(state.documents.documents.map((d) => d.id)).toEqual(['overview', 'billing'])
    state.setWorkspace(files.removeFolder(api))
    expect(readWorkspace(file).folders.map((f) => f.name)).toEqual(['web'])
    expect(() => files.removeFolder(web)).toThrow(/at least one folder/)
    files.close()
  })

  it('becomes an untitled workspace with a second folder, and keeps its conversation', () => {
    const { web, api } = repos()
    const { state, files } = hub()
    state.setWorkspace(folderAt(web))
    state.put({ from: 'person', text: 'How does it start?' })
    const { workspace, from } = files.addFolder(api)
    expect(from).toBe(web)
    state.rekey(from!, workspace.key)
    state.setWorkspace(workspace)
    expect(state.projectKey()).toMatch(/^untitled:/)
    expect(workspace.name).toBe('web + api')
    expect(workspace.folders.map((f) => f.name)).toEqual(['web', 'api'])
    expect(state.documents.documents.map((d) => d.id)).toEqual(['overview', 'billing'])
    expect(state.thread().map((m) => (m as { text?: string }).text)).toEqual(['How does it start?'])
    files.close()
    // The server keeps it until it is saved.
    expect(workspaceToOpen(workspace.key)).toMatchObject({ name: 'web + api', folders: [{ cwd: web }, { cwd: api }] })
  })
})

describe('an untitled workspace', () => {
  it('starts blank, takes folders and documents, and becomes a file when saved', () => {
    const { web, api } = repos()
    const { state, files } = hub()
    state.setWorkspace(files.newWorkspace())
    expect(state.workspace).toMatchObject({ name: 'Untitled workspace', folders: [] })
    expect(state.shown()).toBeUndefined()
    expect(() => files.create('Plan')).toThrow(/Add a folder first/)
    state.setWorkspace(files.addFolder(web).workspace)
    // Adding a folder opens none of its documents: the person selects one.
    expect(state.shown()).toBeUndefined()
    state.setWorkspace(files.addFolder(api).workspace)
    expect(state.workspace!.name).toBe('web + api')
    expect(state.documents.documents.map((d) => d.id)).toEqual(['overview', 'billing'])
    const plan = files.create('Plan')
    expect(state.workspace!.documents).toContain(plan)
    expect(workspaceToOpen(state.projectKey())).toMatchObject({ documents: state.workspace!.documents })
    state.setWorkspace(files.removeFolder(api)!)
    expect(state.workspace!.folders.map((f) => f.name)).toEqual(['web'])
    const untitled = state.projectKey()
    const file = join(web, 'acme.poney-workspace')
    const { to, workspace } = files.saveWorkspace(file, 'Acme')
    state.rekey(untitled, to)
    state.setWorkspace(workspace)
    expect(readWorkspace(file).name).toBe('Acme')
    expect(() => workspaceToOpen(untitled)).toThrow(/not saved and is gone/)
    files.close()
  })

  it('has no agent until it has a folder', async () => {
    const { AgentPool } = await import('../agents/pool')
    const { state, files } = hub()
    const pool = new AgentPool(state, () => ({ command: process.execPath, args: [], hubUrl: 'http://127.0.0.1:1' }))
    state.setWorkspace(files.newWorkspace())
    await expect(pool.connect({ providerId: 'claude-code' })).rejects.toThrow(/Add a folder/)
    files.close()
  })
})

describe('a document opened alone, with a folder', () => {
  /** A .poney file outside any repository, and a repository for its code. */
  function loose() {
    const { top, api } = repos()
    const dir = join(top, 'notes')
    mkdirSync(dir)
    const doc = join(dir, 'plan.poney')
    writeFileSync(doc, JSON.stringify({ ...tour, project: { ...tour.project, id: 'plan', name: 'Plan' } }, null, 2))
    return { doc, api }
  }

  it('gets a folder attached: a workspace of its own, which opens again with it', () => {
    const { doc, api } = loose()
    const a = hub()
    a.files.open(doc)
    expect(a.state.workspace).toBeUndefined()
    a.state.setWorkspace(a.files.addFolder(api).workspace)
    expect(a.state.projectKey()).toBe(`document:${doc}`)
    expect(a.state.project?.cwd).toBe(api)
    // One document: more need a saved workspace.
    expect(a.state.documents.documents.map((d) => d.id)).toEqual(['plan'])
    expect(() => a.files.create('Another')).toThrow(/document opened alone/)
    expect(a.files.agentOpen(tour, { file: join(api, 'docs', 'poney', 'more.poney') }).refused).toMatch(/document opened alone/)
    expect(a.files.agentOpen(tour).revision).toBeGreaterThan(0)
    expect(a.state.file).toBe(doc)
    a.files.close()
    const b = hub()
    b.files.open(doc)
    expect(b.state.projectKey()).toBe(`document:${doc}`)
    b.files.close()
  })

  it('becomes a workspace with a second folder; saved, it opens from its file next to the document', () => {
    const { doc, api } = loose()
    const web = join(api, '..', 'web')
    const { state, files } = hub()
    files.open(doc)
    state.setWorkspace(files.addFolder(api).workspace)
    const grown = files.addFolder(web)
    expect(grown.from).toBe(`document:${doc}`)
    state.setWorkspace(grown.workspace)
    expect(state.workspace!.documents![0]).toBe(doc)
    const file = join(doc, '..', 'plan.poney-workspace')
    const { from, to, workspace } = files.saveWorkspace(file)
    state.rekey(from, to)
    state.setWorkspace(workspace)
    expect(readWorkspace(file).folders.map((f) => f.name)).toEqual(['api', 'web'])
    files.close()
    const again = hub()
    again.files.open(doc)
    expect(again.state.projectKey()).toBe(file)
    again.files.close()
  })

  it('is alone again when its folder is removed', () => {
    const { doc, api } = loose()
    const { state, files } = hub()
    files.open(doc)
    state.setWorkspace(files.addFolder(api).workspace)
    state.setWorkspace(files.removeFolder(api))
    expect(state.workspace).toBeUndefined()
    expect(state.file).toBe(doc)
    files.close()
    const again = hub()
    again.files.open(doc)
    expect(again.state.workspace).toBeUndefined()
    again.files.close()
  })
})
