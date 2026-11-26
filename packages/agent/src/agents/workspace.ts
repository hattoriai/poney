/**
 * Workspaces: the folder an agent works in. A person picks a folder on this
 * machine, or gives a Git address and Poney clones it.
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Where cloned repositories go. */
export const CLONES = join(homedir(), '.poney', 'workspaces')

export interface Folder {
  path: string
  parent?: string
  /** True when the folder is a Git repository. */
  git: boolean
  folders: { name: string; path: string; git: boolean }[]
  /** Poney documents in the folder. */
  files: { name: string; path: string }[]
}

const isGit = (dir: string) => existsSync(join(dir, '.git'))

/** The folders inside a folder, for a folder picker. Hidden folders are left out. */
export function listFolders(path?: string): Folder {
  const dir = resolve(path || homedir())
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`No folder "${dir}"`)
  const entries = readdirSync(dir, { withFileTypes: true })
  const files = entries.filter((e) => e.isFile() && e.name.endsWith('.poney')).map((e) => ({ name: e.name, path: join(dir, e.name) })).sort((a, b) => a.name.localeCompare(b.name))
  const folders = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
    .map((e) => ({ name: e.name, path: join(dir, e.name), git: isGit(join(dir, e.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const parent = dirname(dir)
  return { path: dir, parent: parent === dir ? undefined : parent, git: isGit(dir), folders, files }
}

/** A folder an agent may work in: it must exist. */
export function checkFolder(path: string): string {
  const dir = resolve(path)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`No folder "${dir}"`)
  return dir
}

const GIT_URL = /^(https:\/\/[\w.@:/~-]+|git@[\w.-]+:[\w./~-]+|ssh:\/\/[\w.@:/~-]+)$/

/**
 * Clones a repository into ~/.poney/workspaces, or reuses an earlier clone.
 * Only https, ssh and git@ addresses are accepted.
 */
export async function cloneRepository(url: string): Promise<string> {
  const clean = url.trim().replace(/\/+$/, '')
  if (!GIT_URL.test(clean)) throw new Error('Give an https://, ssh:// or git@ address of a Git repository.')
  const name = basename(clean).replace(/\.git$/, '').replace(/[^\w.-]/g, '-') || 'repository'
  const owner = basename(dirname(clean.replace(/^git@[^:]+:/, '/'))).replace(/[^\w.-]/g, '-')
  const dest = join(CLONES, owner ? `${owner}-${name}` : name)
  if (isGit(dest)) return dest
  mkdirSync(CLONES, { recursive: true })
  try {
    await run('git', ['clone', '--depth', '100', '--', clean, dest], { timeout: 10 * 60_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  } catch (e) {
    const err = e as { stderr?: string; message: string }
    throw new Error(`git clone failed: ${(err.stderr ?? err.message).trim().split('\n').pop()}`)
  }
  return dest
}

/* ─── Finding files, for "@" in the message box ───────────────────────── */

const fileLists = new Map<string, { at: number; files: string[] }>()

/** The files of a folder: what git tracks (and new files it does not ignore), else a walk that skips the usual heavy folders. */
async function filesOf(dir: string): Promise<string[]> {
  const hit = fileLists.get(dir)
  if (hit && Date.now() - hit.at < 30_000) return hit.files
  let files: string[]
  try {
    const { stdout } = await run('git', ['-C', dir, 'ls-files', '--cached', '--others', '--exclude-standard'], { maxBuffer: 64 * 1024 * 1024 })
    files = stdout.split('\n').filter(Boolean)
  } catch {
    files = []
    const walk = (rel: string, depth: number) => {
      if (files.length > 20_000 || depth > 8) return
      for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === '_build' || e.name === 'deps') continue
        const path = rel ? `${rel}/${e.name}` : e.name
        if (e.isDirectory()) walk(path, depth + 1)
        else files.push(path)
      }
    }
    walk('', 0)
  }
  fileLists.set(dir, { at: Date.now(), files })
  return files
}

/** Files whose path holds every word of the query; names that start with it come first. */
export async function searchFiles(dir: string, query: string, limit = 8): Promise<string[]> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const files = await filesOf(checkFolder(dir))
  const score = (path: string) => {
    const p = path.toLowerCase()
    const name = basename(p)
    if (!words.every((w) => p.includes(w))) return -1
    const w = words[words.length - 1] ?? ''
    return (name.startsWith(w) ? 3 : name.includes(w) ? 2 : 1) * 1000 - path.length
  }
  return files
    .map((f) => [f, score(f)] as const)
    .filter(([, s]) => s >= 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([f]) => f)
}
