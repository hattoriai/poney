/**
 * The tree in the DOM, with no framework. `mount` draws into a container
 * and, on each later call, changes only what changed: elements keep their
 * identity (focus, hover and CSS transitions survive a new drawing).
 */
import type { HostNode, Props, Resolved } from './core'
import { attributeName, attributeValue } from './markup'

const SVG = 'http://www.w3.org/2000/svg'
const XLINK = 'http://www.w3.org/1999/xlink'

/** Event names for handler props (onClick → click). */
const EVENTS: Record<string, string> = { onDoubleClick: 'dblclick' }
const eventName = (prop: string) => EVENTS[prop] ?? prop.slice(2).toLowerCase()

type Handler = (e: Event) => void
interface Drawn {
  node: Resolved
  handlers?: Record<string, Handler>
}
const drawn = new WeakMap<Node, Drawn>()

/** Draws the tree into `container`, replacing what an earlier call drew there. */
export function mount(container: Element, nodes: Resolved[]): void {
  patchChildren(container, nodes, container.namespaceURI === SVG && container.localName !== 'foreignObject' ? SVG : null)
}

function create(n: Resolved, ns: string | null): Node {
  if (typeof n === 'string') {
    const t = document.createTextNode(n)
    drawn.set(t, { node: n })
    return t
  }
  const own = n.tag === 'svg' ? SVG : ns
  const el = own ? document.createElementNS(own, n.tag) : document.createElement(n.tag)
  const d: Drawn = { node: n }
  drawn.set(el, d)
  setProps(el, d, {}, n.props)
  patchChildren(el, n.children, own === SVG && n.tag !== 'foreignObject' ? SVG : null)
  return el
}

function setProps(el: Element, d: Drawn, before: Props, after: Props) {
  for (const prop in before) if (!(prop in after)) setProp(el, d, prop, undefined)
  for (const prop in after) if (before[prop] !== after[prop] || !(prop in before)) setProp(el, d, prop, after[prop])
}

function setProp(el: Element, d: Drawn, prop: string, value: unknown) {
  if (/^on[A-Z]/.test(prop)) {
    const type = eventName(prop)
    d.handlers ??= {}
    if (!(type in d.handlers)) el.addEventListener(type, (e) => d.handlers?.[type]?.(e))
    d.handlers[type] = value as Handler
    return
  }
  const name = attributeName(prop)
  if (name === null) return
  const text = attributeValue(prop, value)
  if (name === 'xlink:href') {
    if (text === null) el.removeAttributeNS(XLINK, 'href')
    else el.setAttributeNS(XLINK, name, text)
  } else if (text === null) el.removeAttribute(name)
  else el.setAttribute(name, text)
}

function same(a: Resolved, b: Resolved): boolean {
  if (typeof a === 'string' || typeof b === 'string') return typeof a === 'string' && typeof b === 'string'
  return a.tag === b.tag && a.key === b.key
}

function patchChildren(parent: Element, next: Resolved[], ns: string | null) {
  const old = Array.from(parent.childNodes)
  const byKey = new Map<string, Node>()
  const texts: Node[] = []
  for (const node of old) {
    const d = drawn.get(node)
    if (!d) continue
    if (typeof d.node === 'string') texts.push(node)
    else byKey.set(d.node.key, node)
  }
  const keep = new Set<Node>()
  let at: Node | null = parent.firstChild
  for (const n of next) {
    let node = typeof n === 'string' ? texts.shift() : byKey.get(n.key)
    const d = node ? drawn.get(node) : undefined
    if (node && d && same(d.node, n)) update(node, d, n, ns)
    else node = create(n, ns)
    keep.add(node)
    if (node !== at) parent.insertBefore(node, at)
    else at = at.nextSibling
  }
  for (const node of old) if (!keep.has(node)) parent.removeChild(node)
}

function update(node: Node, d: Drawn, n: Resolved, ns: string | null) {
  if (typeof n === 'string') {
    if (d.node !== n) node.nodeValue = n
    d.node = n
    return
  }
  const el = node as Element
  const before = (d.node as HostNode).props
  d.node = n
  setProps(el, d, before, n.props)
  const own = n.tag === 'svg' ? SVG : ns
  patchChildren(el, n.children, own === SVG && n.tag !== 'foreignObject' ? SVG : null)
}
