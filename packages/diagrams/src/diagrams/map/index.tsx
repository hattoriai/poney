/** @jsxRuntime automatic */
/** @jsxImportSource @hattoriai/poney-diagrams */
import { useMemo, useLocal } from '../../runtime'
import { LUCIDE } from '../../icons'
import { marksOf, walkthroughsShowing, type ViewOf } from '@hattoriai/poney-core'
import type { MapScene } from '@hattoriai/poney-layout'
import { MapStory } from '../../MapStory'
import { StoryProvider } from '../../context'
import { useRenderIndex, useViewState } from '../../render'
import type { DiagramModule } from '../types'

type View = ViewOf<'map'>

/** In the explorer a map shows the system after its latest change, with nothing dimmed. */
function Renderer({ scene, view }: { scene: MapScene; view: View }) {
  const doc = useRenderIndex().doc
  const [hot, setHot] = useLocal<string | null>(`map:${view.id}:hot`, null)
  const w = walkthroughsShowing(doc, view.id)[0]
  const [ui, update] = useViewState(view.id)
  const collapsed = ui.collapsed
  const value = useMemo(
    () => ({
      marks: w ? marksOf(w) : new Map(),
      mode: 'after' as const,
      focus: null,
      callouts: new Map(),
      hot,
      setHot,
      toggleGroup: (id: string) => {
        const base = collapsed ?? view.collapsed
        update({ collapsed: base.includes(id) ? base.filter((x) => x !== id) : [...base, id] })
      },
    }),
    [w, hot, collapsed, view, update],
  )
  return (
    <StoryProvider value={value}>
      <MapStory scene={scene} />
    </StoryProvider>
  )
}

export const map: DiagramModule<View, MapScene> = {
  key: 'map',
  label: 'Map',
  icon: LUCIDE.map,
  howToRead: 'A picture of how parts connect. A part drawn inside another belongs to it; open or close a group with its round button. Hover a line to read what it does.',
  Renderer,
}
