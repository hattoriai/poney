/** @jsxRuntime automatic @jsxImportSource react */
import type { Entity, View } from '@hattoriai/poney-core'
import type { MapScene, SceneBase, SequenceScene, StateScene } from '@hattoriai/poney-layout'
import { MapStory } from './MapStory'
import { SequenceStory } from './SequenceStory'
import { StateStory } from './StateStory'
import { EmphasisOver, EmphasisUnder } from './emphasis'

/** Draws a map, sequence or state scene in the story style, with its effects, badges and trace. */
export function SceneStory({ view, scene, extra }: { view: View; scene: SceneBase; extra?: Entity[] }) {
  const body =
    view.type === 'map' ? <MapStory scene={scene as MapScene} extra={extra} /> : view.type === 'sequence' ? <SequenceStory scene={scene as SequenceScene} /> : view.type === 'state' ? <StateStory scene={scene as StateScene} /> : null
  if (!body) return null
  return (
    <g>
      <EmphasisUnder scene={scene} view={view} />
      {body}
      <EmphasisOver scene={scene} view={view} />
    </g>
  )
}
