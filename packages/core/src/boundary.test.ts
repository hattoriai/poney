import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import pkg from '../package.json'

/**
 * The format must never depend on a renderer. The Studio is one possible
 * reader of Poney; other tools and other languages are others.
 */
const FORBIDDEN = /from\s+['"](react|react-dom|@xyflow\/[^'"]+|reactflow|elkjs[^'"]*|zustand|lucide-react|@radix-ui\/[^'"]+)['"]/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []
  })
}

describe('@hattoriai/poney-core boundary', () => {
  it('imports no UI, layout or state library', () => {
    const offenders = files(__dirname).filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('has no dependency other than zod', () => {
    expect(Object.keys(pkg.dependencies)).toEqual(['zod'])
  })
})
