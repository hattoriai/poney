/**
 * A page with no framework as the host: `drawInto` draws a renderer into an
 * element of the page, with the host's values, and draws again after each
 * local change (an open group, a hovered line).
 */
import { StoryProvider, type StoryState } from './context'
import { RenderProvider, ZoomProvider, type RenderValue } from './render'
import { createElement, LocalContext, localStore, mount, resolve, type Child, type Component, type Props } from './runtime'

export interface Host {
  /** The model index, and optionally interaction, selection and view state. */
  render: RenderValue
  /** How a story drawing shows a change. */
  story?: StoryState
  /** The zoom level, for level-of-detail drawing. Default: 1. */
  zoom?: number
}

export interface Drawing<P> {
  /** Draws again, with new host values and new props when given. */
  update(next?: Partial<Host>, props?: P): void
}

/**
 * Draws `component` with `props` into `container` (an `<svg>` or a `<g>` for
 * diagrams, any element for a legend). Elements keep their identity between
 * drawings, so focus, hover and CSS transitions survive.
 */
export function drawInto<P extends object>(container: Element, component: Component<P>, props: P, host: Host): Drawing<P> {
  let current = host
  let currentProps = props
  const draw = () => {
    let tree: Child = createElement(component as Component<never>, currentProps as Props)
    tree = createElement(LocalContext.Provider, { value: store, children: tree })
    tree = createElement(ZoomProvider, { value: current.zoom ?? 1, children: tree })
    if (current.story) tree = createElement(StoryProvider, { value: current.story, children: tree })
    tree = createElement(RenderProvider, { value: current.render, children: tree })
    mount(container, resolve(tree))
  }
  const store = localStore(draw)
  draw()
  return {
    update(next, nextProps) {
      if (next) current = { ...current, ...next }
      if (nextProps) currentProps = nextProps
      draw()
    },
  }
}
