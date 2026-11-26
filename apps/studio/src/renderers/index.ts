import { registerDiagram } from './registry'
import { architecture } from './architecture'
import { sequence } from './sequence'
import { dataflow } from './dataflow'
import { activity } from './activity'
import { erd } from './erd'
import { state } from './state'
import { usecase } from './usecase'
import { dependency } from './dependency'
import { map } from './map'

/** The eight core diagram types. Extensions register more. */
export function registerBuiltInDiagrams() {
  ;[architecture, map, sequence, dataflow, activity, erd, state, usecase, dependency].forEach(registerDiagram)
}
