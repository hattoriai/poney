import type { FC } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { View } from '@poney/core'
import type { SceneBase } from '@poney/layout'

export type { Rect, Point, SceneBase } from '@poney/layout'

/**
 * A renderer draws one kind of view from a positioned scene. It never
 * computes layout and never changes the model; it reads the scene and the
 * studio's selection, and reports clicks and hovers.
 */
export interface DiagramModule<V extends View = View, S extends SceneBase = SceneBase> {
  /** "architecture", "sequence"… or "<extension>/<view>" for extension views. */
  key: string
  label: string
  icon: LucideIcon
  /** How to read this kind of diagram, in one or two sentences. */
  howToRead: string
  Renderer: FC<{ scene: S; view: V }>
  /** Diagram-specific controls for the floating toolbar. */
  Tools?: FC<{ view: V }>
  /** How the canvas first frames this diagram. Defaults to fitting it all. */
  initialView?: 'fit' | 'start'
  /** Key to the symbols, shown in the inspector when nothing is selected. */
  Legend?: FC<{ view: V }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDiagramModule = DiagramModule<any, any>

export const viewKey = (view: View) => (view.type === 'extension' ? view.extension : view.type)
