import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The renderers are for any app: they take everything from their host
 * (RenderProvider) and never import an app's code, an app's state library
 * or a UI framework.
 */
const root = fileURLToPath(new URL('../', import.meta.url))
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : /\.tsx?$/.test(f) && !f.includes('.test.') ? [join(dir, f)] : []))

describe('@hattoriai/poney-diagrams', () => {
  it('imports no app code and no app state library', () => {
    const bad = files(root).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]).filter((spec) => spec.startsWith('@/') || /^(zustand|@poney\/studio)/.test(spec)).map((spec) => `${f.slice(root.length)}: ${spec}`),
    )
    expect(bad).toEqual([])
  })

  it('imports no UI framework: any app can draw with it', () => {
    const bad = files(root).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/(?:from\s+|@jsxImportSource\s+)['"]?([^'"\s*]+)/g)].map((m) => m[1]).filter((spec) => /^(react|react-dom|preact|vue|svelte|lit|solid-js|lucide-react)(\/|$)/.test(spec)).map((spec) => `${f.slice(root.length)}: ${spec}`),
    )
    expect(bad).toEqual([])
  })
})
