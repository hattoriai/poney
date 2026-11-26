/**
 * The drawing runtime: renderers are plain functions that return elements
 * (written as JSX), and `resolve` turns them into a tree of SVG and HTML
 * elements. No framework: a host turns the tree into markup (`toMarkup`),
 * into the DOM (`mount`), or into its own framework's elements.
 *
 * A renderer reads what its host gives it through contexts, and keeps a
 * small amount of state (an open group, a hovered line) in a store that the
 * host owns, by name (`useLocal`). There are no effects and no refs: the
 * same input always draws the same tree.
 */

export type Props = Record<string, unknown>

/** A component: props in, elements out. */
export type Component<P = Props> = (props: P) => Child

export const Fragment = Symbol.for('poney.fragment')

export interface Element {
  readonly $$poney: true
  readonly type: string | Component<never> | typeof Fragment
  readonly props: Props
  readonly key: string | number | null
}

export type Child = Element | string | number | bigint | boolean | null | undefined | readonly Child[]

/** An SVG or HTML element after resolution: only tags, attributes and children. */
export interface HostNode {
  tag: string
  /** Attributes and event handlers, with the names a JSX author wrote (strokeWidth, onClick). */
  props: Props
  /** Unique among its siblings: the author's key, or the position in the JSX. */
  key: string
  children: Resolved[]
}
export type Resolved = HostNode | string

export function createElement(type: Element['type'], props: Props, key: string | number | null = null): Element {
  return { $$poney: true, type, props, key }
}

export const isElement = (x: unknown): x is Element => typeof x === 'object' && x !== null && (x as Element).$$poney === true

/* ─── Contexts ─────────────────────────────────────────────────────────────── */

export interface Context<T> {
  readonly id: symbol
  readonly fallback: T
  readonly Provider: Component<{ value: T; children?: Child }>
}

interface Scope {
  readonly parent: Scope | null
  readonly id: symbol
  readonly value: unknown
}

const providers = new WeakMap<Component<never>, symbol>()

export function createContext<T>(fallback: T): Context<T> {
  const id = Symbol('poney.context')
  // Never called: resolve sees the Provider and puts its value in scope.
  const Provider: Component<{ value: T; children?: Child }> = (p) => p.children
  providers.set(Provider as Component<never>, id)
  return { id, fallback, Provider }
}

let current: Scope | null = null
let resolving = false

export function useContext<T>(ctx: Context<T>): T {
  if (!resolving) throw new Error('useContext is only for components while they draw')
  for (let s = current; s; s = s.parent) if (s.id === ctx.id) return s.value as T
  return ctx.fallback
}

/** A renderer draws again for each change: a memo is the value itself. */
export const useMemo = <T>(make: () => T, _deps?: readonly unknown[]): T => make()
export const useCallback = <T>(fn: T, _deps?: readonly unknown[]): T => fn

/* ─── Local state, kept by the host ────────────────────────────────────────── */

/**
 * Where renderers keep their small state, by name. The host owns it and
 * draws again after a change. A still picture has none: `set` is ignored.
 */
export interface LocalStore {
  get(key: string): unknown
  has(key: string): boolean
  /** Changes a value from the one the host has now (not the one last drawn). */
  update(key: string, change: (prev: unknown) => unknown): void
}

const still: LocalStore = { get: () => undefined, has: () => false, update: () => {} }
export const LocalContext = createContext<LocalStore>(still)

/** A store in a Map, for a host that draws again with `redraw` after each change. */
export function localStore(redraw: () => void, values = new Map<string, unknown>()): LocalStore {
  return {
    get: (key) => values.get(key),
    has: (key) => values.has(key),
    update(key, change) {
      values.set(key, change(values.get(key)))
      redraw()
    },
  }
}

/**
 * A value that the host keeps between drawings, by a name unique in the
 * drawing (for example `map:${view.id}:hot`).
 */
export function useLocal<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const store = useContext(LocalContext)
  const value = store.has(key) ? (store.get(key) as T) : initial
  const set = (next: T | ((prev: T) => T)) =>
    store.update(key, (prev) => {
      const base = prev === undefined ? initial : (prev as T)
      return typeof next === 'function' ? (next as (p: T) => T)(base) : next
    })
  return [value, set]
}

/* ─── Resolution ───────────────────────────────────────────────────────────── */

/** Draws elements into a tree of SVG and HTML elements. */
export function resolve(child: Child): Resolved[] {
  const was = { current, resolving }
  resolving = true
  try {
    const out: Resolved[] = []
    walkList(child, null, '', out)
    return out
  } finally {
    current = was.current
    resolving = was.resolving
  }
}

/**
 * Every element gets a key from where it stands in the JSX, as in React: its
 * own key inside its list, or its position. A nested list adds its position
 * as a prefix, so two lists never share a key and a list that grows does not
 * move the keys of the elements after it.
 */
function walkList(children: Child, scope: Scope | null, prefix: string, out: Resolved[]): void {
  if (!Array.isArray(children)) return walkOne(children as Child, scope, prefix, '0', out)
  const list = children as readonly Child[]
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (Array.isArray(item)) walkList(item, scope, `${prefix}${i}.`, out)
    else walkOne(item, scope, prefix, String(i), out)
  }
}

function walkOne(child: Child, scope: Scope | null, prefix: string, slot: string, out: Resolved[]): void {
  if (child === null || child === undefined || typeof child === 'boolean') return
  if (typeof child === 'string') return void out.push(child)
  if (typeof child === 'number' || typeof child === 'bigint') return void out.push(String(child))
  const el = child as Element
  const key = el.key === null ? `${prefix}${slot}` : `${prefix}=${el.key}`
  const { type } = el
  if (type === Fragment) return walkList(el.props.children as Child, scope, `${key}/`, out)
  if (typeof type === 'function') {
    const id = providers.get(type)
    if (id) return walkList(el.props.children as Child, { parent: scope, id, value: el.props.value }, `${key}/`, out)
    current = scope
    const rendered = (type as Component<Props>)(el.props)
    return walkList(rendered, scope, `${key}/`, out)
  }
  const { children, ...props } = el.props
  const node: HostNode = { tag: type, props, key, children: [] }
  walkList(children as Child, scope, '', node.children)
  out.push(node)
}
