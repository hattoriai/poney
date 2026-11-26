import { describe, expect, it } from 'vitest'
import { parseDocument } from '@poney/core'
import { verifyCode, verifyExcerpts, verifySources, type FileSource } from './verify'

const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,4 +10,5 @@ function f()
 const x = 1
-return x
+if (x) return x
+return 0
 }
`
const doc = (lines: unknown[]) =>
  parseDocument({
    poneyVersion: '0.1.0',
    project: { id: 'p', name: 'P' },
    walkthroughs: [{ id: 'w', title: 'T', summary: 'S', story: { text: 't', before: 'b', after: 'a' }, scenes: [{ id: 's', title: 'S', text: 'T', code: [{ path: 'src/a.ts', hunks: [{ lines }] }] }] }],
  })

describe('verifyCode', () => {
  it('accepts lines that are in the diff as numbered', () => {
    const d = doc([
      { kind: 'ctx', old: 10, new: 10, text: 'const x = 1' },
      { kind: 'del', old: 11, text: 'return x' },
      { kind: 'add', new: 11, text: 'if (x) return x' },
    ])
    expect(verifyCode(d, diff)).toEqual([])
  })

  it('says where a misnumbered line really is', () => {
    const issues = verifyCode(doc([{ kind: 'add', new: 12, text: 'if (x) return x' }]), diff)
    expect(issues[0]).toMatchObject({ message: 'Added line 12 is not "if (x) return x"', hint: 'That text is added at line 11.' })
  })

  it('refuses a file that the change does not touch', () => {
    const issues = verifyCode(doc([{ kind: 'add', new: 11, text: 'if (x) return x' }]), diff.replace(/src\/a.ts/g, 'src/b.ts'))
    expect(issues[0].message).toBe('"src/a.ts" is not in the diff')
  })
})

describe('tour excerpts', () => {
  const files: Record<string, string> = { 'src/save.ts': 'export function save() {\n  check()\n  write()\n}\n', 'test/save.test.ts': "it('saves once')\n" }
  const source: FileSource = { label: 'test files', read: (p) => files[p], files: () => Object.keys(files) }
  const tour = (code: unknown, extra: Record<string, unknown> = {}) =>
    parseDocument({
      poneyVersion: '0.1.0',
      project: { id: 't', name: 'T' },
      model: { entities: [{ id: 'a', kind: 'module', name: 'A', summary: 'A', sourceRefs: [{ path: 'src/save.ts', symbol: 'save' }], ...extra }] },
      walkthroughs: [{ id: 'w', kind: 'tour', title: 'T', summary: 'S', story: { text: 'A tour.' }, scenes: [{ id: 's', title: 'S', text: 'S', code: [code] }] }],
    })

  it('accepts an excerpt that is in the file at its lines', () => {
    expect(verifyExcerpts(tour({ path: 'src/save.ts', start: 2, text: '  check()\n  write()' }), source)).toEqual([])
  })

  it('says where a shifted excerpt really is', () => {
    const issues = verifyExcerpts(tour({ path: 'src/save.ts', start: 1, text: '  check()' }), source)
    expect(issues[0]).toMatchObject({ code: 'code-not-in-file', hint: expect.stringContaining('at line 2') })
  })

  it('suggests a path for a file that is not there', () => {
    const issues = verifyExcerpts(tour({ path: 'save.ts', start: 1, text: 'x' }), source)
    expect(issues[0].hint).toContain('"src/save.ts"')
  })

  it('checks source references', () => {
    expect(verifySources(tour({ path: 'src/save.ts', start: 1, text: 'export function save() {' }), source)).toEqual([])
    const bad = tour({ path: 'src/save.ts', start: 1, text: 'export function save() {' }, { sourceRefs: [{ path: 'src/save.ts', symbol: 'load' }, { path: 'src/gone.ts' }] })
    expect(verifySources(bad, source).map((i) => i.code)).toEqual(['source-not-found', 'source-not-found'])
  })
})
