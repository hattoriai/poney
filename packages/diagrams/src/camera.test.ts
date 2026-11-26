import { describe, expect, it } from 'vitest'
import { panViewBox, zoomViewBox } from './scene'

const base = { x: 0, y: 0, w: 1000, h: 500 }

describe('the camera', () => {
  it('zooms around a point, which stays where it is on the screen', () => {
    const next = zoomViewBox(base, base, 2, 0.25, 0.5)
    expect(next).toEqual({ x: 125, y: 125, w: 500, h: 250 })
    // The point at a quarter of the width and half the height is the same point of the scene.
    expect(next.x + 0.25 * next.w).toBe(base.x + 0.25 * base.w)
    expect(next.y + 0.5 * next.h).toBe(base.y + 0.5 * base.h)
  })

  it('stays between 6 times closer and 4 times farther than the frame', () => {
    expect(zoomViewBox(base, base, 100).w).toBeCloseTo(1000 / 6)
    expect(zoomViewBox(base, base, 1 / 100).w).toBe(4000)
  })

  it('pans with the pointer, in the units of the scene', () => {
    // On a stage 500 px wide, 50 px is a tenth of the box: 100 units of a box 1000 wide.
    expect(panViewBox(base, 50, -25, 500, 250)).toEqual({ x: -100, y: 50, w: 1000, h: 500 })
  })
})
