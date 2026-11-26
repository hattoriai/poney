/** @jsxRuntime automatic */
/** @jsxImportSource @hattoriai/poney-diagrams */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createContext, LocalContext, localStore, mount, resolve, toMarkup, useContext, useLocal, type HostNode } from '.'

const Theme = createContext('light')
const Local = LocalContext.Provider
const Label = () => <text>{useContext(Theme)}</text>

describe('resolve', () => {
  it('draws components, fragments and providers into SVG elements', () => {
    const tree = resolve(
      <g>
        <Theme.Provider value="dark">
          <>
            <Label />
          </>
        </Theme.Provider>
        <Label />
      </g>,
    )
    expect(toMarkup(tree)).toBe('<g><text>dark</text><text>light</text></g>')
  })

  it('keys elements by their list, so two lists never share a key', () => {
    const [g] = resolve(
      <g>
        {['a', 'b'].map((k) => <rect key={k} />)}
        {['a'].map((k) => <circle key={k} />)}
        <line />
      </g>,
    ) as HostNode[]
    expect(g.children.map((c) => (c as HostNode).key)).toEqual(['0.=a', '0.=b', '1.=a', '2'])
  })

  it('writes attributes as SVG and HTML name them', () => {
    const markup = toMarkup(resolve(<text className="x" strokeWidth={2} textAnchor="end" viewBox="0 0 1 1" aria-hidden tabIndex={0} style={{ marginLeft: 8, opacity: 0.5 }} onClick={() => {}}>{`a < b & 'c'`}</text>))
    expect(markup).toBe(`<text class="x" stroke-width="2" text-anchor="end" viewBox="0 0 1 1" aria-hidden="true" tabindex="0" style="margin-left:8px;opacity:0.5">a &lt; b &amp; &#x27;c&#x27;</text>`)
  })
})

describe('mount', () => {
  const Toggle = () => {
    const [open, setOpen] = useLocal('open', false)
    return (
      <g>
        <rect data-open={String(open)} onClick={() => setOpen((o) => !o)} />
        {open && <text>open</text>}
      </g>
    )
  }

  it('draws into the DOM with SVG elements, handlers and local state, and keeps elements on a new drawing', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const draw = () => mount(svg, resolve(<LocalProvider />))
    const store = localStore(() => draw())
    const LocalProvider = () => <Local value={store}><Toggle /></Local>
    draw()
    const rect = svg.querySelector('rect')!
    expect(rect.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(rect.getAttribute('data-open')).toBe('false')
    rect.dispatchEvent(new Event('click'))
    expect(svg.querySelector('rect')).toBe(rect)
    expect(rect.getAttribute('data-open')).toBe('true')
    expect(svg.querySelector('text')?.textContent).toBe('open')
    rect.dispatchEvent(new Event('click'))
    expect(svg.querySelector('text')).toBeNull()
  })
})
