/**
 * The JSX runtime for Poney renderers: `@jsxImportSource @hattoriai/poney-diagrams`.
 * JSX makes plain elements; `resolve` draws them.
 */
import { createElement, Fragment, type Child, type Element, type Props } from './core'
import type { PoneyEvent, PoneyKeyboardEvent, PoneyMouseEvent } from './events'

export { Fragment }

export function jsx(type: Element['type'], props: Props, key?: string | number): Element {
  return createElement(type, props, key ?? null)
}
export const jsxs = jsx
export const jsxDEV = jsx

/** What a renderer may put on an element: attributes, handlers and children. */
export interface ElementProps {
  [name: string]: unknown
  children?: Child
  key?: string | number | null
  style?: Record<string, string | number | undefined>
  onClick?: (e: PoneyMouseEvent) => void
  onDoubleClick?: (e: PoneyMouseEvent) => void
  onMouseEnter?: (e: PoneyMouseEvent) => void
  onMouseLeave?: (e: PoneyMouseEvent) => void
  onPointerDown?: (e: PoneyMouseEvent) => void
  onFocus?: (e: PoneyEvent) => void
  onBlur?: (e: PoneyEvent) => void
  onKeyDown?: (e: PoneyKeyboardEvent) => void
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
  export type Element = import('./core').Element
  /** A component may return any child: an element, text, a list or nothing. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ElementType = string | ((props: any) => Child)
  export interface ElementChildrenAttribute {
    children: unknown
  }
  export interface IntrinsicAttributes {
    key?: string | number | null
  }
  export interface IntrinsicElements {
    [tag: string]: ElementProps
  }
}
