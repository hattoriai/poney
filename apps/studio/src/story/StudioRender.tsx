import type { ReactNode } from 'react'
import { RenderProvider } from '@poney/react'
import { useIndex } from '@/features/store'
import { useBind } from '@/renderers/shared/interaction'

/** Gives story renderers the studio's model and its selection and hover binding. */
export function StudioRender({ children }: { children: ReactNode }) {
  const idx = useIndex()
  const bind = useBind()
  return <RenderProvider value={{ idx, bind }}>{children}</RenderProvider>
}
