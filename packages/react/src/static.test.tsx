/** @jsxRuntime automatic @jsxImportSource react */
import { describe, expect, it } from 'vitest'
import { parseDocument } from '@poney/core'
import { commerce } from '@poney/examples'
import { ownership } from '@poney/ext-ownership'
import { renderScene, renderScenePng } from './static'

const doc = parseDocument(commerce, { extensions: [ownership] })

describe('headless rendering', () => {
  for (const scene of ['overview', 'lifecycle', 'checkout', 'retry', 'window']) {
    it(`renders ${scene} to a self-contained SVG`, async () => {
      const r = await renderScene(doc, { scene })
      expect(r.svg).toMatch(/^<svg xmlns/)
      expect(r.svg).not.toContain('var(--')
      expect(r.svg).not.toContain('class="dg-focus"')
      expect(r.width).toBeGreaterThan(500)
    })
  }

  it('renders a PNG', async () => {
    const r = await renderScenePng(doc, { scene: 'lifecycle', theme: 'dark' })
    expect(r.png.subarray(1, 4).toString()).toBe('PNG')
    expect(r.png.length).toBeGreaterThan(10_000)
  })

  it('names the scenes it can draw when a scene is unknown', async () => {
    await expect(renderScene(doc, { scene: 'nope' })).rejects.toThrow(/Scenes: overview, lifecycle, checkout/)
  })
})

describe('emphasis in a still picture', () => {
  it('numbers the trace, draws effects and badges, and lists the steps', async () => {
    const { parseDocument } = await import('@poney/core')
    const { readFileSync } = await import('node:fs')
    const doc = parseDocument(JSON.parse(readFileSync(new URL('../../agent/examples/tour.poney', import.meta.url), 'utf8')))
    const { svg } = await renderScene(doc, { scene: 's-save' })
    expect(svg).toContain('One UPDATE checks the version and writes.')
    expect(svg).toContain('p95 12 ms')
    expect((svg.match(/rx="5"/g) ?? []).length).toBeGreaterThanOrEqual(6)
    expect(svg).not.toContain('animateMotion')
  })
})
