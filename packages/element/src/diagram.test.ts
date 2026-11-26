// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { commerce } from '@hattoriai/poney-examples'
import { definePoneyDiagram, type PoneyDiagramElement } from '.'

definePoneyDiagram()

const once = (el: Element, type: string) => new Promise<CustomEvent>((resolve) => el.addEventListener(type, (e) => resolve(e as CustomEvent), { once: true }))
const settle = () => new Promise((r) => setTimeout(r, 30))

function element(attrs: Record<string, string>) {
  const el = document.createElement('poney-diagram') as PoneyDiagramElement
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

describe('<poney-diagram>', () => {
  it('reads its document from a JSON script and draws a walkthrough scene', async () => {
    const el = element({ walkthrough: 'payment-retry', scene: 'checkout' })
    el.innerHTML = `<script type="application/json">${JSON.stringify(commerce)}</script>`
    const ready = once(el, 'poney-ready')
    document.body.append(el)
    const { detail } = await ready
    expect(detail.title).toBeTruthy()
    const svg = el.querySelector('svg.poney-diagram-svg')!
    expect(svg.getAttribute('viewBox')).toMatch(/^[-\d.]+ [-\d.]+ [\d.]+ [\d.]+$/)
    expect(svg.querySelectorAll('[data-ref]').length).toBeGreaterThan(3)
    expect(el.style.aspectRatio).toMatch(/\d+ \/ \d+/)
    el.remove()
  })

  it('tells the page what the reader clicks and points at', async () => {
    const el = element({ view: 'system-map' })
    const ready = once(el, 'poney-ready')
    document.body.append(el)
    el.document = commerce
    await ready
    const node = el.querySelector('[data-ref="entity:customer"]')!
    const hover = once(el, 'poney-hover')
    node.dispatchEvent(new MouseEvent('mouseenter'))
    expect((await hover).detail.ref).toBe('entity:customer')
    const select = once(el, 'poney-select')
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect((await select).detail.ref).toBe('entity:customer')
    expect(el.getAttribute('selection')).toBe('entity:customer')
    el.remove()
  })

  it('shows the system before a change: new parts are hidden', async () => {
    const el = element({ walkthrough: 'payment-retry', scene: 'overview', mode: 'change', still: '' })
    const ready = once(el, 'poney-ready')
    document.body.append(el)
    el.document = commerce
    await ready
    const hidden = () => el.querySelectorAll('.poney-story-hidden').length
    expect(hidden()).toBe(0)
    el.setAttribute('mode', 'before')
    await settle()
    expect(hidden()).toBeGreaterThan(0)
    expect(el.querySelector('[tabindex]')).toBeNull()
    el.remove()
  })

  it('opens a group in a map and keeps the other elements', async () => {
    const el = element({ view: 'system-map' })
    const ready = once(el, 'poney-ready')
    document.body.append(el)
    el.document = commerce
    await ready
    const customer = el.querySelector('[data-ref="entity:customer"]')
    el.querySelector('[aria-label="Open Order service"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    for (let i = 0; i < 40 && !el.querySelector('[aria-label="Close Order service"]'); i++) await settle()
    expect(el.querySelector('[aria-label="Close Order service"]')).not.toBeNull()
    expect(el.querySelector('[data-ref="entity:customer"]')).toBe(customer)
    el.remove()
  })

  it('says what is wrong with a document or a target', async () => {
    const el = element({ scene: 'no-such-scene' })
    document.body.append(el)
    const bad = once(el, 'poney-error')
    el.document = '{"poneyVersion": 1'
    expect((await bad).detail.message).toMatch(/not JSON/)
    const missing = once(el, 'poney-error')
    el.document = commerce
    expect((await missing).detail.message).toMatch(/No scene "no-such-scene"/)
    expect(el.querySelector('[role="alert"]')?.textContent).toMatch(/Scenes: overview/)
    el.remove()
  })
})
