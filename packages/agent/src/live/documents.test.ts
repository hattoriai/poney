import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LiveState } from './state'
import { DocumentFiles } from './files'
import { folderAt } from './folder'

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

/** A folder with documents in docs/poney/, by id and name. */
function folderWith(...docs: [id: string, name: string][]) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'repo-')))
  mkdirSync(join(cwd, 'docs', 'poney'), { recursive: true })
  for (const [id, name] of docs) writeFileSync(join(cwd, 'docs', 'poney', `${id}.poney`), JSON.stringify({ ...tour, project: { ...tour.project, id, name } }, null, 2))
  return cwd
}
const hub = () => {
  const state = new LiveState()
  return { state, files: new DocumentFiles(state) }
}
const idIn = (path: string) => JSON.parse(readFileSync(path, 'utf8')).project.id

describe('a folder with several documents', () => {
  it('shows none until the person selects one, lists them, and opens the last one shown the next time', () => {
    const cwd = folderWith(['billing', 'Billing'], ['search', 'Search'])
    const a = hub()
    a.state.setWorkspace(folderAt(cwd))
    expect(a.state.shown()).toBeUndefined()
    expect(a.state.documents.shown).toBeNull()
    expect(a.state.documents.documents.map((d) => [d.id, d.name])).toEqual([
      ['billing', 'Billing'],
      ['search', 'Search'],
    ])
    a.files.open(join(cwd, 'docs', 'poney', 'search.poney'))
    expect(a.state.documents.shown).toBe(join(cwd, 'docs', 'poney', 'search.poney'))
    a.files.close()
    // Another hub (a restart) opens the one shown last.
    const b = hub()
    b.state.setWorkspace(folderAt(cwd))
    expect(b.state.file).toBe(join(cwd, 'docs', 'poney', 'search.poney'))
    expect(b.state.shown()?.document).toMatchObject({ project: { id: 'search' } })
    b.files.close()
  })

  it('refuses an agent document without a file while none is shown, and names the documents', () => {
    const cwd = folderWith(['billing', 'Billing'], ['search', 'Search'])
    const { state, files } = hub()
    state.setWorkspace(folderAt(cwd))
    const r = files.agentOpen(tour)
    expect(r.refused).toMatch(/several documents/)
    expect(r.refused).toContain('billing.poney')
    files.close()
  })

  it('writes an agent document into the shown one without changing its id', () => {
    const cwd = folderWith(['billing', 'Billing'], ['search', 'Search'])
    const { state, files } = hub()
    state.setWorkspace(folderAt(cwd))
    const billing = join(cwd, 'docs', 'poney', 'billing.poney')
    files.open(billing)
    const r = files.agentOpen({ ...tour, project: { ...tour.project, id: 'something-else' } })
    expect(r.revision).toBeGreaterThan(0)
    expect(idIn(billing)).toBe('billing')
    files.close()
  })

  it('saves an agent document into another document of the folder, keeping that file’s id, and does not show it', () => {
    const cwd = folderWith(['billing', 'Billing'], ['search', 'Search'])
    const { state, files } = hub()
    state.setWorkspace(folderAt(cwd))
    files.open(join(cwd, 'docs', 'poney', 'billing.poney'))
    const shown = state.shown()?.revision
    const changed = { ...tour, project: { ...tour.project, id: 'other', name: 'Search' }, views: tour.views.slice(1) }
    expect(files.agentOpen(changed, { file: 'docs/poney/search.poney' })).toEqual({ saved: true })
    const search = JSON.parse(readFileSync(join(cwd, 'docs', 'poney', 'search.poney'), 'utf8'))
    expect(search.project.id).toBe('search')
    expect(search.views).toHaveLength(tour.views.length - 1)
    expect(state.shown()?.revision).toBe(shown)
    expect(state.thread().at(-1)).toMatchObject({ from: 'notice' })
    files.close()
  })

  it('makes a new document at a new path and shows it; it keeps its own id unless another document has it', () => {
    const cwd = folderWith(['billing', 'Billing'])
    const { state, files } = hub()
    state.setWorkspace(folderAt(cwd))
    files.agentOpen({ ...tour, project: { ...tour.project, id: 'payments' } }, { file: 'docs/poney/payments.poney' })
    expect(state.file).toBe(join(cwd, 'docs', 'poney', 'payments.poney'))
    expect(idIn(state.file!)).toBe('payments')
    files.agentOpen({ ...tour, project: { ...tour.project, id: 'billing' } }, { file: 'docs/poney/refunds.poney' })
    expect(idIn(join(cwd, 'docs', 'poney', 'refunds.poney'))).toBe('refunds')
    expect(state.documents.documents.map((d) => d.id)).toEqual(['billing', 'payments', 'refunds'])
    files.close()
  })

  it('creates an empty document with a name, a free id, and shows it', () => {
    const cwd = folderWith(['billing', 'Billing'])
    const { state, files } = hub()
    state.setWorkspace(folderAt(cwd))
    const path = files.create('Billing')
    expect(path).toBe(join(cwd, 'docs', 'poney', 'billing-2.poney'))
    expect(existsSync(path)).toBe(true)
    expect(state.file).toBe(path)
    expect(state.shown()?.document).toMatchObject({ project: { id: 'billing-2', name: 'Billing' } })
    files.close()
  })
})
