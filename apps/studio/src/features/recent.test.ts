import { beforeEach, describe, expect, it } from 'vitest'

// The browser's storage, for Node.
const data = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) },
})
const { forgetRecentWorkspace, listRecentWorkspaces, saveRecentWorkspace } = await import('./recent')

describe('recent workspaces', () => {
  beforeEach(() => data.clear())

  it('keeps the last one first, and a folder saved as a workspace file once', () => {
    saveRecentWorkspace({ key: '/code/web', name: 'web', file: null, folders: [{ path: '/code/web', name: 'web' }] })
    saveRecentWorkspace({ key: '/code/api', name: 'api', file: null, folders: [{ path: '/code/api', name: 'api' }] })
    saveRecentWorkspace({ key: '/code/web/acme.poney-workspace', name: 'Acme', file: '/code/web/acme.poney-workspace', folders: [{ path: '/code/web', name: 'web' }, { path: '/code/api', name: 'api' }] })
    expect(listRecentWorkspaces().map((w) => [w.key, w.folders.length])).toEqual([
      ['/code/web/acme.poney-workspace', 2],
      ['/code/api', 1],
    ])
    forgetRecentWorkspace('/code/api')
    expect(listRecentWorkspaces().map((w) => w.name)).toEqual(['Acme'])
  })
})
