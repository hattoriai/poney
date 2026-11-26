import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { builtInProviders, parseCommand } from './providers'
import { cloneRepository, listFolders } from './workspace'

describe('providers', () => {
  it('knows the four agents, and finds the bundled adapters', () => {
    const p = builtInProviders()
    expect(p.map((x) => x.id)).toEqual(['claude-code', 'codex', 'opencode', 'copilot'])
    expect(p.find((x) => x.id === 'claude-code')?.available).toBe(true)
    expect(p.find((x) => x.id === 'codex')?.available).toBe(true)
  })

  it('reads a command line, with quotes', () => {
    expect(parseCommand('my-agent --acp "a b"')).toEqual({ command: 'my-agent', args: ['--acp', 'a b'] })
    expect(parseCommand('   ')).toBeUndefined()
  })
})

describe('workspaces', () => {
  it('lists folders and marks Git repositories', () => {
    const root = mkdtempSync(join(tmpdir(), 'poney-ws-'))
    mkdirSync(join(root, 'plain'))
    mkdirSync(join(root, 'repo', '.git'), { recursive: true })
    mkdirSync(join(root, '.hidden'))
    const f = listFolders(root)
    expect(f.folders.map((x) => [x.name, x.git])).toEqual([
      ['plain', false],
      ['repo', true],
    ])
  })

  it('refuses addresses that are not Git remotes, or that look like options', async () => {
    await expect(cloneRepository('--upload-pack=touch /tmp/x')).rejects.toThrow(/https/)
    await expect(cloneRepository('file:///etc')).rejects.toThrow(/https/)
    await expect(cloneRepository('https://example.com/a b')).rejects.toThrow(/https/)
  })
})
