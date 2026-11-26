import { describe, expect, it } from 'vitest'
import { parseDocument } from '@hattoriai/poney-core'
import { commerce } from '@hattoriai/poney-examples'
import { ownership } from '@hattoriai/poney-ext-ownership'
import { layoutView } from './scenes'

const doc = parseDocument(commerce, { extensions: [ownership] })

describe('every core view lays out', () => {
  for (const view of doc.views.filter((v) => v.type !== 'extension')) {
    it(`${view.id} (${view.type})`, async () => {
      const scene = await layoutView(doc, view)
      expect(scene.width).toBeGreaterThan(100)
      expect(scene.height).toBeGreaterThan(100)
      const numbers = JSON.stringify(scene).match(/-?\d+(\.\d+)?(e[-+]?\d+)?|NaN|null/g) ?? []
      expect(numbers).not.toContain('NaN')
      expect(Object.keys(scene.anchors).length).toBeGreaterThan(0)
    })
  }
})
