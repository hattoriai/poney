/**
 * What the local server remembers between runs, in the Poney home
 * (workspaces.json): the document each workspace showed last, and the
 * folders attached to a document opened alone. Only a convenience: a file
 * that is missing or broken counts as empty.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { poneyHome } from '../home'

export interface Memory {
  version: 1
  /** The document shown last, by workspace key. */
  last: Record<string, string>
  /** The folders attached to a document opened alone, by the document's path. */
  attached: Record<string, string[]>
  /** Workspaces not saved to a file yet, by id. */
  untitled: Record<string, { name: string; folders: string[]; documents: string[] }>
}

const file = () => join(poneyHome(), 'workspaces.json')

export function readMemory(): Memory {
  try {
    const v = existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Partial<Memory>) : {}
    return { version: 1, last: v.last ?? {}, attached: v.attached ?? {}, untitled: v.untitled ?? {} }
  } catch {
    return { version: 1, last: {}, attached: {}, untitled: {} }
  }
}

/** Changes the memory and writes it. */
export function changeMemory(change: (m: Memory) => void): void {
  const m = readMemory()
  change(m)
  try {
    mkdirSync(dirname(file()), { recursive: true })
    writeFileSync(file(), `${JSON.stringify(m, null, 2)}\n`)
  } catch {
    /* only a convenience */
  }
}
