import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { THEMES } from '../theme'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const css = (name: string) => readFileSync(here(`./${name}`), 'utf8')
const all = ['tokens.css', 'diagrams.css', 'stories.css', 'motion.css', 'legend.css'].map(css).join('\n')
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? sources(join(dir, f)) : /\.tsx?$/.test(f) && !f.includes('.test.') ? [join(dir, f)] : []))
const code = [...sources(here('..')), ...sources(here('../../../ext-ownership/src'))].map((f) => readFileSync(f, 'utf8')).join('\n')

/** The --poney-* tokens a CSS block declares. */
const tokensIn = (block: string) => Object.fromEntries([...block.matchAll(/--poney-([a-z0-9-]+):\s*(#[0-9a-fA-F]+);/g)].map((m) => [m[1], m[2]]))

describe('@hattoriai/poney-diagrams styles', () => {
  it('declare the same colours as THEMES, for light and dark', () => {
    const [light, dark] = css('tokens.css').split("[data-poney-theme='dark']")
    expect(tokensIn(light)).toEqual(THEMES.light)
    expect(tokensIn(dark)).toEqual(THEMES.dark)
  })

  it('define every class the renderers use (all of them .poney-*)', () => {
    const used = new Set([...code.matchAll(/\bponey-[a-z-]+/g)].map((m) => m[0]).filter((c) => code.includes(`'${c}`) || code.includes(`"${c}`) || code.includes(` ${c}`) || code.includes(`\`${c}`)))
    const defined = new Set([...all.matchAll(/\.(poney-[a-z-]+)/g)].map((m) => m[1]))
    // Markers that carry no style of their own: the shape that rings and fills target.
    const markers = new Set(['poney-body'])
    // The literal class names, with the ${…} parts of template strings left out.
    const literal = (t: string) => t.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, ' ')
    const classes = [...code.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].flatMap((m) => literal(m[1] ?? m[2]).split(/\s+/)).filter((c) => /^[a-z]/.test(c))
    // …and the names those parts give: quoted poney-* strings.
    classes.push(...[...code.matchAll(/['"](poney-[a-z-]+)['"]/g)].map((m) => m[1]))
    expect(classes.filter((c) => !c.startsWith('poney-'))).toEqual([])
    expect([...new Set(classes)].filter((c) => !defined.has(c) && !markers.has(c))).toEqual([])
    expect(used.size).toBeGreaterThan(10)
  })

  it('stay in the "poney" layer, with no Tailwind and nothing global', () => {
    for (const name of ['tokens.css', 'diagrams.css', 'stories.css', 'motion.css', 'legend.css']) {
      const text = css(name).replace(/\/\*[\s\S]*?\*\//g, '').trim()
      expect(text.startsWith('@layer poney {'), name).toBe(true)
      expect(text).not.toMatch(/@tailwind|@apply|!important/)
    }
    // Every selector is a :where(), so the host app's styles win.
    const selectors = [...all.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/^[ \t]*([^@\s{}][^{}\n]*)\{/gm)].map((m) => m[1].trim()).filter((s) => !/^(to|from|\d+%)/.test(s))
    /** Splits a selector list at the commas that are not inside parentheses. */
    const parts = (list: string) => list.split(/,(?![^(]*\))/).map((x) => x.trim())
    expect(selectors.filter((s) => !parts(s).every((x) => x.startsWith(':where(')))).toEqual([])
  })

  it('build into one minified file for apps without a bundler', async () => {
    const r = await build({ entryPoints: [here('./index.css')], bundle: true, minify: true, write: false, logLevel: 'silent' })
    const out = r.outputFiles[0].text
    expect(out).not.toContain('@import')
    expect(out).toContain('--poney-accent')
    expect(out.length).toBeLessThan(6000)
  })
})
