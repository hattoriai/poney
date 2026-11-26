import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseDocument } from '@hattoriai/poney-core'
import { coverageOverlay } from './overlays/coverage'
import { churnOverlay } from './overlays/churn'
import { plugins, resetPlugins } from './registry'

const project = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'poney-overlay-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

const doc = parseDocument({
  poneyVersion: '0.1.0',
  project: { id: 'app', name: 'App', description: '' },
  model: {
    entities: [
      { id: 'api', kind: 'service', name: 'API', summary: '', sourceRefs: [{ path: 'src/api' }] },
      { id: 'jobs', kind: 'service', name: 'Jobs', summary: '', sourceRefs: [{ path: 'src/jobs/worker.ts' }] },
      { id: 'docs', kind: 'module', name: 'Docs', summary: '' },
    ],
  },
})

describe('the coverage overlay', () => {
  it('sums lcov lines per part through its source paths, and marks the parts under half', async () => {
    const dir = project({
      'coverage/lcov.info': ['SF:src/api/a.ts', 'LF:10', 'LH:9', 'end_of_record', 'SF:src/api/b.ts', 'LF:10', 'LH:7', 'end_of_record', 'SF:src/jobs/worker.ts', 'LF:20', 'LH:5', 'end_of_record'].join('\n'),
    })
    const r = await coverageOverlay.read(dir, doc)
    expect(r.marks).toEqual([
      { target: 'entity:api', badge: { text: '80% tested', tone: 'malachite' } },
      { target: 'entity:jobs', badge: { text: '25% tested', tone: 'poney' }, effect: 'attention' },
    ])
  })

  it('reads SimpleCov (absolute paths) and ExCoveralls', async () => {
    const simple = project({})
    writeFileSync(join(simple, 'x'), '')
    mkdirSync(join(simple, 'coverage'))
    writeFileSync(join(simple, 'coverage/.resultset.json'), JSON.stringify({ RSpec: { coverage: { [join(simple, 'src/api/a.rb')]: { lines: [1, null, 0, 1] } } } }))
    expect((await coverageOverlay.read(simple, doc)).marks).toEqual([{ target: 'entity:api', badge: { text: '67% tested', tone: 'ochre' } }])
    const ex = project({ 'cover/excoveralls.json': JSON.stringify({ source_files: [{ name: 'src/jobs/worker.ts', coverage: [null, 1, 1] }] }) })
    expect((await coverageOverlay.read(ex, doc)).marks).toEqual([{ target: 'entity:jobs', badge: { text: '100% tested', tone: 'malachite' } }])
  })

  it('says so when there is no report', async () => {
    const r = await coverageOverlay.read(project({}), doc)
    expect(r.marks).toEqual([])
    expect(r.notes[0]).toMatch(/No coverage report found/)
  })
})

describe('the churn overlay', () => {
  it('counts the commits that touched each part, and marks the busiest', async () => {
    const dir = project({ 'src/api/a.ts': '0', 'src/jobs/worker.ts': '0' })
    const git = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { stdio: 'ignore' })
    git('init', '-q')
    git('add', '.')
    git('commit', '-qm', 'start')
    for (let i = 1; i <= 5; i++) {
      writeFileSync(join(dir, 'src/api/a.ts'), String(i))
      git('commit', '-qam', `api ${i}`)
    }
    const r = await churnOverlay.read(dir, doc)
    expect(r.marks).toEqual([
      { target: 'entity:api', badge: { text: '6 changes in 90 d' }, effect: 'attention' },
      { target: 'entity:jobs', badge: { text: '1 change in 90 d' } },
    ])
  })
})

describe('plugins', () => {
  afterEach(() => {
    delete process.env.PONEY_PLUGINS
    resetPlugins()
  })

  it('loads the person’s own plugins from their list; a later one with the same id replaces a built-in', async () => {
    const dir = project({
      'mine.mjs': `export default { name: 'mine', overlays: [{ id: 'churn', name: 'My churn', description: 'Mine.', detect: () => ['x'], read: async () => ({ title: 'Mine', at: '', marks: [], notes: [] }) }] }`,
      'broken.mjs': `export default 42`,
    })
    writeFileSync(join(dir, 'plugins.json'), JSON.stringify({ plugins: [join(dir, 'mine.mjs'), join(dir, 'broken.mjs')] }))
    process.env.PONEY_PLUGINS = join(dir, 'plugins.json')
    resetPlugins()
    const p = await plugins()
    expect(p.plugins.map((x) => x.name)).toEqual(['poney', 'mine'])
    expect(p.overlays.map((o) => o.name)).toEqual(['Test coverage', 'My churn'])
    expect(p.importers.map((i) => i.id)).toEqual(['schema', 'js-modules'])
    expect(p.problems).toEqual([expect.stringMatching(/broken\.mjs" did not load: its default export is not a plugin/)])
  })
})
