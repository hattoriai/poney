/**
 * A fingerprint of the hub's code: the newest change time of the sources it
 * runs. In development, the Studio's dev server compares it with the code on
 * disk, so a hub that runs older code is noticed (and, when the dev server
 * started it, replaced).
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCES = ['../../src', '../../../core/src', '../../../react/src', '../../../layout/src'].map((p) => fileURLToPath(new URL(p, import.meta.url)))

export function buildStamp(): string {
  let newest = 0
  const walk = (dir: string) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const path = join(dir, e.name)
      if (e.isDirectory()) walk(path)
      else if (/\.(ts|tsx)$/.test(e.name)) newest = Math.max(newest, statSync(path).mtimeMs)
    }
  }
  SOURCES.forEach(walk)
  return String(Math.round(newest))
}
