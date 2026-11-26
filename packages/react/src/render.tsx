/** @jsxRuntime automatic @jsxImportSource react */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { refKey, type ModelIndex, type Ref } from '@hattoriai/poney-core'

/**
 * What a renderer needs from its host (an app, a page, a headless render).
 * Only the model is required:
 *
 * - `bind` makes an element interactive (click, hover, keyboard). Without it,
 *   elements are plain SVG with their ref in `data-ref`.
 * - `selection` and `hover` say what the reader is looking at; diagrams
 *   light it and its neighbours up.
 * - `viewState` and `setViewState` keep what the reader changed in a view
 *   (groups opened or closed, tables expanded). Without them, each view
 *   keeps its own state while it is shown.
 *
 * The zoom level comes separately (ZoomProvider), from the host's canvas.
 */
export interface BindProps {
  'data-ref'?: string
  className?: string
  tabIndex?: number
  role?: string
  'aria-label'?: string
  'aria-pressed'?: boolean
  onClick?: (e: React.MouseEvent) => void
  onDoubleClick?: (e: React.MouseEvent) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onFocus?: () => void
  onKeyDown?: (e: React.KeyboardEvent) => void
}
export type BindFn = (ref: Ref, label: string) => BindProps

/** What a reader changed in one view. Every field is optional; a view starts as the document says. */
export interface ViewState {
  /** Containers and groups opened or closed, overriding the view. */
  collapsed?: string[]
  /** ERD: tables that show every field. */
  expandedTables?: string[]
  /** Data flow: show relationships without data. */
  controlFlow?: boolean
  /** Dependency: highlight transitive dependencies, not only direct ones. */
  transitive?: boolean
}

export interface RenderValue {
  idx: ModelIndex
  bind?: BindFn
  selection?: Ref | null
  hover?: Ref | null
  viewState?: (viewId: string) => ViewState | undefined
  setViewState?: (viewId: string, patch: Partial<ViewState>) => void
  /** A still picture (an image, a print): controls such as open/close buttons are not drawn. */
  still?: boolean
}

const RenderContext = createContext<RenderValue | null>(null)

export const RenderProvider = ({ value, children }: { value: RenderValue; children: ReactNode }) => <RenderContext.Provider value={value}>{children}</RenderContext.Provider>

export function useRenderIndex(): ModelIndex {
  const v = useContext(RenderContext)
  if (!v) throw new Error('Poney renderers need a RenderProvider (from @hattoriai/poney-react) with the model index')
  return v.idx
}

const plain: BindFn = (ref, label) => ({ 'data-ref': refKey(ref), 'aria-label': label })

export function useRenderBind(): BindFn {
  return useContext(RenderContext)?.bind ?? plain
}

/** What the diagram should light up: what is hovered, else what is selected. */
export function useRenderSubject(): { subject: Ref | null; selection: Ref | null; hover: Ref | null } {
  const v = useContext(RenderContext)
  const selection = v?.selection ?? null
  const hover = v?.hover ?? null
  return { subject: hover ?? selection, selection, hover }
}

/**
 * A view's state and a way to change it: the host's, when it keeps one;
 * otherwise kept here while the view is shown.
 */
export function useViewState(viewId: string): [ViewState, (patch: Partial<ViewState>) => void] {
  const v = useContext(RenderContext)
  const [own, setOwn] = useState<ViewState>({})
  const hosted = !!v?.setViewState
  const state = (hosted ? v!.viewState?.(viewId) : own) ?? {}
  const set = useCallback(
    (patch: Partial<ViewState>) => (hosted ? v!.setViewState!(viewId, patch) : setOwn((s) => ({ ...s, ...patch }))),
    [hosted, v, viewId],
  )
  return [state, set]
}

const ZoomContext = createContext(1)
/** The host's zoom level, for level-of-detail drawing (small text hides when far away). */
export const ZoomProvider = ({ value, children }: { value: number; children: ReactNode }) => <ZoomContext.Provider value={value}>{children}</ZoomContext.Provider>
export const useRenderZoom = () => useContext(ZoomContext)

/** Is this a still picture? Renderers leave out their controls. */
export const useRenderStill = () => !!useContext(RenderContext)?.still
