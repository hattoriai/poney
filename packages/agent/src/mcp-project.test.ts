import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { startHub, type Hub } from './live/hub'
import { workspaceFile } from './live/files'
import { folderAt } from './live/folder'

// The MCP server of an agent whose project (A) is not the one open in the Studio (B).
const mcpSource = fileURLToPath(new URL('./mcp.ts', import.meta.url))
const tour = JSON.parse(readFileSync(new URL('../examples/tour.poney', import.meta.url), 'utf8'))
const withWalkthrough = (id: string) => ({ ...tour, walkthroughs: [{ ...tour.walkthroughs[0], id, title: id }] })
type Result = { content: { type: string; text?: string }[]; isError?: boolean }
const textOf = (r: Result) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')

const home = mkdtempSync(join(tmpdir(), 'poney-home-'))
const a = realpathSync(mkdtempSync(join(tmpdir(), 'proj-a-')))
const b = realpathSync(mkdtempSync(join(tmpdir(), 'proj-b-')))
const client = new Client({ name: 'test', version: '0' })
let hub: Hub
let saved: string | undefined
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as Result
const fileA = () => JSON.parse(readFileSync(workspaceFile(folderAt(a)), 'utf8'))

beforeAll(async () => {
  saved = process.env.PONEY_HOME
  process.env.PONEY_HOME = home
  hub = await startHub(6200 + Math.floor(Math.random() * 100))
  hub.state.setWorkspace(folderAt(a))
  hub.state.open(withWalkthrough('only-a'))
  hub.state.setWorkspace(folderAt(b))
  hub.state.open(withWalkthrough('only-b'))
  await client.connect(new StdioClientTransport({ command: 'node', args: ['--conditions=poney-source', '--import', 'tsx', mcpSource], env: { ...process.env, PONEY_HUB_URL: hub.server.url, PONEY_PROJECT: a, PONEY_HOME: home } as Record<string, string>, stderr: 'ignore' }))
}, 30_000)
afterAll(async () => {
  await client.close()
  hub.server.stop()
  if (saved === undefined) delete process.env.PONEY_HOME
  else process.env.PONEY_HOME = saved
  rmSync(home, { recursive: true, force: true })
})

describe('an agent of a project that is not open', () => {
  it('reads its own project’s document', async () => {
    const read = JSON.parse(textOf(await call('poney_read', { includeDocument: true })))
    expect(read.document.walkthroughs.map((w: { id: string }) => w.id)).toEqual(['only-a'])
  })

  it('may not drop what is in its own project’s file', async () => {
    const r = await call('poney_open', { document: withWalkthrough('new-one') })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toContain('Not opened')
    expect(textOf(r)).toContain('only-a')
  })

  it('may leave out what only another project has, and is told it was saved', async () => {
    const r = await call('poney_open', { document: withWalkthrough('only-a') })
    expect(r.isError).toBeFalsy()
    expect(textOf(r)).toBe('Saved in its workspace. It shows when the person opens that workspace.')
    expect(hub.state.shown()?.document).toMatchObject({ walkthroughs: [{ id: 'only-b' }] })
  })

  it('imports into its own project’s document', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'js-'))
    writeFileSync(join(repo, 'a.js'), "import './b.js'\n")
    writeFileSync(join(repo, 'b.js'), 'export const x = 1\n')
    const r = await call('poney_import', { repo, importer: 'js-modules' })
    expect(textOf(r)).toContain('Saved in its workspace')
    const doc = fileA()
    expect(doc.walkthroughs.map((w: { id: string }) => w.id)).toEqual(['only-a'])
    expect(JSON.stringify(doc)).not.toContain('only-b')
  })
})

describe('an agent of a project whose file is not a valid document', () => {
  it('is refused, and the file stays as it is', async () => {
    const path = workspaceFile(folderAt(a))
    const conflicted = `<<<<<<< HEAD\n${readFileSync(path, 'utf8')}=======\n{}\n>>>>>>> theirs\n`
    writeFileSync(path, conflicted)
    const r = await call('poney_open', { document: withWalkthrough('new-one') })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toBe("The project's file is not a valid document. Not saved.")
    expect(readFileSync(path, 'utf8')).toBe(conflicted)
    // Reading tells an invalid file apart from a missing one.
    const read = JSON.parse(textOf(await call('poney_read', { includeDocument: true })))
    expect(read).toMatchObject({ document: null, problem: "The project's file is not a valid document." })
  })
})
