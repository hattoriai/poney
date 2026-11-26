import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import { validateDocument } from '@hattoriai/poney-core'

/**
 * Runs the language-neutral conformance suite against the TypeScript
 * reference implementation, and checks that the published JSON Schema agrees
 * with it on every document's shape.
 */
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const manifest = JSON.parse(readFileSync(here('./conformance/manifest.json'), 'utf8')) as {
  cases: { file: string; valid: boolean; rule: string; description: string; errorPaths?: string[] }[]
}
const schema = JSON.parse(readFileSync(here('./poney.schema.json'), 'utf8'))
const ajv = new Ajv({ strict: false, allErrors: true })
const checkShape = ajv.compile(schema)

describe('conformance suite', () => {
  for (const c of manifest.cases) {
    it(`${c.valid ? 'accepts' : 'rejects'} ${c.file} (${c.rule})`, () => {
      const doc = JSON.parse(readFileSync(here(`./conformance/${c.file}`), 'utf8'))
      const result = validateDocument(doc)
      expect(result.ok, JSON.stringify(result.issues)).toBe(c.valid)
      const paths = result.issues.filter((i) => i.severity === 'error').map((i) => i.path)
      for (const p of c.errorPaths ?? []) expect(paths).toContain(p)
      // Shape-only failures must also fail the JSON Schema.
      if (c.rule === '§4') expect(checkShape(doc)).toBe(false)
      else expect(checkShape(doc), JSON.stringify(checkShape.errors)).toBe(true)
    })
  }

  it('the published example matches the schema and validates', () => {
    const doc = JSON.parse(readFileSync(here('./examples/kestrel-commerce.poney'), 'utf8'))
    expect(checkShape(doc), JSON.stringify(checkShape.errors?.slice(0, 3))).toBe(true)
    expect(validateDocument(doc).issues.filter((i) => i.severity === 'error')).toEqual([])
  })
})
