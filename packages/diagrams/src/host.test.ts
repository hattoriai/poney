// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { indexOf, parseDocument } from '@hattoriai/poney-core'
import { commerce } from '@hattoriai/poney-examples'
import { layoutView } from '@hattoriai/poney-layout'
import { diagramFor, drawInto } from '.'

describe('drawInto: a page with no framework as the host', () => {
  it('draws a map, opens a group on click and lights a line on hover, keeping the elements', async () => {
    const doc = parseDocument(commerce)
    const view = doc.views.find((v) => v.id === 'system-map')!
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const label = (l: string) => svg.querySelector(`[aria-label="${l}"]`)
    const { Renderer } = diagramFor(view)!
    // The host lays out again when the reader opens a group, as the Studio does.
    let scene = await layoutView(doc, view, {})
    const viewState: { collapsed?: string[] } = {}
    const render = {
      idx: indexOf(doc),
      viewState: () => viewState,
      setViewState: async (_: string, patch: { collapsed?: string[] }) => {
        Object.assign(viewState, patch)
        scene = await layoutView(doc, view, viewState)
        drawing = drawInto(svg, Renderer, { scene, view }, { render })
      },
    }
    let drawing = drawInto(svg, Renderer, { scene, view }, { render })

    const customer = label('Customer. Browses the catalog, buys products and tracks orders.')
    expect(customer?.namespaceURI).toBe('http://www.w3.org/2000/svg')
    const line = label('Asks for payment')!
    line.dispatchEvent(new MouseEvent('mouseenter'))
    expect(line.querySelectorAll('path')[1].getAttribute('stroke')).toBe('var(--poney-accent)')
    line.dispatchEvent(new MouseEvent('mouseleave'))
    expect(line.querySelectorAll('path')[1].getAttribute('stroke')).not.toBe('var(--poney-accent)')

    label('Open Order service')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))
    await layoutView(doc, view, viewState)
    await new Promise((r) => setTimeout(r, 50))
    expect(label('Close Order service')).not.toBeNull()
    expect(label('Customer. Browses the catalog, buys products and tracks orders.')).toBe(customer)
    drawing.update()
  })
})
