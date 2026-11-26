/** @jsxRuntime automatic @jsxImportSource react */
import { createContext, useContext, type ReactNode } from 'react'
import { refKey, type ModelIndex, type Ref } from '@poney/core'

/**
 * What a story renderer needs from its host: the model, and optionally a way
 * to make elements interactive. The studio passes its selection and hover
 * binding; a headless render passes none, and elements are plain SVG.
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

interface RenderValue {
  idx: ModelIndex
  bind?: BindFn
}

const RenderContext = createContext<RenderValue | null>(null)

export const RenderProvider = ({ value, children }: { value: RenderValue; children: ReactNode }) => <RenderContext.Provider value={value}>{children}</RenderContext.Provider>

export function useRenderIndex(): ModelIndex {
  const v = useContext(RenderContext)
  if (!v) throw new Error('Story renderers need a RenderProvider')
  return v.idx
}

const plain: BindFn = (ref, label) => ({ 'data-ref': refKey(ref), 'aria-label': label })

export function useRenderBind(): BindFn {
  return useContext(RenderContext)?.bind ?? plain
}
