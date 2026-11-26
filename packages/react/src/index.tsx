/** @jsxRuntime automatic @jsxImportSource react */
/**
 * @hattoriai/poney-react — Poney's drawings in React.
 *
 * The drawings come from @hattoriai/poney-diagrams, which has no framework.
 * This package gives them to React: the providers are React contexts, and
 * each renderer is a React component that draws the same SVG tree and lets
 * React put it in the page. Local state (an open group, a hovered line)
 * lives in React state.
 */
import { createContext, createElement, useContext, useState, type FC, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { createLucideIcon, type LucideIcon } from 'lucide-react'
import type { Ref, View } from '@hattoriai/poney-core'
import * as D from '@hattoriai/poney-diagrams'
import { jsx } from '@hattoriai/poney-diagrams/jsx-runtime'

export {
  expandFocus,
  findScene,
  findTarget,
  followFrame,
  fit,
  FONTS,
  lookClass,
  lookOf,
  panViewBox,
  registerDiagram,
  sceneFrame,
  sceneLayoutOptions,
  sceneLines,
  STATE_LABEL,
  stateFill,
  stateStroke,
  stepLetter,
  storyState,
  STORY_TYPES,
  THEMES,
  toneColor,
  toneWash,
  viewKey,
  zoomViewBox,
  type AnyDiagramModule,
  type DiagramModule,
  type DrawingTarget,
  type FoundTarget,
  type IconData,
  type LineShape,
  type Look,
  type Mode,
  type StoryState,
  type ThemeName,
  type ViewBox,
  type ViewState,
} from '@hattoriai/poney-diagrams'

/* ─── Providers ───────────────────────────────────────────────────────────── */

/** What `bind` gives an element, with React's events. */
export interface BindProps extends Omit<D.BindProps, 'onClick' | 'onDoubleClick' | 'onKeyDown'> {
  onClick?: (e: MouseEvent) => void
  onDoubleClick?: (e: MouseEvent) => void
  onKeyDown?: (e: KeyboardEvent) => void
}
export type BindFn = (ref: Ref, label: string) => BindProps
/** What the drawings need from a React app (see @hattoriai/poney-diagrams RenderValue). */
export interface RenderValue extends Omit<D.RenderValue, 'bind'> {
  bind?: BindFn
}

const RenderContext = createContext<RenderValue | null>(null)
const StoryContext = createContext<D.StoryState | null>(null)
const ZoomContext = createContext(1)

/** What the drawings need from the app: the model index, and optionally interaction, selection and view state. */
export const RenderProvider = ({ value, children }: { value: RenderValue; children?: ReactNode }) => <RenderContext.Provider value={value}>{children}</RenderContext.Provider>
/** How a story drawing shows a change: marks, mode, focus, callouts. */
export const StoryProvider = ({ value, children }: { value: D.StoryState; children?: ReactNode }) => <StoryContext.Provider value={value}>{children}</StoryContext.Provider>
/** The host's zoom level, for level-of-detail drawing. */
export const ZoomProvider = ({ value, children }: { value: number; children?: ReactNode }) => <ZoomContext.Provider value={value}>{children}</ZoomContext.Provider>
export const useRenderZoom = () => useContext(ZoomContext)

/* ─── Drawing ─────────────────────────────────────────────────────────────── */

/** The drawn tree as React elements. */
export function toReact(nodes: D.Resolved[]): ReactNode[] {
  return nodes.map((n) => (typeof n === 'string' ? n : createElement(n.tag, { ...n.props, key: n.key }, ...toReact(n.children))))
}

/** Draws a Poney element with this component's providers and local state. */
function useDrawing(element: D.Element): ReactNode {
  const render = useContext(RenderContext)
  const story = useContext(StoryContext)
  const zoom = useContext(ZoomContext)
  const [local, setLocal] = useState<ReadonlyMap<string, unknown>>(() => new Map())
  const store: D.LocalStore = {
    get: (key) => local.get(key),
    has: (key) => local.has(key),
    update: (key, change) => setLocal((m) => new Map(m).set(key, change(m.get(key)))),
  }
  let tree: D.Element = jsx(D.LocalContext.Provider, { value: store, children: element })
  tree = jsx(D.ZoomProvider, { value: zoom, children: tree })
  if (story) tree = jsx(D.StoryProvider, { value: story, children: tree })
  // React's events have every field a renderer reads (PoneyMouseEvent, PoneyKeyboardEvent).
  if (render) tree = jsx(D.RenderProvider, { value: render as D.RenderValue, children: tree })
  return <>{toReact(D.resolve(tree))}</>
}

/** A Poney component as a React component. */
export function reactComponent<P extends object>(component: D.Component<P>, name = component.name): FC<P> {
  const Drawn: FC<P> = (props) => useDrawing(jsx(component as D.Component<never>, props as D.Props))
  Drawn.displayName = name
  return Drawn
}

export const SceneStory = reactComponent(D.SceneStory, 'SceneStory')
export const MapStory = reactComponent(D.MapStory, 'MapStory')
export const SequenceStory = reactComponent(D.SequenceStory, 'SequenceStory')
export const StateStory = reactComponent(D.StateStory, 'StateStory')
export const EmphasisOver = reactComponent(D.EmphasisOver, 'EmphasisOver')
export const EmphasisUnder = reactComponent(D.EmphasisUnder, 'EmphasisUnder')

/* ─── Icons ───────────────────────────────────────────────────────────────── */

const icons = new WeakMap<D.IconData, LucideIcon>()

/** A Poney icon as a Lucide React component. */
export function reactIcon(icon: D.IconData): LucideIcon {
  let c = icons.get(icon)
  // Lucide's React icons draw each shape in a list, so each needs a key.
  if (!c) icons.set(icon, (c = createLucideIcon(icon.name, icon.node.map(([tag, attrs], i) => [tag, { ...attrs, key: String(i) }]))))
  return c
}

/** The icon a presentation names, as a React component. */
export const iconFor = (name: string): LucideIcon => reactIcon(D.iconFor(name))

/* ─── Diagram modules ─────────────────────────────────────────────────────── */

/** A diagram type for React: its icon, renderer and key are React components. */
export interface ReactDiagramModule<V extends View = View> extends Omit<D.DiagramModule<V>, 'icon' | 'Renderer' | 'Legend'> {
  icon: LucideIcon
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Renderer: FC<{ scene: any; view: V }>
  Legend?: FC<{ view: V }>
}

const modules = new WeakMap<D.AnyDiagramModule, ReactDiagramModule>()

function reactModule(m: D.AnyDiagramModule): ReactDiagramModule {
  let r = modules.get(m)
  if (!r) {
    r = {
      ...m,
      icon: reactIcon(m.icon),
      Renderer: reactComponent(m.Renderer, `${m.key} diagram`),
      Legend: m.Legend && reactComponent(m.Legend, `${m.key} legend`),
    }
    modules.set(m, r)
  }
  return r
}

/** The renderer for a view, if one is registered, as React components. */
export function diagramFor(view: View): ReactDiagramModule | undefined {
  const m = D.diagramFor(view)
  return m && reactModule(m)
}

export function diagramByKey(key: string): ReactDiagramModule | undefined {
  const m = D.diagramByKey(key)
  return m && reactModule(m)
}
