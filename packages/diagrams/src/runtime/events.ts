/**
 * The events a renderer's handlers read. DOM events and React's events both
 * have this shape, so the same handler works in any host.
 */
export interface PoneyEvent {
  stopPropagation(): void
  preventDefault(): void
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}
export interface PoneyMouseEvent extends PoneyEvent {
  clientX: number
  clientY: number
  detail: number
}
export interface PoneyKeyboardEvent extends PoneyEvent {
  key: string
}
