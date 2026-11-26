import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// The MCP server from source, as in development.
const mcpSource = fileURLToPath(new URL('./mcp.ts', import.meta.url))
const examplePath = fileURLToPath(new URL('../examples/walkthrough.poney', import.meta.url))
const port = 5339 + Math.floor(Math.random() * 50)
const client = new Client({ name: 'test', version: '0' })

type Result = { content: { type: string; text?: string; data?: string }[]; isError?: boolean }
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as Result
const textOf = (r: Result) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')

beforeAll(async () => {
  await client.connect(new StdioClientTransport({ command: 'node', args: ['--conditions=poney-source', '--import', 'tsx', mcpSource], env: { ...process.env, PONEY_PORT: String(port) } as Record<string, string>, stderr: 'ignore' }))
}, 30_000)
afterAll(async () => client.close())

describe('poney MCP server', () => {
  it('lists its tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['poney_check', 'poney_excerpt', 'poney_guide', 'poney_import', 'poney_open', 'poney_overlay', 'poney_read', 'poney_render', 'poney_reply', 'poney_schema', 'poney_wait'])
  })

  it('teaches the format', async () => {
    const t = textOf(await call('poney_guide'))
    expect(t).toContain('# Writing a Poney walkthrough')
    expect(t).toContain('"walkthroughs"')
    const tour = textOf(await call('poney_guide', { topic: 'tour' }))
    expect(tour).toContain('# A tour')
    expect(tour).toContain('"kind": "tour"')
  })

  it('checks a document and explains a mistake', async () => {
    expect(textOf(await call('poney_check', { path: examplePath }))).toContain('Valid.')
    const doc = JSON.parse(readFileSync(examplePath, 'utf8'))
    doc.walkthroughs[0].scenes[0].callouts[0].target = 'transition:account:t-locked'
    const r = await call('poney_check', { document: doc })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toContain('Did you mean "transition:account:t-lock"?')
  })

  it('renders a scene as an image', async () => {
    const r = await call('poney_render', { path: examplePath, scene: 'states' })
    const image = r.content.find((c) => c.type === 'image')
    expect(Buffer.from(image!.data!, 'base64').subarray(1, 4).toString()).toBe('PNG')
  }, 30_000)

  it('opens a document for the Studio, and reads back what the Studio reports', async () => {
    expect(textOf(await call('poney_open', { path: examplePath }))).toMatch(/Opened revision 1/)
    const base = `http://127.0.0.1:${port}`
    expect(await (await fetch(`${base}/api/live`)).json()).toMatchObject({ poney: true, revision: 1, viewers: 0, owner: 'other' })
    await fetch(`${base}/api/live/state`, {
      method: 'POST',
      body: JSON.stringify({ projectId: 'acme-notes', walkthrough: 'lockout', scene: 'states', notes: { states: 'Also lock password resets.' }, answers: { states: 'Ask for a change' } }),
    })
    const read = JSON.parse(textOf(await call('poney_read')))
    expect(read).toMatchObject({ scene: 'states', notes: { states: 'Also lock password resets.' }, answers: { states: 'Ask for a change' }, changedDocument: false })
  })

  it('waits for a question from the Studio, and replies in the thread', async () => {
    const base = `http://127.0.0.1:${port}`
    expect(textOf(await call('poney_wait', { timeoutSeconds: 1 }))).toContain('No question yet')
    const waiting = call('poney_wait', { timeoutSeconds: 20 })
    await new Promise((r) => setTimeout(r, 300))
    const asked = await fetch(`${base}/api/live/ask`, { method: 'POST', body: JSON.stringify({ text: 'Why lock after five?', walkthrough: 'lockout', scene: 'states' }) })
    expect(asked.status).toBe(200)
    const got = JSON.parse(textOf(await waiting))
    expect(got.questions).toMatchObject([{ id: 1, from: 'person', text: 'Why lock after five?', scene: 'states' }])
    expect(textOf(await call('poney_reply', { text: 'It matches the bank rule.', inReplyTo: 1, scene: 'states' }))).toContain('Replied (message 2)')
    const read = JSON.parse(textOf(await call('poney_read')))
    expect(read.thread.map((m: { from: string }) => m.from)).toEqual(['person', 'agent'])
    // A question already seen is not returned again.
    expect(textOf(await call('poney_wait', { timeoutSeconds: 1 }))).toContain('No question yet')
  }, 30_000)

  it('does not drop what is open, unless asked to', async () => {
    const doc = JSON.parse(readFileSync(examplePath, 'utf8'))
    const fewer = { ...doc, walkthroughs: [{ ...doc.walkthroughs[0], id: 'other', title: 'Other' }] }
    const refused = await call('poney_open', { document: fewer })
    expect(refused.isError).toBe(true)
    expect(textOf(refused)).toMatch(/leaves them out.*poney_read/s)
    expect(textOf(await call('poney_open', { document: { ...doc, walkthroughs: [...doc.walkthroughs, fewer.walkthroughs[0]] } }))).toMatch(/Opened revision/)
    expect(textOf(await call('poney_open', { document: fewer, replace: true }))).toMatch(/Opened revision/)
  }, 30_000)

  it('imports a database schema into the open document, adding to it', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const repo = mkdtempSync(join(tmpdir(), 'poney-mcp-import-'))
    mkdirSync(join(repo, 'db'))
    writeFileSync(join(repo, 'db', 'schema.rb'), 'create_table "accounts", force: :cascade do |t|\n  t.string "email", null: false\nend\n')
    expect(textOf(await call('poney_import', { repo }))).toMatch(/- schema: .*Would read db\/schema.rb/)
    const before = JSON.parse(textOf(await call('poney_read', { includeDocument: true }))).document
    const r = await call('poney_import', { repo, importer: 'schema' })
    expect(textOf(r)).toMatch(/Added 1 table, 1 view\.[\s\S]*Opened revision/)
    const after = JSON.parse(textOf(await call('poney_read', { includeDocument: true }))).document
    expect(after.walkthroughs.map((w: { id: string }) => w.id)).toEqual(before.walkthroughs.map((w: { id: string }) => w.id))
    expect(after.model.dataTypes.map((d: { id: string }) => d.id)).toContain('accounts')
  }, 30_000)
})
