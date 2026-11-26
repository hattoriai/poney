import { onDiagramContextMenu } from '@/features/context'
import type { View } from '@poney/core'
import { Puzzle } from 'lucide-react'
import { diagramFor } from '@/renderers/registry'
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
  const { Renderer, Tools, initialView } = module
  return (
    <div className="fade-in h-full" onContextMenu={onDiagramContextMenu(view.id)}>
      <Canvas viewId={view.id} scene={scene} label={`${view.title}, ${module.label.toLowerCase()} diagram`} tools={Tools ? <Tools view={view} /> : undefined} initial={initialView}>
        <Renderer scene={scene} view={view} />
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
