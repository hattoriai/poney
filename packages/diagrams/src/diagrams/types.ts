import type { Component } from '../runtime'
import type { IconData } from '../icons'
import type { View } from '@hattoriai/poney-core'
import type { SceneBase } from '@hattoriai/poney-layout'

export type { Rect, Point, SceneBase } from '@hattoriai/poney-layout'

/**
 * A renderer draws one kind of view from a positioned scene. It never
 * computes layout and never changes the model; it reads the scene, and from
 * its host (RenderProvider) the selection, the hover and the view's state.
 */
export interface DiagramModule<V extends View = View, S extends SceneBase = SceneBase> {
  /** "architecture", "sequence"… or "<extension>/<view>" for extension views. */
  key: string
  label: string
  icon: IconData
  /** How to read this kind of diagram, in one or two sentences. */
  howToRead: string
  Renderer: Component<{ scene: S; view: V }>
  /** How a host should first frame this diagram: all of it, or its start (e.g. the top of a long sequence). */
  initialView?: 'fit' | 'start'
  /** Key to the symbols, for a host to show next to the diagram. */
  Legend?: Component<{ view: V }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDiagramModule = DiagramModule<any, any>

export const viewKey = (view: View) => (view.type === 'extension' ? view.extension : view.type)
