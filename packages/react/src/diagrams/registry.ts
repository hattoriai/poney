import type { View } from '@hattoriai/poney-core'
import { viewKey, type AnyDiagramModule } from './types'
import { architecture } from './architecture'
import { sequence } from './sequence'
import { dataflow } from './dataflow'
import { activity } from './activity'
import { erd } from './erd'
import { state } from './state'
import { usecase } from './usecase'
import { dependency } from './dependency'
import { map } from './map'

/** The core diagram types. Extensions add theirs with registerDiagram. */
export const BUILT_IN_DIAGRAMS: AnyDiagramModule[] = [architecture, map, sequence, dataflow, activity, erd, state, usecase, dependency]

const modules = new Map<string, AnyDiagramModule>(BUILT_IN_DIAGRAMS.map((m) => [m.key, m]))

/** Adds (or replaces) the renderer for a view type, e.g. an extension's "ownership/team-map". */
export function registerDiagram(module: AnyDiagramModule) {
  modules.set(module.key, module)
}

/** The renderer for a view, if one is registered. */
export function diagramFor(view: View): AnyDiagramModule | undefined {
  return modules.get(viewKey(view))
}

export function diagramByKey(key: string): AnyDiagramModule | undefined {
  return modules.get(key)
}
