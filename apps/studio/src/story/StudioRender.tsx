import { useMemo, type ReactNode } from 'react'
import { RenderProvider, type RenderValue } from '@hattoriai/poney-react'
import { useIndex, useStudio } from '@/features/store'
import { useBind } from '@/features/interaction'

/**
 * The Studio as the host of @hattoriai/poney-react renderers: its model, its selection
 * and hover, its element binding (click, rename, context menu, pointing for
 * the agent), and the view state it keeps (open groups, expanded tables).
 */
export function StudioRender({ children }: { children: ReactNode }) {
  const idx = useIndex()
  const bind = useBind()
  const selection = useStudio((s) => s.selection)
  const hover = useStudio((s) => s.hover)
  const viewUi = useStudio((s) => s.viewUi)
  const setViewState = useStudio((s) => s.updateViewUi)
  const value = useMemo<RenderValue>(() => ({ idx, bind, selection, hover, viewState: (id) => viewUi[id], setViewState }), [idx, bind, selection, hover, viewUi, setViewState])
  return <RenderProvider value={value}>{children}</RenderProvider>
}
