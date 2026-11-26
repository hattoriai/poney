/**
 * The tree as SVG or HTML text, as React's server renderer writes it:
 * attribute names (strokeWidth → stroke-width), escaping and styles are the
 * same, so a picture is the same whichever host draws it.
 */
import type { Props, Resolved } from './core'

/** Attributes that keep their camelCase name in SVG. */
const CAMEL = new Set([
  'viewBox', 'preserveAspectRatio', 'gradientUnits', 'gradientTransform', 'markerWidth', 'markerHeight', 'markerUnits', 'refX', 'refY',
  'patternUnits', 'patternContentUnits', 'patternTransform', 'clipPathUnits', 'maskUnits', 'maskContentUnits', 'filterUnits', 'primitiveUnits',
  'stdDeviation', 'pathLength', 'textLength', 'lengthAdjust', 'startOffset', 'spreadMethod', 'attributeName', 'attributeType', 'repeatCount',
  'repeatDur', 'keyTimes', 'keySplines', 'keyPoints', 'calcMode', 'baseFrequency', 'numOctaves', 'tableValues', 'kernelMatrix',
])
const RENAMED: Record<string, string> = { className: 'class', htmlFor: 'for', tabIndex: 'tabindex', xlinkHref: 'xlink:href', xmlSpace: 'xml:space' }
const names = new Map<string, string>()

/** The attribute name for a prop, or null when the prop is not an attribute (a handler, a key). */
export function attributeName(prop: string): string | null {
  if (prop === 'key' || prop === 'children' || prop === 'ref' || /^on[A-Z]/.test(prop)) return null
  let name = names.get(prop)
  if (name === undefined) {
    name = RENAMED[prop] ?? (CAMEL.has(prop) || prop.startsWith('aria-') || prop.startsWith('data-') ? prop : prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))
    names.set(prop, name)
  }
  return name
}

/** The attribute value for a prop value, or null when the attribute is left out. */
export function attributeValue(prop: string, value: unknown): string | null {
  if (value === null || value === undefined || typeof value === 'function' || typeof value === 'symbol') return null
  if (prop === 'style' && typeof value === 'object') return styleText(value as Record<string, unknown>)
  if (typeof value === 'boolean') return prop.startsWith('aria-') || prop.startsWith('data-') ? String(value) : value ? '' : null
  return String(value)
}

/** CSS properties whose numbers have no unit. */
const UNITLESS = new Set([
  'animationIterationCount', 'aspectRatio', 'borderImageOutset', 'borderImageSlice', 'borderImageWidth', 'columnCount', 'columns', 'flex', 'flexGrow',
  'flexPositive', 'flexShrink', 'flexNegative', 'flexOrder', 'gridArea', 'gridRow', 'gridRowEnd', 'gridRowSpan', 'gridRowStart', 'gridColumn',
  'gridColumnEnd', 'gridColumnSpan', 'gridColumnStart', 'fontWeight', 'lineClamp', 'lineHeight', 'opacity', 'order', 'orphans', 'scale', 'tabSize',
  'widows', 'zIndex', 'zoom', 'fillOpacity', 'floodOpacity', 'stopOpacity', 'strokeDasharray', 'strokeDashoffset', 'strokeMiterlimit', 'strokeOpacity', 'strokeWidth',
])

export function styleText(style: Record<string, unknown>): string | null {
  const parts: string[] = []
  for (const [prop, raw] of Object.entries(style)) {
    if (raw === null || raw === undefined || typeof raw === 'boolean' || raw === '') continue
    const custom = prop.startsWith('--')
    const name = custom ? prop : prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^ms-/, '-ms-')
    const value = typeof raw === 'number' && raw !== 0 && !custom && !UNITLESS.has(prop) ? `${raw}px` : String(raw).trim()
    parts.push(`${name}:${value}`)
  }
  return parts.length ? parts.join(';') : null
}

const escapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }
export const escape = (s: string) => s.replace(/[&<>"']/g, (c) => escapes[c])

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

export function attributes(props: Props): string {
  let out = ''
  for (const prop in props) {
    const name = attributeName(prop)
    if (name === null) continue
    const value = attributeValue(prop, props[prop])
    if (value !== null) out += ` ${name}="${escape(value)}"`
  }
  return out
}

/** The tree as text. Handlers are left out: the text is a still picture. */
export function toMarkup(nodes: Resolved[]): string {
  let out = ''
  for (const n of nodes) {
    if (typeof n === 'string') {
      out += escape(n)
      continue
    }
    out += `<${n.tag}${attributes(n.props)}`
    if (VOID.has(n.tag)) out += '/>'
    else out += `>${toMarkup(n.children)}</${n.tag}>`
  }
  return out
}
