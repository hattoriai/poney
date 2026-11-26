import type { View } from '@poney/core'
import { viewKey, type AnyDiagramModule } from './types'

const modules = new Map<string, AnyDiagramModule>()

export function registerDiagram(module: AnyDiagramModule) {
  modules.set(module.key, module)
}

export function diagramFor(view: View): AnyDiagramModule | undefined {
  return modules.get(viewKey(view))
}

export function diagramByKey(key: string): AnyDiagramModule | undefined {
  return modules.get(key)
}
