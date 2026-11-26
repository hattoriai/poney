/**
 * @poney/layout — positions Poney diagrams.
 *
 * Input: a validated document and a view. Output: a scene — plain numbers
 * (rectangles, routed points, label positions) with anchors keyed by the
 * model's refs. Any renderer can draw a scene: React/SVG (the studio),
 * static SVG on a server, Canvas or WebGL.
 */
export * from './types'
export * from './geometry'
export * from './text'
export * from './elk'
export * from './scenes'
