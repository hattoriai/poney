import { useMemo, useState } from 'react'
import { Map as MapIcon } from 'lucide-react'
import { marksOf, walkthroughsShowing, type ViewOf } from '@poney/core'
import type { MapScene } from '@poney/layout'
import { useDoc, useStudio } from '@/features/store'
import { MapStory, StoryProvider } from '@poney/react'
import { StudioRender } from '@/story/StudioRender'
import type { DiagramModule } from '../types'

type View = ViewOf<'map'>

/** In the explorer a map shows the system after its latest change, with nothing dimmed. */
function Renderer({ scene, view }: { scene: MapScene; view: View }) {
  const doc = useDoc()
  const [hot, setHot] = useState<string | null>(null)
  const w = walkthroughsShowing(doc, view.id)[0]
  const collapsed = useStudio((s) => s.viewUi[view.id]?.collapsed)
  const updateViewUi = useStudio((s) => s.updateViewUi)
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
        updateViewUi(view.id, { collapsed: base.includes(id) ? base.filter((x) => x !== id) : [...base, id] })
      },
    }),
    [w, hot, collapsed, view, updateViewUi],
  )
  return (
    <StudioRender>
      <StoryProvider value={value}>
        <MapStory scene={scene} />
      </StoryProvider>
    </StudioRender>
  )
}

export const map: DiagramModule<View, MapScene> = {
  key: 'map',
  label: 'Map',
  icon: MapIcon,
  howToRead: 'A picture of how parts connect. A part drawn inside another belongs to it; open or close a group with its round button. Hover a line to read what it does.',
  Renderer,
}
