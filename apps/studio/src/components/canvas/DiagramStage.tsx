import { useMemo } from 'react'
import { onDiagramContextMenu } from '@/features/context'
import type { View } from '@hattoriai/poney-core'
import { byTarget, useOverlayFacts } from '@/features/overlays'
import { Puzzle } from 'lucide-react'
import { diagramFor, EmphasisOver, StoryProvider, viewKey } from '@hattoriai/poney-react'
import { TOOLS } from '@/renderers/tools'
import { useScene } from '@/renderers/useScene'
import { Canvas } from './Canvas'

/** Lays out a view and hands the scene to its renderer inside the canvas. */
export function DiagramStage({ view }: { view: View }) {
  const module = diagramFor(view)
  if (!module) return <UnknownView view={view} />
  return <Stage view={view} />
}

function Stage({ view }: { view: View }) {
  const module = diagramFor(view)!
  const { scene, error } = useScene(view)
  // Live facts (test coverage, recent changes) on the boxes, drawn over the diagram as in walkthrough scenes.
  const facts = useOverlayFacts()
  const story = useMemo(
    () => ({ marks: new Map(), mode: 'after' as const, focus: null, callouts: new Map(), hot: null, setHot: () => {}, effects: byTarget(facts.effects), badges: byTarget(facts.badges) }),
    [facts],
  )
  if (error)
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="max-w-md rounded-xl border border-rule bg-raised p-5">
          <h2 className="text-[15px] font-semibold">This diagram could not be laid out</h2>
          <p className="mt-1 text-ink-2">{error}</p>
        </div>
      </div>
    )
  if (!scene)
    return (
      <div className="grid h-full place-items-center text-ink-3" role="status">
        Arranging {view.title.toLowerCase()}…
      </div>
    )
  const { Renderer, initialView } = module
  const Tools = TOOLS[viewKey(view)]
  return (
    <div className="fade-in h-full" onContextMenu={onDiagramContextMenu(view.id)}>
      <Canvas viewId={view.id} scene={scene} label={`${view.title}, ${module.label.toLowerCase()} diagram`} tools={Tools ? <Tools view={view} /> : undefined} initial={initialView}>
        <Renderer scene={scene} view={view} />
        {(facts.effects.length > 0 || facts.badges.length > 0) && (
          <StoryProvider value={story}>
            <EmphasisOver scene={scene} view={view} />
          </StoryProvider>
        )}
      </Canvas>
    </div>
  )
}

function UnknownView({ view }: { view: View }) {
  const name = view.type === 'extension' ? view.extension.split('/')[0] : view.type
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="max-w-md text-center">
        <Puzzle className="mx-auto text-ink-3" size={28} />
        <h2 className="mt-3 text-[16px] font-semibold">This studio cannot draw “{view.title}”</h2>
        <p className="mt-1.5 text-ink-2">
          The view uses the <strong>{name}</strong> extension, which is not installed here. Its data stays in the document and is kept when you export it.
        </p>
      </div>
    </div>
  )
}
