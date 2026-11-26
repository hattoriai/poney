/** @jsxRuntime automatic @jsxImportSource react */
import { describe, expect, it } from 'vitest'
import { parseDocument } from '@poney/core'
import { commerce } from '@poney/examples'
import { ownership } from '@poney/ext-ownership'
import { teamMap } from '@poney/ext-ownership/diagram'
import { layoutTeamMap } from '@poney/ext-ownership/layout'
import { registerExtensionLayout } from '@poney/layout'
import { renderScene, renderScenePng } from './static'
import { registerDiagram } from './diagrams'

const doc = parseDocument(commerce, { extensions: [ownership] })

describe('headless rendering', () => {
  // Every view of every type, like a Mermaid CLI: the extension's own view too, once registered.
  registerDiagram(teamMap)
  registerExtensionLayout('ownership/team-map', layoutTeamMap)
  for (const view of doc.views.map((v) => v.id)) {
    it(`renders the view ${view}, with no CSS a picture cannot read`, async () => {
      const r = await renderScene(doc, { view })
      expect(r.svg).toMatch(/^<svg xmlns/)
      expect(r.svg).not.toMatch(/var\(--|color-mix|class="poney-focus"/)
      expect(r.svg).not.toMatch(/aria-label="(Open|Close) /)
    })
  }

  for (const scene of ['overview', 'lifecycle', 'checkout', 'retry', 'window']) {
    it(`renders ${scene} to a self-contained SVG`, async () => {
      const r = await renderScene(doc, { scene })
      expect(r.svg).toMatch(/^<svg xmlns/)
      expect(r.svg).not.toContain('var(--')
      expect(r.svg).not.toContain('class="poney-focus"')
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
