/**
 * Diagram renderers for every core view type: architecture, map, sequence,
 * data flow, activity, ERD, state, use case and dependency. Each draws a
 * scene laid out by @hattoriai/poney-layout as SVG, in any React app or headless.
 * Interaction, selection and view state come from the host through
 * RenderProvider; without one, a diagram is a still picture.
 */
export { BUILT_IN_DIAGRAMS, registerDiagram, diagramFor, diagramByKey } from './registry'
export { viewKey, type DiagramModule, type AnyDiagramModule } from './types'
export { EntityNode, Rings, useReadableSize } from './shared/EntityNode'
export { EdgeLabel, EdgeLine, type Head as EdgeHead } from './shared/Edge'
export { LegendRow, LegendShape } from './shared/Legend'
