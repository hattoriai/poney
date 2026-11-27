import { describe, expect, it } from 'vitest'
import { briefing } from './bridge'
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

describe('briefing', () => {
  it('names every folder of a workspace as its code, with none of them extra', () => {
    const text = briefing('/w/api', ['/w/worker'])
    expect(text).toContain('Its folders are: /w/api, /w/worker.')
    expect(text).toContain('a tour or an answer covers every folder that has code for it')
    expect(text).not.toContain('may read')
    expect(text).not.toContain('repo "/w/api"')
  })

  it('names the one folder of a folder opened alone', () => {
    const text = briefing('/w/api')
    expect(text).toContain('understand the code in /w/api.')
    expect(text).toContain('Give "/w/api" as `repo`.')
  })
})
