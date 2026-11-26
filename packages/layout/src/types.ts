export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

/**
 * A positioned scene: the output of a layout engine and the only input of a
 * renderer. Anchors map ref keys to rectangles so the canvas can frame any
 * element by its semantic identity.
 */
export interface SceneBase {
  width: number
  height: number
  anchors: Record<string, Rect>
}
