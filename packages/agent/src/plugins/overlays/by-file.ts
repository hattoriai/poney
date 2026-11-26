import { isAbsolute, relative } from 'node:path'
import type { PoneyDocument } from '@poney/core'

/** A path as the document writes source refs: relative to the folder, with "/". */
export function relativeTo(dir: string, path: string): string {
  const p = isAbsolute(path) ? relative(dir, path) : path
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}

/** Does a source ref path (a file or a folder) cover a file? */
export const covers = (ref: string, file: string) => {
  const r = ref.replace(/^\.\/?/, '').replace(/\/$/, '')
  return r === '' || file === r || file.startsWith(`${r}/`)
}

/**
 * Sums a fact per file over the parts of a document, through their source
 * refs (a part whose ref is a folder gets every file inside). Parts without
 * source refs, or whose files have no facts, are left out.
 */
export function perEntity<T>(doc: PoneyDocument, files: Map<string, T>, sum: (items: T[]) => T): Map<string, T> {
  const out = new Map<string, T>()
  const paths = [...files.keys()]
  for (const e of doc.model.entities) {
    const refs = e.sourceRefs.map((s) => s.path)
    if (!refs.length) continue
    const mine = paths.filter((f) => refs.some((r) => covers(r, f)))
    if (mine.length) out.set(e.id, sum(mine.map((f) => files.get(f)!)))
  }
  return out
}
