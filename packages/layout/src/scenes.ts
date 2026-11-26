export * from './architecture'
export * from './sequence'
export * from './dataflow'
export * from './activity'
export * from './erd'
export * from './state'
export * from './usecase'
export * from './dependency'
export * from './map'

import type { Entity, Relationship, PoneyDocument, Transition, View } from '@hattoriai/poney-core'
import type { SceneBase } from './types'
import { layoutArchitecture } from './architecture'
import { layoutSequence } from './sequence'
import { layoutDataFlow } from './dataflow'
import { layoutActivity } from './activity'
import { layoutErd } from './erd'
import { layoutState } from './state'
import { layoutUseCase } from './usecase'
import { layoutDependency } from './dependency'
import { layoutMap } from './map'

/** Options a reader may change without changing the document. */
export interface ViewLayoutOptions {
  /** Architecture: containers and groups shown closed. Defaults to the view's own list. */
  collapsed?: string[]
  /** ERD: tables that show every field. */
  expanded?: string[]
  /** Data flow: also draw relationships that carry no data. */
  controlFlow?: boolean
  /** Elements that are not in the model but must be drawn, such as ones a change removed. */
  extraEntities?: Entity[]
  extraRelationships?: Relationship[]
  extraTransitions?: Transition[]
  /** Sequence: draw only these messages and their participants. */
  only?: string[]
  /** Sequence: narrow columns, for stories. */
  compact?: boolean
}

export type ExtensionLayout = (doc: PoneyDocument, view: Extract<View, { type: 'extension' }>, options: ViewLayoutOptions) => SceneBase | Promise<SceneBase>
const extensionLayouts = new Map<string, ExtensionLayout>()

/** Registers the layout for an extension view type, e.g. "ownership/team-map". */
export function registerExtensionLayout(viewType: string, layout: ExtensionLayout) {
  extensionLayouts.set(viewType, layout)
}

/** Lays out any view. The result is plain data that any renderer can draw. */
export async function layoutView(doc: PoneyDocument, view: View, options: ViewLayoutOptions = {}): Promise<SceneBase> {
  switch (view.type) {
    case 'architecture':
      return layoutArchitecture(doc, view, options)
    case 'map':
      return layoutMap(doc, view, options)
    case 'sequence':
      return layoutSequence(doc, view, options)
    case 'dataflow':
      return layoutDataFlow(doc, view, options)
    case 'activity':
      return layoutActivity(doc, view)
    case 'erd':
      return layoutErd(doc, view, options)
    case 'state':
      return layoutState(doc, view, options)
    case 'usecase':
      return layoutUseCase(doc, view)
    case 'dependency':
      return layoutDependency(doc, view)
    case 'extension': {
      const layout = extensionLayouts.get(view.extension)
      if (!layout) throw new Error(`No layout registered for "${view.extension}"`)
      return layout(doc, view, options)
    }
  }
}
